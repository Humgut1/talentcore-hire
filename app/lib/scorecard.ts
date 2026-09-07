/* =========================================================
   Cadence — 스코어카드(평가) 정의
   ---------------------------------------------------------
   경쟁사 조사 근거 (Greenhouse 구조화 면접 / Ashby):
   · 점수는 4점 척도 Strong No / No / Yes / Strong Yes.
     1~5점 별점은 "3.7점" 같은 가짜 정밀도를 만들고, 가운데(3점)로
     도망갈 수 있어 판단이 안 남는다. 4점은 중립이 없다.
   · 항목은 단계마다 3~4개까지. 늘릴수록 면접이 길어지고 서로 겹친다.
   · 종합 의견은 항목 평균이 아니라 면접관이 따로 고른다.
     (항목은 근거, 채용 여부는 판단 — 둘을 섞지 않는다)
   · 다른 면접관 점수는 내가 제출하기 전에 보이지 않는다(앵커링 방지).

   ※ 이 파일은 서버·클라이언트 양쪽에서 import 한다. 순수 로직만 둔다.
   ========================================================= */

export type Rating = 'sno' | 'no' | 'yes' | 'syes'

export interface RatingDef { v: Rating; l: string; short: string; n: number }

/* n = 집계용 수치(1~4). 화면에는 라벨을 쓰고, 정렬·평균에만 쓴다. */
export const RATINGS: RatingDef[] = [
  { v: 'sno', l: 'Strong No', short: '강한 반대', n: 1 },
  { v: 'no', l: 'No', short: '반대', n: 2 },
  { v: 'yes', l: 'Yes', short: '찬성', n: 3 },
  { v: 'syes', l: 'Strong Yes', short: '강한 찬성', n: 4 },
]

export const ratingDef = (v: Rating): RatingDef =>
  RATINGS.find(r => r.v === v) ?? RATINGS[2]

/* 통과/보류 판정에 쓰는 이분법. yes 계열이면 통과 쪽. */
export const isPositive = (v: Rating) => v === 'yes' || v === 'syes'

/* 상태색 매핑 — 색은 상태에만 쓴다는 규칙에 맞춰
   찬성=done(녹색) / 반대=esc(버밀리온)로만 구분한다. */
export const ratingTone = (v: Rating): 'done' | 'esc' =>
  isPositive(v) ? 'done' : 'esc'

/* ---------------------------------------------------------
   단계 유형별 기본 평가 항목.
   면접관이 매번 뭘 볼지 정하지 않게 하는 것이 목적이다.
   저장된 평가는 자기 항목 이름을 함께 들고 있으므로,
   여기를 바꿔도 과거 평가는 그대로 남는다.
   --------------------------------------------------------- */
export const ATTRS: Record<string, string[]> = {
  screen: ['이력 적합성', '직무 기본기', '커뮤니케이션'],
  interview: ['직무 역량 깊이', '문제 해결 방식', '협업 · 이견 조율', '성장 가능성'],
  task: ['결과물 완성도', '선택의 근거', '제약 안에서의 판단'],
  offer: ['조직 적합성', '중장기 기여'],
}

export function attrsFor(kind: string): string[] {
  return ATTRS[kind] || ATTRS.interview
}

/* 이 단계가 평가 대상인가 — 지원 접수·레일(입사/불합격)은 아니다. */
export function isGradable(kind: string): boolean {
  return kind === 'screen' || kind === 'interview' || kind === 'task' || kind === 'offer'
}

/* ---------------------------------------------------------
   집계
   --------------------------------------------------------- */
export interface EvalLike { overall: Rating; items: [string, Rating][] }

/** 항목 평균(1~4). 항목이 없으면 종합 의견 값을 쓴다. */
export function avgOf(e: EvalLike): number {
  if (!e.items.length) return ratingDef(e.overall).n
  return e.items.reduce((a, [, v]) => a + ratingDef(v).n, 0) / e.items.length
}

/** 여러 면접관의 종합 의견 분포 — 'Strong Yes 1 · Yes 1' 처럼 쓴다. */
export function tally(list: EvalLike[]): { def: RatingDef; n: number }[] {
  return RATINGS
    .map(def => ({ def, n: list.filter(e => e.overall === def.v).length }))
    .filter(x => x.n > 0)
    .reverse()
}

/** 팀 전체 판정. 한 명이라도 반대면 '이견' — 다수결로 덮지 않는다. */
export type Verdict = 'pass' | 'split' | 'fail' | 'none'
export function verdictOf(list: EvalLike[]): Verdict {
  if (!list.length) return 'none'
  const pos = list.filter(e => isPositive(e.overall)).length
  if (pos === list.length) return 'pass'
  if (pos === 0) return 'fail'
  return 'split'
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: '전원 찬성', split: '이견 있음', fail: '전원 반대', none: '미제출',
}
