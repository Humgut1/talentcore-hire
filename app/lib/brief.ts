/* =========================================================
   Cadence — 면접 브리핑 (외부 링크 ②)
   ---------------------------------------------------------
   경쟁사 조사 근거 (Greenhouse "Interview Kit" / Ashby "Interview Guide"):
   · 두 제품 모두 면접관에게 <이 면접 한 건짜리 준비 문서>를 링크로 보낸다.
     공고 전문·이력서·평가 항목·질문 예시가 한 장에 모여 있고, 계정이 없어도 열린다.
   · 실제로 값을 만드는 건 목록의 길이가 아니라 두 가지다:
     ① <앞 단계에서 이미 확인된 것> — 같은 질문을 세 번 받는 후보자가 제일 빨리 떠난다.
     ② <같이 들어가는 사람과의 분담> — 누가 무엇을 맡는지 정해두지 않으면
        두 면접관이 같은 것을 묻고, 아무도 안 묻는 항목이 남는다.
   · 그래서 이 모듈은 '문서를 예쁘게 만드는 것'이 아니라 저 두 가지를 계산한다.
     JD 요약과 질문 예시는 그 위에 얹는 부속물이다.

   ※ 서버·클라이언트 양쪽에서 import 한다. I/O 없이 계산만 한다.
   ========================================================= */
import { cands, evals, stagesOf, stageById, posById, personById } from './data'
import {
  attrsFor, isGradable, isPositive, ratingDef, type Rating,
} from './scorecard'

/* ---------------------------------------------------------
   평가 항목별 — 무엇을 보는 것인지 + 그걸 확인하는 질문.
   면접관이 항목 이름만 보고 각자 다른 것을 재는 일을 막는 것이 목적이다.
   항목 이름은 scorecard.ts 의 ATTRS 와 같은 문자열을 쓴다.
   --------------------------------------------------------- */
interface AttrGuide { what: string; qs: string[] }

