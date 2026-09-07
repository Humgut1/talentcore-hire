/* =========================================================
   Cadence — 면접 조율의 판단 규칙 (순수 함수 · 서버/클라이언트 공용)
   ---------------------------------------------------------
   "보내도 되는가 / 보낸 뒤 무엇이 바뀌는가 / 거절되면 다음 수는 무엇인가"만 담는다.
   DB 쓰기·캘린더 호출은 여기 없다(iv-actions.ts). 규칙만 떼어 놓은 이유는
   화면에서도 같은 판단을 그대로 보여 주기 위해서다 — 버튼을 눌러 봐야
   막히는 게 아니라, 누르기 전에 왜 막히는지가 먼저 뜬다.
   ========================================================= */

import type { IvPolicy } from './data'
import type { IvPlan, SeqSlot } from './schedule'
import type { Interview, IvPart, IvSlot } from './iv-store'

/* ---- 면접관 거절 사유 ----
   동시 발송(parallel)이라 '거절'을 반드시 받아 적어야 한다.
   사유마다 코디네이터가 바로 누를 다음 수가 다르다. */
export type DeclineCode = 'conflict' | 'calendar_missing' | 'travel' | 'other'
export const DECLINE: Record<DeclineCode, { nm: string; act: string[] }> = {
  conflict:         { nm: '그 시간에 다른 일정', act: ['다른 시간 재탐색'] },
  calendar_missing: { nm: '캘린더에 없던 일정',  act: ['가용시간 다시 받기', '다른 시간 재탐색'] },
  travel:           { nm: '이동·외부 일정',      act: ['이동시간 늘려 재탐색'] },
  other:            { nm: '기타',               act: ['코디네이터 확인'] },
}
export const DECLINE_LIST = Object.entries(DECLINE).map(([code, d]) => ({ code: code as DeclineCode, ...d }))

/* ---- 발송 게이트 ---- */
export type SendBlock =
  | 'no-interviewer'  // 면접관이 없다
  | 'coordinator'     // EA 가 껴 있다 → 사람이 직접
  | 'empty'           // 가능한 자리가 0개
  | 'senior-ack'      // 실장급 포함 → RC 가 한 번 확인해야 한다
  | 'week-cap'        // 주간 상한을 '막기'로 둔 경우에만
export interface SendGate {
  ok: boolean
  block?: SendBlock
  msg: string        // 막힌 이유(또는 보낼 내용 요약)
  warn: string[]     // 막지는 않지만 알려야 할 것들
  ack?: string[]     // 'senior-ack' 일 때 확인 모달에 띄울 이름
}

export function sendGate(iv: Interview, plan: IvPlan, pol: IvPolicy): SendGate {
  const warn: string[] = []
  const un = plan.slots.filter(s => s.note === 'unknown').length
  if (plan.slots.length && !plan.enough)
    warn.push(`보낼 자리가 ${plan.slots.length}개뿐입니다(권장 ${pol.slotMin}개).`)
  if (un)
    warn.push(`직전·직후 일정의 성격을 알 수 없어 이동시간을 빼고 잡은 자리가 ${un}건 섞여 있습니다. 확인하고 보내세요.`)
  if (plan.capWarn.length && !plan.capBlock)
    warn.push(`${plan.capWarn.join('·')} 님은 그 주에 이미 면접이 ${pol.weekCap}건 잡혀 있습니다.`)

  if (plan.kind === 'no-interviewer')
    return { ok: false, block: 'no-interviewer', msg: '면접관이 지정되지 않았습니다.', warn }
  if (plan.kind === 'coordinator')
    return { ok: false, block: 'coordinator', warn,
             msg: `${(plan.eaNames || []).join('·')} 님은 비서를 통해 잡는 분입니다 — 코디네이터가 직접 조율합니다.` }
  if (plan.kind === 'empty')
    return { ok: false, block: 'empty', warn,
             msg: `${plan.scanned}일을 훑었지만 가능한 자리가 없습니다 — 탐색 범위를 넓히거나 수동으로 조율하세요.` }
  if (plan.capBlock && plan.capWarn.length)
    return { ok: false, block: 'week-cap', warn,
             msg: `${plan.capWarn.join('·')} 님이 주간 상한(${pol.weekCap}건)을 넘습니다.` }
  if (plan.seniorNames.length && !iv.seniorAck)
    return { ok: false, block: 'senior-ack', warn, ack: plan.seniorNames,
             msg: `${plan.seniorNames.join('·')} 님이 포함돼 있습니다. 이대로 보낼까요?` }

  return { ok: true, warn, msg: `자리 ${plan.slots.length}개를 후보자와 면접관에게 함께 보냅니다.` }
}

