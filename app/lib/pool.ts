/* =========================================================
   Cadence — 인재풀 · 중복 정리
   ---------------------------------------------------------
   경쟁사 조사 근거:
   · Ashby "AI Talent Rediscovery" 는 과거 후보자를 등급으로 나눈다.
     '은메달(Silver Medalist)' = 인터뷰 단계까지 갔고 부정 평가가 없던 사람.
     그리고 <최근 6개월 이내 불합격 · 연락 두절 · 평가가 나빴던 사람>을
     명단에서 걷어낸다. 다시 꺼내 쓸 명단의 값은 '많이'가 아니라 '걸러서'에 있다.
   · Greenhouse 는 이메일·전화·링크드인 중 하나만 겹쳐도 프로필에 '중복' 표를
     붙이고, 병합할 때 <주 프로필(primary)>을 사람이 고르게 한다.
     충돌하는 값은 주 프로필 것을 남긴다. 병합은 되돌릴 수 없다.
   · 두 기능은 사실 한 몸이다 — 중복을 안 치우면 인재풀에 같은 사람이
     두 번 뜨고, 그러면 아무도 그 명단을 믿지 않는다.

   우리 판단(경쟁사와 다르게 간 곳):
   · 대기 기간에 걸린 사람을 <숨기지 않고 잠근다>. 숨기면 왜 없는지 모른다.
     '아직 이릅니다 · N일 남음'으로 보여주고 버튼만 막는다.
   · 불합격 사유 코드(decision.ts)가 이미 '재지원 권유 대상'/'다른 공고로 연결'을
     뜻으로 담고 있다. 등급을 새로 발명하지 않고 그 사유를 그대로 근거로 쓴다.
   · 병합의 뜻은 '지원건을 합친다'가 아니라 '이 지원건들은 같은 사람이다'이다.
     지원 이력은 하나도 지우지 않는다 — 지우면 퍼널 숫자가 거짓말이 된다.

   ※ 서버·클라이언트 양쪽에서 import 한다. I/O 없이 계산만 한다.
   ========================================================= */
import {
  cands, evals, positions, posById, stagesOf, stageById, daysSince,
  type Candidate,
} from './data'
import { isPositive } from './scorecard'
import { rejectDef, type RejectCode } from './decision'

/* 방금 떨어뜨린 사람에게 다시 연락하면 역효과다. Ashby 는 6개월을 쓰지만
   그건 지원자 수가 많은 회사 기준이고, 여기서는 한 달을 기본으로 둔다.
   설정 화면에서 바꿀 값이지 코드에 박을 값은 아니어서 상수로 빼 둔다. */
export const COOL_D = 30

export type PoolGrade = 'gold' | 'silver' | 'other'
export const GRADE_LABEL: Record<PoolGrade, string> = {
  gold: '은메달', silver: '다시 볼 만함', other: '참고',
}
export const GRADE_DESC: Record<PoolGrade, string> = {
  gold: '우리가 원했는데 놓친 사람. 조건이 바뀌면 가장 먼저 연락할 명단입니다.',
  silver: '면접까지 갔고 크게 걸린 것이 없던 사람. 자리가 맞으면 다시 볼 만합니다.',
  other: '서류에서 갈렸거나 판단 근거가 적은 사람. 참고용입니다.',
}

/* 영구 제외 — 다시 부르지 않는다.
   ghost(연락 두절)는 우리 쪽 안내가 문제였을 수도 있지만, 명단에 남겨두면
   매번 같은 사람에게 헛연락이 나간다. check(검증 불가)는 사유가 해소되기 전엔
   다시 부를 근거가 없다. */
const NEVER: RejectCode[] = ['ghost', 'check']

/* '우리가 원했는데 못 온 사람' — 사유 코드가 그대로 근거다. */
const WANTED: RejectCode[] = ['better-fit', 'position-closed', 'comp', 'other-offer']

/* ---------------------------------------------------------
   직무 매칭 — 이 공고에 이 사람을 꺼내도 되는가
   --------------------------------------------------------- */
/* 같은 뜻인데 회사마다 다르게 적는 말들. 한 통에 넣어야 '백엔드'로 지원한
   사람이 '서버 엔지니어' 공고에서 안 걸러진다. */
const SYN: string[][] = [
  ['백엔드', '서버', '백앤드'],
  ['프론트', '프론트엔드', '웹'],
  ['데이터', '데이터엔지니어', '분석'],
  ['qa', '품질', '테스트'],
  ['디자이너', '디자인', '프로덕트디자이너', 'ux', 'ui'],
  ['세일즈', '영업', '매출'],
  ['플랫폼', '인프라', 'devops'],
  ['엔지니어', '개발자'],
]