export const ATTR_GUIDE: Record<string, AttrGuide> = {
  '이력 적합성': {
    what: '이력서에 적힌 경험이 이 자리에서 필요한 것과 겹치는지, 본인 기여 범위가 어디까지인지.',
    qs: [
      '가장 최근 프로젝트에서 본인이 직접 설계하거나 구현한 부분은 어디까지였나요?',
      '팀에서 그 결정을 내린 사람이 누구였고, 그 자리에 어떻게 참여하셨나요?',
    ],
  },
  '직무 기본기': {
    what: '이 직무라면 당연히 알아야 할 것을 알고 있는지. 깊이가 아니라 바닥의 유무.',
    qs: [
      '지금까지 다룬 것 중 가장 자신 있는 영역 하나를 골라 설명해 주세요.',
      '그 영역에서 최근에 새로 배운 것이 있다면 무엇인가요?',
    ],
  },
  '커뮤니케이션': {
    what: '복잡한 것을 상대에 맞춰 설명하는지. 말수가 아니라 정확도와 속도.',
    qs: [
      '방금 설명한 내용을 그 분야를 모르는 동료에게 한다면 어떻게 말하시겠어요?',
      '설명이 잘 전달되지 않았던 경험과, 그때 어떻게 바꿨는지 알려주세요.',
    ],
  },
  '직무 역량 깊이': {
    what: '실제로 해본 일인지, 들어본 일인지. 사례를 끝까지 파고들면 갈린다.',
    qs: [
      '그 문제를 처음 발견한 시점부터 해결까지 시간 순으로 말씀해 주세요.',
      '그때 선택하지 않은 다른 방법은 무엇이었고, 왜 접었나요?',
      '같은 문제를 지금 다시 만난다면 무엇을 다르게 하시겠어요?',
    ],
  },
  '문제 해결 방식': {
    what: '답을 맞히는 능력이 아니라, 정보가 부족할 때 무엇부터 하는지.',
    qs: [
      '원인을 모르는 문제를 받았을 때 첫 30분에 무엇을 하시나요?',
      '데이터가 없어서 판단을 미뤄야 했던 적이 있나요? 어떻게 했나요?',
    ],
  },
  '협업 · 이견 조율': {
    what: '의견이 갈렸을 때 무엇을 근거로 어떻게 좁히는지. 갈등의 유무가 아니다.',
    qs: [
      '동료와 기술적·업무적 판단이 갈렸던 사례를 하나 말씀해 주세요.',
      '결국 상대 의견으로 간 적이 있나요? 무엇 때문에 바뀌었나요?',
    ],
  },
  '성장 가능성': {
    what: '지금 잘하는 것보다, 1년 뒤 무엇을 더 할 수 있게 될 사람인지.',
    qs: [
      '최근 1년 동안 스스로 부족하다고 느껴 메운 것이 있다면 무엇인가요?',
      '이 자리에서 새로 배워야 할 것이 무엇이라고 생각하세요?',
    ],
  },
  '결과물 완성도': {
    what: '주어진 과제를 요구 수준까지 끝냈는지. 미완성 자체보다 어디서 멈췄는지가 중요하다.',
    qs: [
      '시간이 하루 더 있었다면 무엇을 먼저 손보셨을까요?',
      '스스로 판단하기에 이 결과물에서 가장 약한 부분은 어디인가요?',
    ],
  },
  '선택의 근거': {
    what: '왜 그렇게 만들었는지 설명할 수 있는지. 근거 없는 정답은 재현되지 않는다.',
    qs: [
      '이 구조를 고른 이유를 대안과 비교해서 말씀해 주세요.',
      '요구사항에 없던 것을 추가하셨다면, 왜 필요하다고 보셨나요?',
    ],
  },
  '제약 안에서의 판단': {
    what: '시간·정보가 모자랄 때 무엇을 버리는지. 트레이드오프를 말로 꺼낼 수 있는지.',
    qs: [
      '이번 과제에서 의도적으로 하지 않고 넘긴 것은 무엇인가요?',
      '그 판단이 실제 서비스였다면 어떤 위험이 있었을까요?',
    ],
  },
  '조직 적합성': {
    what: '우리 팀이 일하는 방식과 맞는지. 성격이 아니라 일하는 습관이다.',
    qs: [
      '가장 성과가 좋았던 팀은 어떤 방식으로 일했나요?',
      '반대로 잘 안 맞았던 환경은 어떤 곳이었나요?',
    ],
  },
  '중장기 기여': {
    what: '들어와서 6개월·2년 뒤에 무엇을 맡을 수 있을지 그림이 그려지는지.',
    qs: [
      '입사하면 첫 3개월 동안 무엇부터 하고 싶으세요?',
      '2년 뒤에 어떤 일을 하고 있기를 바라시나요?',
    ],
  },
}

const FALLBACK: AttrGuide = {
  what: '이 항목에서 무엇을 볼지는 담당 리크루터와 맞춰 주세요.',
  qs: ['실제로 해보신 사례를 하나 골라 처음부터 끝까지 설명해 주세요.'],
}

export const guideFor = (attr: string): AttrGuide => ATTR_GUIDE[attr] ?? FALLBACK

/* ---------------------------------------------------------
   브리핑 한 장
   --------------------------------------------------------- */
export interface CoveredItem {
  attr: string          // 항목 이름
  stage: string         // 어느 단계에서 봤는지
  by: string            // 누가 봤는지
  v: Rating
  positive: boolean
  label: string         // 'Yes' 등 표기
}
export interface SplitRow { uid: string; nm: string; attrs: string[]; me: boolean }