/** 발송할 자리를 고른다 — 화면에서 안 고르면 앞에서부터 권장 개수만큼. */
export function pickToSend(slots: SeqSlot[], pol: IvPolicy, picks?: number[]): SeqSlot[] {
  if (picks?.length) return picks.map(i => slots[i]).filter(Boolean)
  const want = Math.max(pol.slotMin, Math.min(pol.slotMax, slots.length))
  const out: SeqSlot[] = []
  // 16:00 과 16:30 을 같이 보내면 후보자에겐 사실상 선택지가 하나다.
  // 그래서 ① 서로 다른 날에서 하나씩 → ② 그래도 모자라면 겹치지 않는 자리만 채운다.
  for (const s of slots) {
    if (out.length >= want) break
    if (!out.some(o => o.date === s.date)) out.push(s)
  }
  for (const s of slots) {
    if (out.length >= want) break
    if (out.includes(s)) continue
    if (out.some(o => o.date === s.date && s.start < o.end && s.end > o.start)) continue
    out.push(s)
  }
  return out.sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1))
}

/* =========================================================
   벌크(선착순) — 여러 후보자에게 같은 자리를 함께 낸다
   ---------------------------------------------------------
   방식은 공용 풀이다. 한 무리(같은 공고·같은 단계)에게 **똑같은 자리 목록**을 보내고,
   먼저 고른 사람이 가져간다. 후보자 화면에는 남의 존재를 절대 드러내지 않는다 —
   이미 나간 자리는 그냥 목록에 없다.

   그래서 '자리가 몇 개인가'를 정직하게 세는 일이 이 방식의 전부다.
   ========================================================= */

/** 동시에 성립할 수 있는 자리 수.
    16:00 과 16:30 은 자리 2개가 아니다 — 한 명이 가져가면 나머지는 사라진다.
    벌크에서 '찾은 자리 8개'를 그대로 믿으면 실제로는 4명도 못 넣는 일이 생긴다. */
export function compatCount(slots: SeqSlot[], pol: IvPolicy): number {
  if (!slots.length) return 0
  return pickToSend(slots, { ...pol, slotMin: 0, slotMax: slots.length }).length
}

/** 한 무리에게 함께 낼 공용 풀.
    n−1 명이 먼저 가져가도 마지막 사람이 여전히 권장 개수를 보도록 사람 수만큼 더 담는다. */
export function poolFor(slots: SeqSlot[], pol: IvPolicy, n: number): SeqSlot[] {
  return pickToSend(slots, { ...pol, slotMax: pol.slotMax + Math.max(0, n - 1) })
}

export type BulkBlock = 'short' | 'empty' | 'blocked'
export interface BulkGate {
  ok: boolean
  block?: BulkBlock
  msg: string
  warn: string[]
  /** 겹치지 않는 자리 수 / 권장 자리 수 — 화면이 그대로 쓴다. */
  seats: number
  want: number
}

/* 자리가 사람보다 적으면 **보내면 안 된다**. 경고하고 승인받을 일이 아니라,
   몇 명은 반드시 실패한다는 계산이 이미 끝난 상태다. 자리를 더 찾아 오는 게 맞다.
   1.5배는 그 위의 넛지 — 못 잡는 사람은 없지만, 뒤에 고르는 사람의
   선택지가 한두 개로 쪼그라드는 구간이라 알려만 준다. */
