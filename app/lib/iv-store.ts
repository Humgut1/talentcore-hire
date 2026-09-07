/* =========================================================
   Cadence — 면접(interview) 인메모리 저장소
   ---------------------------------------------------------
   마이그레이션 010 이 만든 표 4개(interviews / interview_parts /
   interview_slots / interview_events)를 프로세스 안에 그대로 담는다.

   왜 data.ts 가 아니라 별도 파일인가:
     · data.ts 는 "데모 시드"가 본체다. 면접은 시드가 아니라 DB 가 주인이고,
       하이드레이트가 없으면 비어 있는 게 정상이다. 성격이 달라 섞지 않았다.
     · 대신 규약은 data.ts 와 똑같이 맞췄다 — export let + _set / _patch 계열로만
       바꾸고, 화면·엔진은 읽기만 한다.

   시간 표현은 엔진(schedule.ts)과 같다: 날짜 'YYYY-MM-DD' + 자정으로부터의 분.
   ========================================================= */

import type { Status } from './data'

/** 면접 진행 상태(=DB interviews.st). 조율이 어디까지 갔는지. */
export type IvState = 'draft' | 'searching' | 'proposed' | 'confirmed' | 'done' | 'canceled'
/** 면접 형태. solo = 1명, seq = 여러 명을 이어서(2차 120분 연속). */
export type IvKind = 'solo' | 'seq'
/** 면접관 자리의 출처. 요청서에서 내려온 자리인지, 손으로 넣은 자리인지. */
export type IvSrc = 'hm' | 'upper' | 'collab' | 'manual'
/** 면접관 응답. 동시 발송이라 '거절'을 반드시 받아 적어야 한다. */
export type IvResp = 'none' | 'accepted' | 'declined'

export interface Interview {
  id: string
  cid: string            // 후보자
  pid: string            // 공고
  sid: string            // 단계
  round: number          // 1 = 1차, 2 = 2차
  kind: IvKind
  totalMin: number       // 전체 길이(2차 seq 는 120)
  st: IvState
  s: Status              // 카드 색(idle/esc/late/done)
  why: string            // 한 줄 이유 — 카드에 그대로 뜬다
  date?: string          // 확정된 날짜
  start?: number         // 확정 시작(분)
  end?: number
  mode?: string          // '화상' / '대면'
  loc?: string           // 링크 또는 장소
  sentAt?: string        // 후보자에게 슬롯 보낸 시각
  repliedAt?: string
  holdUntil?: string     // 가예약 만료(hold_h 시간 뒤)
  seniorAck?: boolean    // 실장(L8)+ 포함 건을 RC 가 확인했는가
  token?: string         // 후보자 선택 링크의 열쇠
  evId?: string          // 캘린더 일정 id
}

export interface IvPart {
  iid: string
  ord: number            // 0 = 첫 번째, 1 = 두 번째
  uid?: string           // people.id — 아직 못 정했으면 비어 있다
  nm: string             // 이름(사람이 바뀌어도 기록은 남게 복사해 둔다)
  role: string           // '차상위 리더' 등 화면에 뜨는 말
  src: IvSrc
  level?: number         // TalentCore 직급. 실장(8)+ 이면 발송 전 확인 모달
  offMin: number         // 면접 시작으로부터 몇 분 뒤에 이 사람 차례인가 (0, 60 …)
  dur: number            // 이 사람 몫 길이(분)
  resp: IvResp
  respAt?: string
  code?: string          // 거절 사유 코드
  memo?: string
  evId?: string
}

export interface IvSlot {
  id?: number
  iid: string
  ord: number
  date: string
  start: number
  end: number
  st: 'offered' | 'picked' | 'dropped' | 'expired'
  note?: string          // 'unknown' = 직전/직후 일정 성격이 불명이라 이동시간을 풀고 잡은 슬롯
  holdIds?: string[]     // 가예약으로 만든 캘린더 일정들
  holdUntil?: string
}

export interface IvEvent {
  id?: number
  iid: string
  at: string             // 사람이 읽는 시각 라벨('8/12 14:20')
  b: string              // 굵게 나오는 제목
  p: string              // 본문
  s: string              // 색
  who?: string
}

export let interviews: Interview[] = []
export let ivParts: Record<string, IvPart[]> = {}
export let ivSlots: Record<string, IvSlot[]> = {}
export let ivEvents: Record<string, IvEvent[]> = {}

/* ---- 하이드레이트(db.ts 가 부른다). undefined 인 항목은 건드리지 않는다 ---- */
export function _setIv(d: Partial<{
  interviews: Interview[]
  parts: Record<string, IvPart[]>
  slots: Record<string, IvSlot[]>
  events: Record<string, IvEvent[]>
}>) {
  if (d.interviews) interviews = d.interviews
  if (d.parts) ivParts = d.parts
  if (d.slots) ivSlots = d.slots
  if (d.events) ivEvents = d.events
}

/* ---- 액션이 부르는 부분 수정 — DB 저장과 나란히 호출한다 ----
   DB 가 없어도 화면이 즉시 바뀌게 하려는 것(data.ts 의 _patch* 와 같은 뜻). */
export function _patchIv(id: string, patch: Partial<Interview>) {
  interviews = interviews.map(v => (v.id === id ? { ...v, ...patch } : v))
}
export function _addIv(v: Interview, parts: IvPart[] = []) {
  interviews = [...interviews.filter(x => x.id !== v.id), v]
  if (parts.length) ivParts = { ...ivParts, [v.id]: parts }
}
export function _setIvSlots(iid: string, list: IvSlot[]) {
  ivSlots = { ...ivSlots, [iid]: list }
}
export function _patchIvPart(iid: string, ord: number, patch: Partial<IvPart>) {
  const cur = ivParts[iid]
  if (!cur) return
  ivParts = { ...ivParts, [iid]: cur.map(p => (p.ord === ord ? { ...p, ...patch } : p)) }
}
export function _pushIvEvent(iid: string, e: IvEvent) {
  ivEvents = { ...ivEvents, [iid]: [...(ivEvents[iid] || []), e] }
}

/* ---- 읽기 도우미 ---- */
export const ivById = (id: string) => interviews.find(v => v.id === id)
export const partsOf = (iid: string) => (ivParts[iid] || []).slice().sort((a, b) => a.ord - b.ord)
export const slotsOf = (iid: string) => (ivSlots[iid] || []).slice().sort((a, b) => a.ord - b.ord)
export const eventsOf = (iid: string) => ivEvents[iid] || []
/** 후보자의 해당 회차 면접. 같은 후보자·같은 회차는 DB 에서도 1건만 허용한다. */
export const ivOf = (cid: string, round: number) =>
  interviews.find(v => v.cid === cid && v.round === round)
/** 후보자의 면접 전부(회차 순). */
export const ivsOfCand = (cid: string) =>
  interviews.filter(v => v.cid === cid).sort((a, b) => a.round - b.round)
/** 이 사람이 면접관으로 들어간 면접들. 주간 상한을 셀 때 쓴다. */
export const ivsOfInterviewer = (uid: string) =>
  interviews.filter(v => partsOf(v.id).some(p => p.uid === uid))
