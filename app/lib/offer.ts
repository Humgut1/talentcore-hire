/* =========================================================
   Cadence — 오퍼 정의
   ---------------------------------------------------------
   경쟁사 조사 근거 (Greenhouse / Ashby / 업계 지표 관행):
   · 오퍼는 '만들었다'와 '보냈다'가 다른 사건이다. 수락률을 셀 때
     초안(draft)을 섞으면 분모가 부풀어 지표가 망가진다.
     → extended = sent 이후 상태만. draft·approval 은 제외한다.
   · 승인은 순차(sequential)다. 앞사람이 승인해야 다음 차례가 열린다.
     Greenhouse 도 병렬 승인을 지원하지 않는다 — 병렬로 두면
     "누가 막고 있는지"가 사라져서 오퍼가 조용히 늘어진다.
   · 연봉 밴드를 넘으면 승인 단계가 하나 늘어난다. 밴드는 오퍼마다
     '그때 그 밴드'를 복사해 둔다(밴드가 나중에 바뀌어도 판단 근거가 남게).
   · 거절 사유는 자유입력이 아니라 고정 항목이다. 업계 통계상 거절은
     보상 40% / 타사 오퍼 25% / 역할·컬처 15% / 타이밍 10% / 잔류 제안 10%
     로 몰려 있어, 항목으로 받아야 "우리는 무엇 때문에 지는가"가 보인다.

   ※ 이 파일은 서버·클라이언트 양쪽에서 import 한다. 순수 로직만 둔다.
   ========================================================= */

/* ---------------------------------------------------------
   상태
   --------------------------------------------------------- */
export type OfferState = 'draft' | 'approval' | 'sent' | 'accepted' | 'declined'

export interface OfferStateDef {
  v: OfferState
  l: string
  /* 상태색은 4색 규칙만 쓴다 — idle(회색)/esc(버밀리온)/late(앰버)/done(녹색) */
  tone: 'idle' | 'esc' | 'late' | 'done'
  d: string
}

export const OFFER_STATES: OfferStateDef[] = [
  { v: 'draft', l: '초안', tone: 'idle', d: '처우안을 작성하는 중 — 아직 아무에게도 가지 않았습니다' },
  { v: 'approval', l: '승인 대기', tone: 'late', d: '내부 승인을 받는 중 — 후보자는 아직 모릅니다' },
  { v: 'sent', l: '발송됨', tone: 'idle', d: '후보자에게 전달됨 — 응답을 기다리는 중' },
  { v: 'accepted', l: '수락', tone: 'done', d: '후보자가 수락했습니다' },
  { v: 'declined', l: '거절', tone: 'esc', d: '후보자가 거절했습니다 — 사유가 기록됩니다' },
]

export const offerStateDef = (v: OfferState): OfferStateDef =>
  OFFER_STATES.find(s => s.v === v) ?? OFFER_STATES[0]

/** 후보자에게 실제로 나간 오퍼인가 — 수락률의 분모가 되는 조건. */
export const isExtended = (v: OfferState) =>
  v === 'sent' || v === 'accepted' || v === 'declined'

/** 후보자가 답을 준 상태인가. */
export const isResolved = (v: OfferState) => v === 'accepted' || v === 'declined'

/* ---------------------------------------------------------
   거절 사유 — 고정 항목
   비율은 업계 조사값(참고용 정렬 근거)이며 우리 데이터가 아니다.
   --------------------------------------------------------- */
export type DeclineCode =
  | 'comp' | 'other-offer' | 'counter' | 'role'
  | 'culture' | 'location' | 'timing' | 'process'

export interface DeclineDef { v: DeclineCode; l: string; d: string }

export const DECLINE_REASONS: DeclineDef[] = [
  { v: 'comp', l: '보상 조건', d: '연봉·사이닝·지분이 기대에 못 미침' },
  { v: 'other-offer', l: '타사 오퍼 수락', d: '다른 회사 오퍼를 받아들임' },
  { v: 'counter', l: '현 직장 잔류', d: '재직 중인 회사의 역제안을 수락' },
  { v: 'role', l: '역할 · 직급', d: '맡을 일이나 직급이 기대와 다름' },
  { v: 'culture', l: '조직 · 컬처', d: '팀·조직에 대한 우려' },
  { v: 'location', l: '근무지 · 리모트', d: '출근 조건·근무지가 맞지 않음' },
  { v: 'timing', l: '개인 사정 · 타이밍', d: '이직 시기가 맞지 않음' },
  { v: 'process', l: '전형 경험', d: '진행 속도·커뮤니케이션에 대한 불만' },
]

export const declineDef = (v: DeclineCode): DeclineDef =>
  DECLINE_REASONS.find(r => r.v === v) ?? DECLINE_REASONS[0]

/* ---------------------------------------------------------
   승인 체인
   --------------------------------------------------------- */
export type ApprovalState = 'pending' | 'ok' | 'hold'

export interface Approval {
  uid: string
  nm: string
  role: string          // 이 사람이 '무엇으로서' 승인하는가 (하이어링 매니저 / 본부 승인 …)
  s: ApprovalState
  at?: string           // 처리 시각 라벨
  memo?: string         // 보류 사유
}