export function bulkGate(nCand: number, seats: number, blocked: string[] = []): BulkGate {
  const want = Math.ceil(nCand * 1.5)
  const warn: string[] = []
  if (blocked.length)
    warn.push(`${blocked.join('·')} 님 건은 자동 조율에서 빠집니다 — 따로 조율하세요.`)

  if (!nCand)
    return { ok: false, block: 'blocked', msg: '보낼 후보자를 고르세요.', warn, seats, want }
  if (!seats)
    return { ok: false, block: 'empty', seats, want, warn,
             msg: '가능한 자리가 없습니다 — 범위를 넓혀 다시 찾으세요.' }
  if (seats < nCand)
    return { ok: false, block: 'short', seats, want, warn,
             msg: `자리 ${seats}개 · 후보자 ${nCand}명 — ${nCand - seats}명은 자리를 못 잡습니다. ` +
                  '범위를 넓혀 자리를 더 찾은 뒤에 보내세요.' }
  if (seats < want)
    warn.push(`자리 ${seats}개 · 후보자 ${nCand}명 — 권장은 ${want}개입니다. ` +
              '뒤에 고르는 분은 선택지가 한두 개뿐일 수 있습니다.')
  return { ok: true, seats, want, warn,
           msg: `후보자 ${nCand}명에게 같은 자리 ${seats}개를 함께 보냅니다 — 먼저 고른 분이 가져갑니다.` }
}

/** 보낼 자리 → DB 에 넣을 슬롯 줄. */
export function slotRows(iid: string, chosen: SeqSlot[], holdUntil: string): IvSlot[] {
  return chosen.map((s, i) => ({
    iid, ord: i, date: s.date, start: s.start, end: s.end,
    st: 'offered' as const,
    ...(s.note ? { note: s.note } : {}),
    holdUntil,
  }))
}

/* ---- 후보자가 하나를 골랐을 때 ---- */
export interface PickResult {
  picked: IvSlot
  dropped: IvSlot[]        // 가예약을 풀어야 하는 나머지
  patch: Partial<Interview>
}
export function pickResult(slots: IvSlot[], ord: number, at: string): PickResult | null {
  const picked = slots.find(s => s.ord === ord && s.st === 'offered')
  if (!picked) return null
  return {
    picked,
    dropped: slots.filter(s => s.ord !== ord && s.st === 'offered'),
    patch: {
      st: 'confirmed', s: 'done',
      date: picked.date, start: picked.start, end: picked.end,
      repliedAt: at, holdUntil: undefined,
      why: '후보자가 시간을 선택해 확정됐습니다.',
    },
  }
}

/* ---- 면접관이 거절했을 때 ----
   동시 발송이라 한 명이 거절해도 나머지는 이미 받은 상태다.
   그래서 면접을 되돌리지 않고 '사람 대기'로 올려 코디네이터가 판단하게 한다. */
export interface DeclineResult { patch: Partial<Interview>; act: string[] }
export function declineResult(part: IvPart, code: DeclineCode): DeclineResult {
  const d = DECLINE[code]
  return {
    patch: { s: 'esc', why: `${part.nm} 님 불가 — ${d.nm}` },
    act: d.act,
  }
}

/* ---- 가예약 만료 ----
   48시간 안에 후보자가 안 고르면 자리를 풀어 준다. 면접관 캘린더를
   무한정 잡아 두는 게 조율에서 가장 크게 미움받는 지점이라 반드시 정리한다. */
export function isExpired(iv: Interview, nowIso: string): boolean {
  return iv.st === 'proposed' && !!iv.holdUntil && iv.holdUntil < nowIso
}
export const EXPIRE_PATCH: Partial<Interview> = {
  st: 'searching', s: 'late',
  why: '가예약 48시간이 지나 자리를 풀었습니다 — 다시 잡아야 합니다.',
}

/* ---- 기록 한 줄 만들기 ---- */
export function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