const norm = (s: string) =>
  s.toLowerCase().replace(/[()·,/]/g, ' ').replace(/\s+/g, ' ').trim()

function tokens(s: string): Set<string> {
  const out = new Set<string>()
  for (const w of norm(s).split(' ')) {
    if (!w) continue
    out.add(w)
    for (const g of SYN) if (g.indexOf(w) >= 0) g.forEach(x => out.add(x))
  }
  return out
}

/** 이 사람과 이 공고가 얼마나 겹치는가. 0 이면 안 보여준다. */
export function matchScore(c: Candidate, pid: string): number {
  const pos = posById(pid)
  const a = tokens(c.role)
  const b = tokens(`${pos.title} ${pos.team} ${pos.dept}`)
  let n = 0
  a.forEach(t => { if (b.has(t)) n++ })
  /* 같은 공고에 지원했던 사람은 직무를 따질 것도 없다 —
     공고를 다시 열었거나 홀드가 풀린 경우가 대부분이다. */
  return (c.p === pid ? 3 : 0) + Math.min(n, 3)
}

/* ---------------------------------------------------------
   등급
   --------------------------------------------------------- */
/* 인터뷰 단계까지 갔는가 — 서류에서 갈린 사람과 면접을 본 사람은
   우리가 아는 정보의 양이 다르다. */
function reachedInterview(c: Candidate): boolean {
  const line = stagesOf(c.p).filter(s => !s.rail)
  const first = line.findIndex(s => s.kind === 'interview')
  if (first < 0) return false
  const at = line.findIndex(s => s.id === (c.ex ?? c.st))
  return at >= first
}

/** 부정 평가 건수 — 종합 의견 기준. 항목 하나 나쁜 것으로 사람을 지우지 않는다. */
function negatives(cid: string): number {
  return (evals[cid] || []).filter(e => !isPositive(e.overall)).length
}

export interface PoolRow {
  c: Candidate
  grade: PoolGrade
  /* 왜 이 등급인지 — 화면에 그대로 쓴다. 근거 없는 순위는 아무도 안 믿는다. */
  why: string
  /* 어느 단계까지 갔었는지 */
  gotTo: string
  posTitle: string
  sinceD: number
  /* 지금 연락해도 되는가. false 면 버튼을 잠근다. */
  ready: boolean
  hold?: string
  score: number
}

export function gradeOf(c: Candidate): { grade: PoolGrade; why: string } {
  const code = c.rj
  const iv = reachedInterview(c)
  const neg = negatives(c.id)
  if (code && WANTED.indexOf(code) >= 0 && iv)
    return { grade: 'gold', why: `${rejectDef(code).l} · 면접까지 진행` }
  if (iv && neg === 0)
    return { grade: 'silver', why: '면접 진행 · 부정 평가 없음' }
  if (iv && neg === 1)
    return { grade: 'silver', why: '면접 진행 · 우려 1건' }
  return {
    grade: 'other',
    why: code ? rejectDef(code).l : (c.why || '기록 없음'),
  }
}

const ORDER: Record<PoolGrade, number> = { gold: 0, silver: 1, other: 2 }

/** 한 공고에 꺼내 쓸 수 있는 과거 후보자 명단.
    all=true 면 직무가 안 겹치는 사람까지 본다(자리 성격이 바뀐 경우). */
export function poolFor(pid: string, all = false): PoolRow[] {
  const out: PoolRow[] = []
  const seen = new Set<string>()
  for (const c of cands) {
    /* 진행 중인 사람은 인재풀이 아니다. 빠져나간 사람만 본다. */
    if (c.st !== 's0' || !c.ex) continue
    if (c.rj && NEVER.indexOf(c.rj) >= 0) continue
    /* 이미 이 공고에 살아 있는 지원건이 있으면 다시 부르지 않는다. */
    if (cands.some(x => x.p === pid && x.st !== 's0' && samePerson(x, c))) continue

    const score = matchScore(c, pid)
    if (!all && score === 0) continue

    /* 병합된 사람은 한 번만 — 대표 한 건만 명단에 올린다. */
    const key = personKeyOf(c)
    if (seen.has(key)) continue
    seen.add(key)

    const { grade, why } = gradeOf(c)
    const sinceD = daysSince(c.en)
    const ready = sinceD >= COOL_D
    out.push({
      c, grade, why, score, sinceD,
      posTitle: posById(c.p).title,
      gotTo: c.ex ? stageById(c.p, c.ex).nm : '—',
      ready,
      hold: ready ? undefined : `불합격 ${sinceD}일 전 — ${COOL_D - sinceD}일 뒤부터 연락할 수 있습니다`,
    })
  }
  /* 지금 연락할 수 있는 사람이 먼저다. 등급이 높아도 잠겨 있으면
     오늘 할 수 있는 일이 아니라서, 위에 있으면 목록 전체가 무력해 보인다. */
  return out.sort((a, b) =>
    Number(b.ready) - Number(a.ready) ||
    ORDER[a.grade] - ORDER[b.grade] || b.score - a.score || b.sinceD - a.sinceD)
}

