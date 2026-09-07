/* =========================================================
   Cadence — 공고 단위 내부 미팅 (킥오프 · 디브리프)
   ---------------------------------------------------------
   경쟁사 조사 근거:
   · Greenhouse 의 "Kickoff / Intake meeting" 은 공고를 열 때 리크루터와 HM 이
     기준을 맞추는 자리다. 문제는 실제 현장에서 이 미팅이 자꾸 미뤄지고,
     결국 첫 면접이 기준 없이 진행된다는 것.
   · Ashby 는 "Debrief" 를 <자동으로> 잡는다. 마지막 라운드가 끝나면 참석자를
     모아 30분을 밀어 넣는다. 사람이 기억해서 잡는 미팅은 잡히지 않는다는
     전제에서 나온 설계다.
   · 두 제품의 공통점이 하나 있다: 미팅을 <후보자 단계>가 아니라 <공고>에 매단다.
     후보자마다 디브리프를 열면 같은 사람들이 같은 주에 세 번 모이게 된다.

   이 모듈이 정하는 것은 딱 두 가지다.
     ① 언제 이 미팅이 '필요해졌는가' (트리거)
     ② 지금 막혀 있는 곳이 어디인가  (참석자 미지정 / 시간 미확정)
   나머지(슬롯 탐색·확정)는 기존 스케줄 엔진(schedule.ts)이 그대로 한다.

   트리거를 이렇게 잡은 이유:
   · 킥오프 = <첫 인터뷰 단계에 처음으로 사람이 도달했을 때>.
     기능 설계서의 "1차 최초 합격자"를 '1차를 통과한 사람'으로 읽으면 킥오프가
     1차보다 뒤에 열린다 — 기준을 맞추는 미팅이 기준이 쓰인 뒤에 열리는 셈이라
     열 이유가 없어진다. 그래서 '1차에 올라온 사람'으로 읽는다.
   · 디브리프 = <마지막 인터뷰 단계를 끝낸 사람이 처음 생겼을 때>. 공고당 1회.
     확정한 뒤에 또 끝낸 사람이 생기면 '함께 다룰지'만 알린다(미팅을 더 만들지 않는다).

   ※ 서버·클라이언트 양쪽에서 import 한다. I/O 없이 계산만 한다.
   ========================================================= */
import {
  cands, stagesOf, posById, personById, personByName, people, positions,
  meetings, inboxItems, TODAY, daysSince, md,
  type Meeting, type Status, type Stage, type InboxItem, type Person,
} from './data'

export type MtgKind = 'kickoff' | 'debrief' | 'other'

/* 지금 막힌 곳. 화면은 이 값 하나만 보고 무엇을 보여줄지 정한다. */
export type MtgPhase =
  | 'pending'    // 트리거 전 — 아직 할 일 없음
  | 'attendees'  // 참석자 미지정 (HM 이 풀어야 하는 자리)
  | 'time'       // 참석자는 정해졌고 시간이 없음 (코디네이터가 풀 자리)
  | 'manual'     // EA 참석자 포함 → 자동 탐색 제외, 수동 조율
  | 'set'        // 시간 확정
  | 'done'       // 지난 미팅

/* 48시간 미지정이면 에스컬레이션(기능 설계서 F-3).
   원 데이터가 '일' 단위라 시간은 일×24 로만 안다 — 화면에도 그 이상 정밀하게 쓰지 않는다. */
export const ASSIGN_SLA_H = 48
export const MTG_DUR = 30

export interface MtgView {
  id: string
  kind: MtgKind
  nm: string
  dur: number
  phase: MtgPhase
  s: Status
  /* 트리거 */
  fired: boolean
  by?: string          // 무엇이 이 미팅을 필요하게 만들었는지 (사람 + 단계)
  sinceD?: number      // 트리거된 지 며칠
  ag: string           // 경과 라벨 ('48h' / '3d' / '—')
  /* 참석자 */
  who: string[]        // 지정된 참석자(이름 — 저장 형식)
  uids: string[]       // 그중 사람으로 해석된 id
  unknown: string[]    // 이름은 있는데 명부에 없는 사람 (탐색에서 빠진다)
  ea: string[]         // EA 조율 대상 — 있으면 자동 탐색 제외
  suggest: string[]    // 기본 제안 참석자 uid
  /* 결과 */
  v: string            // 미팅 바에 뜨는 한 줄
  act?: string[]       // 다음 한 수
  note?: string        // 확정 뒤에 생긴 변화 (디브리프 추가 완료자)
}