export interface Offer {
  cid: string
  st: OfferState
  level: string         // 직급 라벨
  base: number          // 기본 연봉(만원)
  sign: number          // 사이닝 보너스(만원) · 0이면 없음
  band: [number, number] // 이 오퍼를 판단한 시점의 연봉 밴드(만원)
  start?: string        // 입사 예정일 (YYYY-MM-DD)
  /* 어느 자리에 앉는가 (T5). TalentCore 자리 카드 코드(OP-12-2).
     마이그레이션 009 전 DB 에는 없다 → 비어 있으면 '정원 밖'으로 넘어간다. */
  openingCode?: string
  chain: Approval[]
  createdAt: string     // YYYY-MM-DD
  sentAt?: string
  respAt?: string
  declineCode?: DeclineCode
  declineMemo?: string
}

/** 밴드를 넘겼는가 — 넘기면 승인 단계가 하나 늘어난다. */
export const overBand = (o: { base: number; band: [number, number] }) =>
  o.base > o.band[1]

/** 밴드 대비 위치를 % 로 (0 = 하한, 100 = 상한). 초과분은 100을 넘는다. */
export function bandPct(o: { base: number; band: [number, number] }): number {
  const [lo, hi] = o.band
  if (hi <= lo) return 100
  return Math.round(((o.base - lo) / (hi - lo)) * 100)
}

/** 지금 공을 쥐고 있는 승인자 — 순차이므로 '첫 번째 미처리'가 답이다. */
export function currentApprover(o: Offer): Approval | null {
  return o.chain.find(a => a.s === 'pending') ?? null
}

/** 승인이 막혀 있는가(보류가 하나라도 있으면 진행 불가). */
export const isHeld = (o: Offer) => o.chain.some(a => a.s === 'hold')

/** 승인 체인이 전부 끝났는가 → 발송 가능. */
export const isApproved = (o: Offer) =>
  o.chain.length > 0 && o.chain.every(a => a.s === 'ok')

/** 이 사람이 지금 승인 버튼을 누를 수 있는가. */
export function canAct(o: Offer, uid: string): boolean {
  if (o.st !== 'approval') return false
  const cur = currentApprover(o)
  return !!cur && cur.uid === uid
}

/** 진행률 라벨 — '2 / 3 승인' */
export function chainLabel(o: Offer): string {
  const ok = o.chain.filter(a => a.s === 'ok').length
  return `${ok} / ${o.chain.length} 승인`
}

/* ---------------------------------------------------------
   다음에 할 수 있는 일 — 화면이 버튼을 고를 때 쓴다.
   상태 전이를 한 곳에 모아 두면 화면마다 조건이 어긋나지 않는다.
   --------------------------------------------------------- */
export type OfferAction = 'submit' | 'approve' | 'hold' | 'send' | 'accept' | 'decline'

export function nextActions(o: Offer): OfferAction[] {
  switch (o.st) {
    case 'draft': return ['submit']
    case 'approval': return isHeld(o) ? [] : ['approve', 'hold']
    case 'sent': return ['accept', 'decline']
    default: return []
  }
}

/** 승인 완료 직후 발송이 가능한지 (approval 상태에서 전원 승인). */
export const canSend = (o: Offer) => o.st === 'approval' && isApproved(o)

/* ---------------------------------------------------------
   집계
   --------------------------------------------------------- */
export interface OfferMetrics {
  total: number       // 전체 오퍼(초안 포함)
  extended: number    // 실제로 나간 것
  accepted: number
  declined: number
  pending: number     // 나갔지만 아직 답이 없는 것
  inApproval: number  // 아직 내부에 있는 것(초안 + 승인 대기)
  /** 수락률 — 답이 온 것만으로 계산한다. 아직 답을 안 준 오퍼를
      분모에 넣으면 시간이 갈수록 수락률이 저절로 떨어져 보인다. */
  acceptRate: number | null
  /** 발송 → 응답까지 평균 일수. 응답이 없으면 null. */
  avgRespDays: number | null
}

const dayDiff = (a?: string, b?: string): number | null => {
  if (!a || !b) return null
  const p = (s: string) => { const x = s.split('-').map(Number); return new Date(x[0], x[1] - 1, x[2]).getTime() }
  return Math.round((p(b) - p(a)) / 864e5)
}

export function offerMetrics(list: Offer[]): OfferMetrics {
  const extended = list.filter(o => isExtended(o.st))
  const accepted = list.filter(o => o.st === 'accepted').length
  const declined = list.filter(o => o.st === 'declined').length
  const resolved = accepted + declined
  const spans = list
    .map(o => dayDiff(o.sentAt, o.respAt))
    .filter((n): n is number => n !== null && n >= 0)
  return {
    total: list.length,
    extended: extended.length,
    accepted,
    declined,
    pending: list.filter(o => o.st === 'sent').length,
    inApproval: list.filter(o => o.st === 'draft' || o.st === 'approval').length,
    acceptRate: resolved ? Math.round((accepted / resolved) * 100) : null,
    avgRespDays: spans.length
      ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10
      : null,
  }
}

/** 거절 사유 분포 — 많은 순. 0건인 사유는 뺀다. */
export function declineTally(list: Offer[]): { def: DeclineDef; n: number }[] {
  return DECLINE_REASONS
    .map(def => ({ def, n: list.filter(o => o.declineCode === def.v).length }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n)
}

/* ---------------------------------------------------------
   표시 헬퍼
   --------------------------------------------------------- */
/** 9200 → '9,200만원' */
export const won = (n: number) => `${n.toLocaleString('ko-KR')}만원`

/** 총 보상(연봉 + 사이닝). 사이닝은 1회성이라 따로도 보여준다. */
export const totalComp = (o: { base: number; sign: number }) => o.base + o.sign
