/* =========================================================
   외부 면접관 링크 페이지 (/iv/{cid}/{uid})
   ---------------------------------------------------------
   리크루터가 면접관에게 보낸 링크. 면접관은 계정 없이 열어
   시간을 확정하거나 불가 사유를 남긴다.
   · 리크루터 셸(사이드바) 없음 → IvClient 가 전체화면으로 덮는다.
   · 서버에서 DB 하이드레이트 → scheduleFor 로 슬롯 계산 → 직렬화 전달.
   · 외부 화면이므로 파이프라인·다른 후보자·내부 사유는 넘기지 않는다.
   ========================================================= */
import IvClient, { type IvData } from '../../../../components/IvClient'
import { hydrateData } from '../../../../lib/db'
import { cands, stageById, posById, personById, evals, TODAY } from '../../../../lib/data'
import { scheduleFor, fmtMin, configFor, businessDays } from '../../../../lib/schedule'
import { resolveProvider } from '../../../../lib/google'
import { parseConfirmed, confirmedLabel } from '../../../../lib/reminders'
import { attrsFor, isGradable } from '../../../../lib/scorecard'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/* 단계 유형별 "이 단계에서 확인할 것" — 면접관이 준비 없이 들어오지 않게. */
const FOCUS: Record<string, string[]> = {
  screen: [
    '이력서에 적힌 경험이 사실인지 · 본인 기여 범위',
    '지원 동기와 이직 사유',
    '기본 커뮤니케이션과 협업 태도',
  ],
  interview: [
    '핵심 직무 역량 — 실제로 해본 사례 기준으로',
    '문제를 정의하고 푸는 방식',
    '협업 · 이견 조율 방식',
  ],
  task: [
    '과제 결과물의 완성도와 선택의 근거',
    '주어진 제약 안에서의 트레이드오프 판단',
  ],
  offer: [
    '조직 적합성과 중장기 기여 방향',
    '처우 · 입사 가능 시점',
  ],
}

export default async function Page(
  { params }: { params: Promise<{ cid: string; uid: string }> },
) {
  const { cid, uid } = await params
  await hydrateData()

  const cand = cands.find(c => c.id === cid)
  const iv = personById(uid)
  if (!cand || !iv) return <IvClient data={{ status: 'invalid' }} />

  const stage = stageById(cand.p, cand.st)
  const pos = posById(cand.p)

  /* 평가지 — 이 면접관 '자기 것'만 내려보낸다.
     다른 면접관 점수는 개수만 알려주고 내용은 넘기지 않는다(앵커링 방지). */
  const submitted = evals[cand.id] || []
  const mine = submitted.find(e => e.uid === iv.id)

  const base: IvData = {
    status: 'request',
    cid: cand.id,
    uid: iv.id,
    ivName: iv.nm,
    candName: cand.nm,
    candYears: cand.yr,
    candRole: cand.role,
    positionTitle: pos.title,
    team: pos.team,
    stageName: stage.nm,
    dur: stage.dur || 60,
    mode: stage.mode || '화상',
    focus: FOCUS[stage.kind] || FOCUS.interview,
    recruiter: personById(pos.rec)?.nm ?? pos.rec,
    gradable: isGradable(stage.kind),
    attrs: attrsFor(stage.kind),
    myEval: mine
      ? { items: mine.items, overall: mine.overall, memo: mine.memo, at: mine.at }
      : undefined,
    othersCount: submitted.filter(e => e.uid !== iv.id).length,
  }

  // 이미 확정됨(링크 재방문) — 확정 시각을 그대로 보여준다.
  if (cand.s === 'done') {
    const ct = parseConfirmed(cand.why)
    return <IvClient data={{ ...base, status: 'confirmed', confirmedLabel: ct ? confirmedLabel(ct) : cand.why }} />
  }
  // 이미 불가로 처리됨 — 사유만 되짚어 준다.
  if (cand.s === 'esc' && cand.why.startsWith('면접관 불가')) {
    return <IvClient data={{ ...base, status: 'declined', declinedReason: cand.why.split('—').pop()?.trim() || cand.why }} />
  }

  // 제안 가능한 시간 계산 — Google 연결 시 실시간 free-busy, 아니면 수동 가용성.
  const ivs = stage.ivs || []
  const hasEA = ivs.some(u => personById(u)?.ea)
  const provider =
    ivs.length && !hasEA
      ? (await resolveProvider(ivs, businessDays(TODAY, configFor(cand.p).windowDays))).provider
      : undefined
  const outcome = scheduleFor(cand, provider, TODAY)

  if (outcome.kind === 'proposed') {
    const slots = outcome.slots.map(s => {
      const [y, mo, d] = s.date.split('-').map(Number)
      return {
        key: `${s.date}-${s.start}`,
        day: `${mo}/${d}(${DOW[new Date(y, mo - 1, d).getDay()]})`,
        label: `${fmtMin(s.start)}–${fmtMin(s.end)}`,
      }
    })
    return <IvClient data={{ ...base, status: 'request', slots }} />
  }

  const pendingMsg =
    outcome.kind === 'coordinator'
      ? '비서(EA)를 통해 조율 중인 면접입니다. 담당자가 직접 시간을 잡아 안내드릴 예정입니다.'
      : outcome.kind === 'empty'
        ? '겹치는 빈 시간을 찾지 못해 담당자가 범위를 다시 잡고 있습니다. 곧 새 링크를 보내드릴게요.'
        : '아직 면접관 배정이 확정되지 않았습니다. 담당자가 곧 안내드릴 예정입니다.'
  return <IvClient data={{ ...base, status: 'pending', pendingMsg }} />
}