/* ---------------------------------------------------------
   단계 읽기
   --------------------------------------------------------- */
const ivLine = (pid: string): Stage[] =>
  stagesOf(pid).filter(s => !s.rail && s.kind === 'interview')

/** 이 단계가 파이프라인 몇 번째 칸인가 (rail 은 -1). */
function idxOf(pid: string, stId: string): number {
  const line = stagesOf(pid).filter(s => !s.rail)
  return line.findIndex(s => s.id === stId)
}

export const mtgKind = (nm: string): MtgKind =>
  nm.indexOf('킥오프') >= 0 ? 'kickoff' : nm.indexOf('디브리프') >= 0 ? 'debrief' : 'other'

/* ---------------------------------------------------------
   트리거 — 누가 이 미팅을 필요하게 만들었나
   --------------------------------------------------------- */
interface Fire { fired: boolean; by?: string; on?: string }

/** 킥오프: 첫 인터뷰 단계에 도달한 사람이 처음 생긴 시점. */
function fireKickoff(pid: string): Fire {
  const line = ivLine(pid)
  if (!line.length) return { fired: false }
  const first = line[0]
  const at = idxOf(pid, first.id)
  /* 지금 1차에 있는 사람뿐 아니라 이미 지나간 사람도 센다 —
     첫 사람이 벌써 2차로 넘어갔다고 킥오프가 사라지면 안 된다. */
  const hit = cands
    .filter(c => c.p === pid && idxOf(pid, c.st) >= at)
    .sort((a, b) => (a.en < b.en ? -1 : 1))[0]
  if (!hit) return { fired: false }
  return { fired: true, by: `${hit.nm} · ${first.nm} 도달`, on: hit.en }
}

/** 디브리프: 마지막 인터뷰 단계를 끝낸 사람이 처음 생긴 시점. */
function fireDebrief(pid: string): Fire {
  const line = ivLine(pid)
  if (!line.length) return { fired: false }
  const last = line[line.length - 1]
  const after = idxOf(pid, last.id) + 1
  const done = cands
    .filter(c => c.p === pid && idxOf(pid, c.st) >= after)
    .sort((a, b) => (a.en < b.en ? -1 : 1))
  if (!done.length) return { fired: false }
  return { fired: true, by: `${done[0].nm} · ${last.nm} 완료`, on: done[0].en }
}

/** 확정 이후에 또 끝낸 사람 — 미팅을 더 만들지 않고 알리기만 한다. */
function laterFinishers(pid: string, sinceISO: string): string[] {
  const line = ivLine(pid)
  if (!line.length) return []
  const after = idxOf(pid, line[line.length - 1].id) + 1
  return cands
    .filter(c => c.p === pid && idxOf(pid, c.st) >= after && c.en > sinceISO)
    .map(c => c.nm)
}

/* ---------------------------------------------------------
   기본 참석자 — HM 은 언제나. 나머지는 미팅 성격이 정한다.
   킥오프는 '앞으로 볼 사람들', 디브리프는 '실제로 본 사람들'.
   --------------------------------------------------------- */
export function suggestAttendees(pid: string, kind: MtgKind): string[] {
  const pos = posById(pid)
  const out: string[] = []
  const push = (uid?: string) => { if (uid && out.indexOf(uid) < 0) out.push(uid) }
  push(personByName(pos.hm)?.id)
  const line = ivLine(pid)
  if (kind === 'kickoff') (line[0]?.ivs || []).forEach(push)
  else line.forEach(s => (s.ivs || []).forEach(push))
  return out
}

