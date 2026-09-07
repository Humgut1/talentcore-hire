/* =========================================================
   Cadence — 전형 판정 (합격 / 보류 / 불합격)
   ---------------------------------------------------------
   경쟁사 조사 근거 (Greenhouse / Ashby):
   · 판정은 세 갈래다 — Advance(다음 단계) / Maybe·Hold(보류) / Reject.
     둘(합·불)로만 두면 "일단 킵"이 아무 데도 기록되지 않고 사람 머릿속에만
     남는다. 보류를 화면 위에 올려야 나중에 "그 사람 어떻게 됐지"가 안 생긴다.
   · 불합격에는 반드시 사유를 받는다. Greenhouse는 사유를 필수 항목으로
     걸 수 있게 해두고, 별도의 '불합격 사유 리포트'를 제공한다.
     사유가 비어 있어도 저장되면 아무도 채우지 않는다 → 서버에서 막는다.
   · 가장 중요한 구조: 사유를 <우리가 거절>과 <후보자가 이탈> 둘로 나눈다.
     Greenhouse가 사유 목록을 "We rejected them / They rejected us"로 쪼개
     두는 이유가 이것이다. 둘을 한 통에 섞으면 퍼널 지표가 거짓말을 한다 —
     '2차에서 60% 탈락'이 우리 심사 기준이 빡센 건지, 후보자들이 우리를
     떠난 건지 구분되지 않는다. 앞은 기준의 문제고 뒤는 매력의 문제라,
     해야 할 일이 정반대다.
   · 통보 메일은 초안까지만 만든다. 자동 발송하지 않는다(설정 화면의
     약속과 동일). 사유 코드는 초안 본문에 그대로 쓰지 않는다 —
     "역량 부족" 같은 내부 분류를 그대로 보내면 분쟁이 된다.

   ※ 이 파일은 서버·클라이언트 양쪽에서 import 한다. 순수 로직만 둔다.
     (data.ts 를 import 하지 않는다 — data.ts 가 이 파일의 타입을 쓰기 때문)
   ========================================================= */

import { isGradable, verdictOf, type Rating, type Verdict } from './scorecard'

/* ---------------------------------------------------------
   불합격 사유
   --------------------------------------------------------- */
export type RejectSide = 'us' | 'them'

export type RejectCode =
  // 우리가 거절
  | 'better-fit' | 'skill' | 'exp' | 'collab' | 'comp-gap' | 'position-closed' | 'check'
  // 후보자가 이탈
  | 'other-offer' | 'comp' | 'career' | 'location' | 'withdraw' | 'ghost'

export interface RejectReason { v: RejectCode; l: string; d: string; side: RejectSide }

export const SIDE_LABEL: Record<RejectSide, string> = {
  us: '우리가 거절', them: '후보자가 이탈',
}
export const SIDE_DESC: Record<RejectSide, string> = {
  us: '심사 결과 우리가 진행하지 않기로 한 경우 — 기준·JD·소싱 품질의 문제입니다.',
  them: '후보자가 스스로 빠진 경우 — 처우·속도·매력의 문제입니다. 같은 통에 넣으면 원인을 못 찾습니다.',
}

export const REJECT_REASONS: RejectReason[] = [
  { v: 'better-fit', side: 'us', l: '더 적합한 후보 선발', d: '이 사람이 부족해서가 아니라 다른 후보를 택한 경우. 재지원 권유 대상입니다.' },
  { v: 'skill', side: 'us', l: '직무 역량 부족', d: '요구 역량 대비 깊이가 부족. 어느 항목이었는지 메모에 남기면 JD 수정에 쓰입니다.' },
  { v: 'exp', side: 'us', l: '경력 수준 불일치', d: '역량은 있으나 연차·범위가 이 자리와 맞지 않음. 다른 공고로 연결할 수 있습니다.' },
  { v: 'collab', side: 'us', l: '협업 · 커뮤니케이션', d: '이견 조율·설명 방식에서 우려. 근거가 평가지에 남아 있어야 합니다.' },
  { v: 'comp-gap', side: 'us', l: '처우 기대 차이 (우리 판단)', d: '기대 처우가 밴드를 넘어 진행하지 않기로 함. 밴드 재검토 신호입니다.' },
  { v: 'position-closed', side: 'us', l: '공고 중단 · 보류', d: '후보자 사유가 아님. 재오픈 시 가장 먼저 연락할 명단입니다.' },
  { v: 'check', side: 'us', l: '이력 · 평판 확인 불가', d: '검증 단계에서 확인되지 않은 항목이 있는 경우.' },

  { v: 'other-offer', side: 'them', l: '타사 오퍼 수락', d: '어디로 갔는지 메모에 남기면 경쟁사 지도가 쌓입니다.' },
  { v: 'comp', side: 'them', l: '처우 조건 불만', d: '금액·구성 중 무엇이 걸렸는지가 밴드 조정의 유일한 근거입니다.' },
  { v: 'career', side: 'them', l: '직무 · 커리어 방향', d: '기대한 역할과 달랐던 경우. JD가 실제 업무와 다르다는 신호일 수 있습니다.' },
  { v: 'location', side: 'them', l: '근무지 · 근무형태', d: '출근 방식·지역 때문에 빠진 경우.' },
  { v: 'withdraw', side: 'them', l: '개인 사정 · 지원 철회', d: '이직 계획 자체를 접은 경우. 재접촉 시점을 메모에 남깁니다.' },
  { v: 'ghost', side: 'them', l: '연락 두절', d: '일정 이후 응답 없음. 잦다면 우리 연락 속도·안내 문구를 봐야 합니다.' },
]

