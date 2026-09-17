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
   · 킥오프 = <그 공고에서 1차 면접 합격자가 처음 나왔을 때> (사용자 규칙).
     빈 공고에 사람을 모으면 얘기할 재료가 없다. 첫 합격자가 나오면
     '이 정도 사람으로 갈 것인가'를 맞출 재료가 생긴다.
   · 디브리프 = <마지막 인터뷰 단계를 끝낸 사람이 처음 생겼을 때>. 공고당 1회.
     확정한 뒤에 또 끝낸 사람이 생기면 '함께 다룰지'만 알린다(미팅을 더 만들지 않는다).

   ※ 서버·클라이언트 양쪽에서 import 한다. I/O 없이 계산만 한다.
   ========================================================= */
import {
  cands, stagesOf, posById, personById, personByName, people, positions, hmNow,
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

/** 킥오프: 1차 면접을 통과한 사람이 처음 생긴 시점.
    사용자 규칙 — "그 포지션에서 1차 합격자가 최초 발생했을 때만".
    도달(1차에 올라옴)이 아니라 통과(1차를 넘김)로 읽는다: 한 명도 못 넘긴 공고에
    사람을 모아 놓으면 얘기할 재료가 없다. 첫 합격자가 나오면 '이런 사람으로 갈 것인가'를
    맞출 재료가 생긴다. */
function fireKickoff(pid: string): Fire {
  const line = ivLine(pid)
  if (!line.length) return { fired: false }
  const first = line[0]
  const after = idxOf(pid, first.id) + 1
  /* 지금 2차에 있는 사람뿐 아니라 이미 더 간 사람·오퍼까지 센다 —
     첫 합격자가 벌써 앞서 갔다고 킥오프가 사라지면 안 된다. */
  const hit = cands
    .filter(c => c.p === pid && idxOf(pid, c.st) >= after)
    .sort((a, b) => (a.en < b.en ? -1 : 1))[0]
  if (!hit) return { fired: false }
  return { fired: true, by: `${hit.nm} · ${first.nm} 합격`, on: hit.en }
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
  push(personByName(hmNow(pos).nm)?.id)
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
      v: kind === 'kickoff' ? '1차 합격자 발생 시 자동 개설' : '최종 면접 완료 시 자동 개설',
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
      : /\(자동\)/.test(m.v)
        ? '시간은 참석자 일정이 비는 첫 자리로 자동으로 잡혔습니다 — 바꿀 수 있습니다'
        : undefined
    return {
      ...base, phase: 'set', s: more.length ? 'late' : 'done', fired: true, by: f.by, ag: '—',
      v: m.v, note, act: more.length ? ['참석자 추가 검토'] : undefined,
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

/** 확정 라벨 — 미팅 바와 DB 에 같은 문자열이 들어간다.
    auto=true 면 뒤에 표식을 붙인다. 사람이 고른 시간과 시스템이 밀어 넣은 시간은
    같은 값이어도 뜻이 다르다 — 자동으로 잡힌 건 바꿔도 된다고 말해줘야 한다. */
export const mtgLabel = (date: string, min: number, auto = false): string =>
  `${md(date)} ${pad(Math.floor(min / 60))}:${pad(min % 60)} 예정${auto ? ' (자동)' : ''}`

/** 이 시간이 자동으로 잡힌 것인가 */
export const isAutoSet = (v: string): boolean => /\(자동\)/.test(v)

/* ---------------------------------------------------------
   최종 면접의 합격·불합격은 디브리프 뒤에 (사용자 규칙)
   ---------------------------------------------------------
   "2차 면접 합격 여부는 Debrief 미팅 이후 채용 담당자가 ATS 에서 처리."
   면접관·HM 은 코멘트로 의견을 남기고, 최종 판정은 모여서 얘기한 뒤
   채용 담당자가 한 번에 누른다. 그래야 카드가 회의 전에 먼저 움직이지 않는다.

   막는 건 <마지막 면접 단계>뿐이다. 그 앞 단계는 그대로 각자 판정한다.
   보류와 '후보자가 이탈'은 막지 않는다 — 회의를 기다릴 일이 아니다.
   --------------------------------------------------------- */
const TODAY_ISO = (): string =>
  `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}-${pad(TODAY.getDate())}`

export type FinalBlock = 'debrief' | 'recruiter'

export interface FinalGate {
  /** 이 단계가 그 공고의 마지막 면접 단계인가 */
  isFinal: boolean
  /** 막혀 있으면 이유, 아니면 null */
  block: FinalBlock | null
  /** 화면에 그대로 쓰는 한 줄 */
  msg?: string
  /** 디브리프 미팅 상태(있으면) */
  debrief?: MtgView
}

/** 최종 면접 단계인지 + 지금 누를 수 있는지. urole 은 H2 역할('' = 비밀번호 관리자). */
export function finalGate(pid: string, stId: string, urole?: string): FinalGate {
  const line = ivLine(pid)
  const last = line[line.length - 1]
  if (!last || last.id !== stId) return { isFinal: false, block: null }

  const db = mtgViews(pid).find(v => v.kind === 'debrief')
  const ready = !!db && (db.phase === 'set' || db.phase === 'done')
  if (!ready) {
    const where = !db ? '이 공고에 디브리프 미팅이 없습니다'
      : db.phase === 'attendees' ? '디브리프 참석자가 아직 정해지지 않았습니다'
        : db.phase === 'manual' ? '디브리프가 EA 조율 대상입니다'
          : db.phase === 'pending' ? '디브리프는 최종 면접이 끝나면 열립니다'
            : '디브리프 시간이 아직 확정되지 않았습니다'
    return {
      isFinal: true, block: 'debrief',
      msg: `최종 합격·불합격은 디브리프 미팅 뒤에 처리합니다 — ${where}.`,
      ...(db ? { debrief: db } : {}),
    }
  }
  if (db && db.phase === 'set' && parseMtgTime(db.v) && parseMtgTime(db.v)!.date > TODAY_ISO()) {
    return {
      isFinal: true, block: 'debrief',
      msg: `디브리프가 ${db.v.replace(' (자동)', '')} 입니다. 회의 뒤에 처리해 주세요.`,
      debrief: db,
    }
  }
  /* 회의는 끝났다. 이제 누를 사람이 정해져 있다 — 채용 담당자(리크루터·HR Admin). */
  if (urole === 'hm' || urole === 'interviewer') {
    return {
      isFinal: true, block: 'recruiter',
      msg: '최종 판정은 채용 담당자가 기록합니다. 의견은 위 판정 코멘트에 남겨 주세요.',
      ...(db ? { debrief: db } : {}),
    }
  }
  return { isFinal: true, block: null, ...(db ? { debrief: db } : {}) }
}

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