/* 고를 수 있는 사람 — 재직 중인 명부 전체를 주되 이미 관련된 사람을 위로 올린다.
   부서로 잘라 보여주면 '차상위·협업 리더'(F-3 이 요구하는 사람)를 못 찾는다.

   T4 로 TalentCore 직원이 통째로 들어오면서 이 목록이 백 줄을 넘길 수 있다.
   그래서 순서를 세 단으로 세우고(관련자 → 면접 역할 있는 사람 → 나머지),
   화면 쪽에 이름으로 걸러내는 칸을 뒀다. 목록을 잘라내지는 않는다 —
   여기서 자르면 태그가 안 달린 협업 리더를 부를 방법이 사라진다.
   퇴사자만 뺀다. 퇴사자는 회의에 부를 수 없다. */
export interface PoolRow { uid: string; nm: string; tt: string; rel: boolean }
export function attendeePool(pid: string): PoolRow[] {
  const rel = new Set(suggestAttendees(pid, 'debrief'))
  const recId = personByName(posById(pid).rec)?.id
  if (recId) rel.add(recId)
  const rank = (p: Person) =>
    rel.has(p.id) ? 0
    : p.roles.some(r => r === '인터뷰어' || r === '하이어링 매니저' || r === '리크루터') ? 1
    : 2
  return people
    .filter(p => p.active !== false)
    .map(p => ({ uid: p.id, nm: p.nm, tt: p.tt, rel: rel.has(p.id), _r: rank(p) }))
    .sort((a, b) => a._r - b._r)
    .map(({ uid, nm, tt, rel: r }) => ({ uid, nm, tt, rel: r }))
}

/* ---------------------------------------------------------
   저장된 v 문자열 읽기 — 표에 컬럼을 늘리지 않으려고 한 줄에 담는다.
   '8/13 16:00 예정' / '8/4 14:00 완료' / '참석자 미지정'
   --------------------------------------------------------- */
export interface MtgTime { date: string; min: number }
const pad = (n: number) => String(n).padStart(2, '0')

export function parseMtgTime(v: string): MtgTime | null {
  if (!v || !/예정|완료|확정/.test(v)) return null
  const d = v.match(/(\d{1,2})\/(\d{1,2})/)
  const t = v.match(/(\d{1,2}):(\d{2})/)
  if (!d || !t) return null
  return {
    date: `${TODAY.getFullYear()}-${pad(Number(d[1]))}-${pad(Number(d[2]))}`,
    min: Number(t[1]) * 60 + Number(t[2]),
  }
}

const agLabel = (d?: number): string =>
  d == null ? '—' : d < 3 ? `${d * 24}h` : `${d}d`

/* ---------------------------------------------------------
   미팅 한 건의 현재 모습
   --------------------------------------------------------- */