/* ---------------------------------------------------------
   중복 — 같은 사람의 지원건이 여러 개인가
   --------------------------------------------------------- */
/* 이미 사람이 판단을 내린 지원건은 그 판단을 따른다.
   pk 가 자기 id 면 '확인했고 다른 사람이다', 남의 id 면 '그 사람과 같다'. */
export const personKeyOf = (c: Candidate): string => c.pk ?? c.id

export type DupSignal = 'email' | 'name' | 'name-role'

export interface DupPair { a: Candidate; b: Candidate; by: DupSignal; note: string }

/* 이름은 겹칠 수 있다. 동명이인을 같은 사람으로 합치면 되돌릴 수 없으니,
   이름만 같을 때는 '가능성'으로만 올리고 사람이 판단하게 둔다.
   Greenhouse 도 태그를 붙일 뿐 자동 병합은 하지 않는다. */
function signalOf(a: Candidate, b: Candidate): { by: DupSignal; note: string } | null {
  if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase())
    return { by: 'email', note: `같은 이메일 · ${a.email}` }
  if (a.nm !== b.nm) return null
  const t = tokens(a.role), u = tokens(b.role)
  let n = 0; t.forEach(x => { if (u.has(x)) n++ })
  if (n > 0 && Math.abs(a.yr - b.yr) <= 1)
    return { by: 'name-role', note: `같은 이름 · 직무·연차 일치 (${a.yr}년 / ${b.yr}년)` }
  return { by: 'name', note: `같은 이름 · 직무는 다름 (${a.role} / ${b.role})` }
}

/** 아직 정리되지 않은 중복 후보 쌍. 이미 판단이 끝난 건(pk 가 있는 건)은 뺀다. */
export function dupPairs(list: Candidate[] = cands): DupPair[] {
  const out: DupPair[] = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      if (a.pk || b.pk) continue          // 한쪽이라도 판단이 끝났으면 다시 묻지 않는다
      const s = signalOf(a, b)
      if (!s) continue
      out.push({ a, b, ...s })
    }
  }
  /* 확실한 신호(이메일)부터 위로 — 사람이 위에서부터 처리하면 된다. */
  const w: Record<DupSignal, number> = { email: 0, 'name-role': 1, name: 2 }
  return out.sort((x, y) => w[x.by] - w[y.by])
}

/** 같은 사람인가 — 병합으로 확정된 것만 참으로 본다(추측은 여기서 안 쓴다). */
export const samePerson = (a: Candidate, b: Candidate): boolean =>
  a.id === b.id || (!!a.pk && a.pk === b.pk) || a.pk === b.id || b.pk === a.id

/** 이 사람의 다른 지원 이력 — 병합이 끝난 것만 모은다. */
export function otherApps(c: Candidate): Candidate[] {
  return cands.filter(x => x.id !== c.id && samePerson(x, c))
}

/** 중복 정리가 남은 건수 — 사이드바 뱃지용. */
export const dupCount = (): number => dupPairs().length

/** 이 후보자에게 붙는 중복 경고(있으면). 드로어 상단 배너가 읽는다. */
export function dupFor(cid: string): DupPair[] {
  return dupPairs().filter(p => p.a.id === cid || p.b.id === cid)
}

/** 인재풀 전체 규모 — 화면 상단 요약용. */
export function poolSummary(pid: string, all = false) {
  const rows = poolFor(pid, all)
  return {
    total: rows.length,
    gold: rows.filter(r => r.grade === 'gold').length,
    ready: rows.filter(r => r.ready).length,
    held: rows.filter(r => !r.ready).length,
  }
}

/** 인재풀을 열어볼 만한 공고 — 진행 중인 것만. */
/* 진행 중인 공고를 먼저, 보류는 뒤로. 순서를 고정해 두지 않으면 DB 행 순서대로 바뀌어
   사람이 기억하는 자리에 공고가 없게 된다. */
export const openPositions = () =>
  positions.filter(p => p.st !== 'closed')
    .slice().sort((a, b) => Number(a.st === 'hold') - Number(b.st === 'hold') || a.id.localeCompare(b.id))