export const rejectDef = (v: RejectCode): RejectReason =>
  REJECT_REASONS.find(r => r.v === v) ?? REJECT_REASONS[0]

export const reasonsOf = (side: RejectSide) => REJECT_REASONS.filter(r => r.side === side)

/** 후보자가 스스로 빠졌는가 — 퍼널에서 '탈락'과 다르게 세야 하는 건. */
export const isDropout = (v: RejectCode) => rejectDef(v).side === 'them'

/* ---------------------------------------------------------
   판정
   --------------------------------------------------------- */
export type DecisionKind = 'advance' | 'hold' | 'reject'

export const DECISION_LABEL: Record<DecisionKind, string> = {
  advance: '다음 단계로', hold: '보류', reject: '불합격',
}

/* data.ts 의 Stage/EvalItem 을 그대로 받되, 이 파일이 data.ts 에
   의존하지 않도록 필요한 칸만 구조적으로 요구한다. */
export interface StageLite { id: string; nm: string; kind: string; rail?: boolean }
export interface EvalLite { uid: string; iv: string; overall: Rating; items: [string, Rating][] }
export interface IvLite { uid: string; nm: string }

export interface DecisionView {
  cur: StageLite
  next?: StageLite          // 다음 비레일 단계
  hired?: StageLite         // 입사 레일
  out?: StageLite           // 불합격 레일
  closed: boolean           // 이미 레일에 있음 → 더 판정할 것 없음
  gradable: boolean         // 평가를 받는 단계인가
  expected: number          // 이 단계에 배정된 면접관 수
  submitted: number         // 실제 제출된 평가 수
  pending: string[]         // 아직 안 낸 면접관 이름
  verdict: Verdict
  ready: boolean            // 판정에 필요한 평가가 다 모였나
  advice: DecisionKind | null   // 평가가 가리키는 방향(권고일 뿐, 강제 아님)
  notes: string[]           // 누르기 전에 알아야 할 것
}

/**
 * 지금 이 후보자에게 무엇을 누를 수 있는지 계산한다.
 * 평가가 덜 모여도 진행을 '막지는' 않는다 — 사람이 이유를 알고 넘기는 경우가
 * 실제로 있기 때문. 대신 무엇이 비었는지 항상 문장으로 보여준다.
 */
export function decisionFor(
  cur: StageLite, stages: StageLite[], evals: EvalLite[], ivs: IvLite[],
): DecisionView {
  const line = stages.filter(s => !s.rail)
  const i = line.findIndex(s => s.id === cur.id)
  const next = i >= 0 ? line[i + 1] : undefined
  const hired = stages.find(s => s.kind === 'hired')
  const out = stages.find(s => s.kind === 'reject')
  const closed = !!cur.rail

  const gradable = isGradable(cur.kind)
  const done = new Set(evals.map(e => e.uid))
  const pending = gradable ? ivs.filter(v => !done.has(v.uid)).map(v => v.nm) : []
  const expected = gradable ? ivs.length : 0
  const submitted = evals.length
  const verdict = verdictOf(evals)
  const ready = !gradable || (expected > 0 ? pending.length === 0 : submitted > 0)

  let advice: DecisionKind | null = null
  if (!closed) {
    if (!gradable) advice = 'advance'
    else if (verdict === 'pass') advice = 'advance'
    else if (verdict === 'fail') advice = 'reject'
    else if (verdict === 'split') advice = 'hold'
  }

  const notes: string[] = []
  if (gradable && pending.length)
    notes.push(`${pending.join(' · ')} 님의 평가가 아직 없습니다. 지금 판정하면 그 의견 없이 정해집니다.`)
  if (verdict === 'split')
    notes.push('찬반이 갈렸습니다. 숫자로 덮지 말고 무엇을 다르게 봤는지 맞춰본 뒤 판정하세요.')
  if (!closed && !next)
    notes.push('다음 단계가 없습니다 — 이 단계가 마지막입니다.')

  return {
    cur, next, hired, out, closed, gradable,
    expected, submitted, pending, verdict, ready, advice, notes,
  }
}