export function mtgView(pid: string, m: Meeting): MtgView {
  const kind = mtgKind(m.nm)
  const who = m.who || []
  const uids = who.map(n => personByName(n)?.id).filter(Boolean) as string[]
  const unknown = who.filter(n => !personByName(n))
  const ea = uids.map(personById).filter(p => p?.ea).map(p => p!.nm)
  const suggest = suggestAttendees(pid, kind)
  const t = parseMtgTime(m.v)

  const base = { id: m.id, kind, nm: m.nm, dur: m.dur || MTG_DUR, who, uids, unknown, ea, suggest }

  /* 성격을 모르는 미팅(과제 기준 정렬·보류 재검토 등)은 계산 대상이 아니다.
     저장된 값을 그대로 보여준다 — 없는 규칙을 지어내지 않는다. */
  if (kind === 'other')
    return { ...base, phase: t ? 'set' : 'attendees', s: m.s, fired: true, ag: m.ag, v: m.v, act: m.act }

  const f = kind === 'kickoff' ? fireKickoff(pid) : fireDebrief(pid)

  /* 이미 끝난 미팅은 트리거를 다시 따지지 않는다 — 지난 일이다. */
  if (/완료/.test(m.v))
    return { ...base, phase: 'done', s: 'done', fired: true, by: f.by, ag: '—', v: m.v }

  if (!f.fired)
    return {
      ...base, phase: 'pending', s: 'idle', fired: false, ag: '—',
      v: kind === 'kickoff' ? '1차 진출자 발생 시 자동 개설' : '최종 면접 완료 시 자동 개설',
    }

  const sinceD = f.on ? daysSince(f.on) : undefined
  const ag = agLabel(sinceD)
  const late = (sinceD ?? 0) * 24 >= ASSIGN_SLA_H

  /* ① 참석자가 없으면 여기서 막힌다. HM 이 풀어야 하는 자리다. */
  if (!uids.length)
    return {
      ...base, phase: 'attendees', s: late ? 'esc' : 'idle',
      fired: true, by: f.by, sinceD, ag,
      v: `참석자 미지정 · ${f.by}`, act: ['참석자 지정 요청'],
    }

  /* ② 시간이 잡혔으면 끝. 디브리프만 '그 뒤에 또 끝낸 사람'을 확인한다. */
  if (t) {
    const more = kind === 'debrief' ? laterFinishers(pid, t.date) : []
    const note = more.length
      ? `확정 뒤 완료자 ${more.length}명 (${more.join(', ')}) — 함께 다룰지 확인`
      : undefined
    return {
      ...base, phase: 'set', s: note ? 'late' : 'done', fired: true, by: f.by, ag: '—',
      v: m.v, note, act: note ? ['참석자 추가 검토'] : undefined,
    }
  }

  /* ③ EA 참석자가 있으면 자동 탐색에서 빠진다 — 인터뷰와 같은 규칙이다. */
  if (ea.length)
    return {
      ...base, phase: 'manual', s: 'esc', fired: true, by: f.by, sinceD, ag,
      v: `EA 조율 대상 · ${ea.join(', ')}`, act: ['EA에 직접 연락'],
    }

  /* ④ 참석자는 있고 시간이 없다 — 30분 교집합을 찾을 차례. */
  return {
    ...base, phase: 'time', s: late ? 'late' : 'idle', fired: true, by: f.by, sinceD, ag,
    v: `${who.length}명 지정 · 시간 미확정`, act: ['30분 시간 찾기'],
  }
}

export function mtgViews(pid: string): MtgView[] {
  return (meetings[pid] || []).map(m => mtgView(pid, m))
}

/** 확정 라벨 — 미팅 바와 DB 에 같은 문자열이 들어간다. */
export const mtgLabel = (date: string, min: number): string =>
  `${md(date)} ${pad(Math.floor(min / 60))}:${pad(min % 60)} 예정`

/* ---------------------------------------------------------
   다른 화면이 미팅을 읽는 창구
   ---------------------------------------------------------
   조율 처리함·사이드바 배지·내 할 일이 저장된 s 를 읽으면, 카드가 움직여서
   트리거가 바뀐 순간부터 화면마다 다른 말을 하게 된다. 전부 여기를 거친다.
   (data.ts 가 이 모듈을 import 하면 순환이라 반대 방향으로 합친다.)
   --------------------------------------------------------- */
const ORDER: Record<Status, number> = { esc: 0, late: 1, idle: 2, done: 3 }

/** 지금 사람이 손대야 하는 미팅만. */
export function openMtgs(): { pid: string; v: MtgView }[] {
  const out: { pid: string; v: MtgView }[] = []
  positions.forEach(p => mtgViews(p.id).forEach(v => {
    if (v.s === 'esc' || v.s === 'late') out.push({ pid: p.id, v })
  }))
  return out
}

/** 조율 처리함 한 줄 — 후보자 + 미팅을 합쳐 심각한 순으로. */
export function inboxAll(): InboxItem[] {
  const mtg: InboxItem[] = openMtgs().map(({ pid, v }) => ({
    k: 'mtg', s: v.s, nm: v.nm, st: '공고 미팅',
    pos: posById(pid).title, ag: v.ag, why: v.note ?? v.v, act: v.act,
  }))
  return [...inboxItems(), ...mtg].sort((a, b) => ORDER[a.s] - ORDER[b.s])
}

/** 사이드바 배지 — 후보자 + 미팅에서 사람을 기다리는 건수. */
export function escTotal(): number {
  return cands.filter(c => c.s === 'esc' || c.s === 'late').length + openMtgs().length
}