export interface Brief {
  ok: boolean
  reason?: 'no-candidate' | 'no-interviewer' | 'not-gradable'
  cid?: string; uid?: string
  ivName?: string; ivTitle?: string
  candName?: string; candYears?: number; candRole?: string; candSrc?: string
  positionTitle?: string; dept?: string; team?: string; emp?: string; jd?: string
  stageName?: string; kind?: string; dur?: number; mode?: string
  recruiter?: string
  /* 이 단계에서 매길 항목 전체 */
  attrs?: string[]
  /* 그중 내가 맡은 것 — 같이 들어가는 사람이 있으면 나눠 갖는다 */
  mine?: string[]
  split?: SplitRow[]
  /* 앞 단계에서 이미 확인된 항목 */
  covered?: CoveredItem[]
  /* 앞 단계 면접관이 남긴 한 줄 메모(있으면) */
  handover?: { by: string; stage: string; memo: string }[]
  /* 내가 이 단계 면접관 명단에 있는가.
     없어도 링크는 열어준다 — 대타로 들어가는 일이 실제로 흔하다.
     다만 '내 몫'을 임의로 만들어 주지는 않고, 전체 항목을 준다. */
  assigned?: boolean
  /* 내가 이 단계 평가를 이미 냈는가 */
  submitted?: boolean
}

/* 항목을 면접관 수만큼 라운드로빈으로 나눈다.
   "앞사람부터 몰아주기"가 아니라 번갈아 주는 이유는, 항목 목록이
   대개 쉬운 것부터 정렬돼 있어서 몰아주면 한 사람만 어려운 것을 다 갖기 때문이다.
   ivs 순서는 단계 설정에서 고정돼 있으므로 누가 무엇을 맡는지는 항상 같다. */
function splitAttrs(attrs: string[], ivs: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const u of ivs) out[u] = []
  if (!ivs.length) return out
  attrs.forEach((a, i) => { out[ivs[i % ivs.length]].push(a) })
  return out
}

export function briefFor(cid: string, uid: string): Brief {
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  const iv = personById(uid)
  if (!iv) return { ok: false, reason: 'no-interviewer' }

  const st = stageById(c.p, c.st)
  const pos = posById(c.p)
  if (!isGradable(st.kind)) return { ok: false, reason: 'not-gradable' }

  const attrs = attrsFor(st.kind)
  const ivs = st.ivs.length ? st.ivs : [uid]
  const split = splitAttrs(attrs, ivs)

  /* 앞 단계에서 이미 확인된 것.
     '앞 단계'는 이 공고의 단계 순서에서 지금보다 앞에 있는 것만 센다 —
     레일(입사·불합격)과 이번 단계는 제외한다. */
  const line = stagesOf(c.p).filter(s => !s.rail)
  const here = line.findIndex(s => s.id === c.st)
  const past = new Set(line.slice(0, Math.max(here, 0)).map(s => s.nm))

  const covered: CoveredItem[] = []
  const handover: { by: string; stage: string; memo: string }[] = []
  for (const e of evals[cid] || []) {
    if (!past.has(e.st)) continue
    for (const [attr, v] of e.items) {
      covered.push({
        attr, stage: e.st, by: e.iv, v,
        positive: isPositive(v), label: ratingDef(v).short,
      })
    }
    if (e.memo) handover.push({ by: e.iv, stage: e.st, memo: e.memo })
  }

  return {
    ok: true,
    cid, uid,
    ivName: iv.nm, ivTitle: iv.tt,
    candName: c.nm, candYears: c.yr, candRole: c.role, candSrc: c.src,
    positionTitle: pos.title, dept: pos.dept, team: pos.team, emp: pos.emp, jd: pos.jd,
    stageName: st.nm, kind: st.kind, dur: st.dur || 60,
    /* 단계 설정에 방식이 안 잡혀 있으면 '—'가 들어온다. 화면에서 빼야 할 값이라 비운다. */
    mode: st.mode && st.mode !== '—' ? st.mode : '',
    recruiter: personById(pos.rec)?.nm ?? pos.rec,
    attrs,
    mine: split[uid] ?? attrs,
    split: ivs.map(u => ({
      uid: u,
      nm: personById(u)?.nm ?? u,
      attrs: split[u] ?? [],
      me: u === uid,
    })),
    assigned: st.ivs.indexOf(uid) >= 0,
    covered,
    handover,
    submitted: (evals[cid] || []).some(e => e.uid === uid && e.st === st.nm),
  }
}