/* ---------------------------------------------------------
   불합격 통보 초안
   ---------------------------------------------------------
   · 자동 발송하지 않는다. 사람이 읽고 고쳐서 보낸다.
   · 내부 사유 코드를 본문에 쓰지 않는다.
   · 마지막 단계까지 온 사람에게는 더 길게 쓴다 — 서류에서 떨어진 사람과
     최종 면접에서 떨어진 사람에게 같은 문장을 보내는 것이 가장 큰 실수다.
   · 후보자가 스스로 빠진 경우(them)는 '통보'가 아니라 '마무리 인사'다.
   --------------------------------------------------------- */
export interface MailDraft { subject: string; body: string }

export function rejectMailDraft(a: {
  cand: string; pos: string; stage: StageLite; code: RejectCode; sender: string
}): MailDraft {
  const deep = a.stage.kind === 'interview' || a.stage.kind === 'offer' || a.stage.kind === 'task'
  const r = rejectDef(a.code)

  if (r.side === 'them') {
    return {
      subject: `[${a.pos}] 지원 절차 마무리 안내`,
      body:
        `${a.cand} 님, 안녕하세요.\n\n` +
        `${a.pos} 포지션 전형에 시간 내어 참여해 주셔서 감사합니다.\n` +
        `말씀해 주신 사정에 따라 이번 전형은 여기서 마무리하겠습니다.\n\n` +
        `함께 이야기 나눈 내용은 저희에게도 도움이 되었습니다. ` +
        `이후에 더 맞는 자리가 열리면 다시 연락드려도 괜찮을지 여쭙고 싶습니다.\n\n` +
        `좋은 결정 하시길 바랍니다.\n\n${a.sender} 드림`,
    }
  }

  if (a.code === 'position-closed') {
    return {
      subject: `[${a.pos}] 채용 진행 중단 안내`,
      body:
        `${a.cand} 님, 안녕하세요.\n\n` +
        `${a.pos} 포지션 전형에 참여해 주셔서 감사합니다.\n` +
        `내부 사정으로 해당 포지션 채용이 중단되어, 부득이하게 전형을 종료하게 되었습니다.\n` +
        `${a.cand} 님의 역량과는 무관한 결정임을 말씀드립니다.\n\n` +
        `채용이 다시 열리면 가장 먼저 연락드리고 싶습니다. 그때 다시 뵐 수 있으면 좋겠습니다.\n\n` +
        `${a.sender} 드림`,
    }
  }

  return {
    subject: `[${a.pos}] 전형 결과 안내`,
    body:
      `${a.cand} 님, 안녕하세요.\n\n` +
      (deep
        ? `${a.pos} 포지션 ${a.stage.nm}까지 함께해 주셔서 감사합니다. ` +
          `면접에 내어 주신 시간과 준비해 주신 내용 잘 보았습니다.\n\n` +
          `내부 논의 끝에, 이번에는 함께하지 못하게 되었다는 말씀을 드립니다. ` +
          `이번 자리에서 특히 중요하게 보던 부분과의 차이 때문이며, ` +
          `${a.cand} 님의 경력 전체에 대한 평가는 아닙니다.\n\n`
        : `${a.pos} 포지션에 지원해 주셔서 감사합니다.\n\n` +
          `제출해 주신 내용을 검토한 결과, 아쉽게도 이번 전형에서는 ` +
          `함께하지 못하게 되었습니다.\n\n`) +
      (a.code === 'better-fit' || a.code === 'exp'
        ? '앞으로 더 맞는 포지션이 열리면 다시 연락드리고 싶습니다. 재지원도 언제든 환영합니다.\n\n'
        : '앞으로의 여정을 응원하겠습니다.\n\n') +
      `${a.sender} 드림`,
  }
}
