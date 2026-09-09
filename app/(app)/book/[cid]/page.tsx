/* =========================================================
   후보자 셀프 예약 페이지 (외부 링크)
   ---------------------------------------------------------
   리크루터가 보낸 링크(/book/{cid})를 후보자가 열면,
   엔진이 계산한 가능한 시간 중 하나를 직접 고르고 확정한다.
   · 리크루터 사이드바 없음 → BookClient 가 전체화면으로 셸을 덮는다.
   · 서버에서 DB 하이드레이트 → scheduleFor 로 슬롯 계산 → 직렬화해 전달.
   ========================================================= */
import BookClient, { type BookData } from '../../../components/BookClient'
import { hydrateData } from '../../../lib/db'
import { cands, stageById, posById, personById, company, TODAY } from '../../../lib/data'
import { scheduleFor, fmtMin, configFor, businessDays } from '../../../lib/schedule'
import { resolveProvider, gmailReady } from '../../../lib/google'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export default async function Page({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params
  await hydrateData()

  const cand = cands.find(c => c.id === cid)
  if (!cand) {
    return <BookClient data={{ status: 'invalid' } as BookData} />
  }

  const stage = stageById(cand.p, cand.st)
  const pos = posById(cand.p)
  const base: Omit<BookData, 'status' | 'slots'> = {
    cid: cand.id,
    mailOn: await gmailReady(),
    name: cand.nm,
    company: company(cand.role),
    positionTitle: pos.title,
    stageName: stage.nm,
    dur: stage.dur || 60,
    mode: stage.mode || '화상',
  }

  // 이미 확정된 후보자면 확정 화면을 보여준다(링크 재방문).
  if (cand.s === 'done') {
    return <BookClient data={{ ...base, status: 'booked', slots: [], bookedLabel: cand.why }} />
  }

  // Google 캘린더가 연결돼 있으면 실시간 free-busy 로, 아니면 수동 가용성으로 계산.
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
      const dow = DOW[new Date(y, mo - 1, d).getDay()]
      return {
        key: `${s.date}-${s.start}`,
        date: s.date,
        start: s.start,
        end: s.end,
        day: `${mo}/${d} (${dow})`,
        label: `${fmtMin(s.start)}–${fmtMin(s.end)}`,
      }
    })
    return <BookClient data={{ ...base, status: 'choose', slots }} />
  }

  // coordinator / empty / no-interviewer → 후보자에겐 "곧 연락" 안내.
  const pendingMsg =
    outcome.kind === 'coordinator'
      ? '담당자가 직접 시간을 조율해 곧 연락드릴 예정입니다.'
      : outcome.kind === 'empty'
        ? '현재 예약 가능한 시간을 조정하고 있습니다. 담당자가 곧 다시 안내드릴게요.'
        : '아직 일정 안내 준비 중입니다. 담당자가 곧 연락드릴 예정입니다.'
  return <BookClient data={{ ...base, status: 'pending', slots: [], pendingMsg }} />
}
