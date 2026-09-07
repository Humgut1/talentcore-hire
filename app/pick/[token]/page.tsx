/* =========================================================
   후보자 면접 시간 선택 (외부 링크 /pick/{token})
   ---------------------------------------------------------
   조율 엔진이 잡아 둔 가예약 자리를 후보자에게 보여 주고 하나를 고르게 한다.
   토큰은 면접 1건에 붙는 열쇠라 후보자 로그인이 필요 없다.
   기한(가예약 48시간)이 지난 링크는 고르지 못하게 막고 안내만 띄운다.
   ========================================================= */
import PickClient, { type PickData, type PickSlot } from '../../components/PickClient'
import { hydrateData } from '../../lib/db'
import { cands, posById, stageById, personById, demoNow } from '../../lib/data'
import { orgName } from '../../lib/core'
import { interviews, partsOf, slotsOf } from '../../lib/iv-store'
import { fmtMin, seatTaken } from '../../lib/schedule'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]})`
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  await hydrateData()

  const iv = interviews.find(v => v.token === token)
  if (!iv || iv.st === 'canceled') return <PickClient data={{ status: 'invalid' }} />

  const cand = cands.find(c => c.id === iv.cid)
  const pos = posById(iv.pid)
  const parts = partsOf(iv.id)
  const org = await orgName()
  const base: Omit<PickData, 'status'> = {
    token,
    name: cand?.nm ?? '',
    ...(org ? { company: org } : {}),
    positionTitle: pos.title,
    stageName: stageById(iv.pid, iv.sid).nm,
    totalMin: iv.totalMin,
    mode: iv.mode ?? '화상',
    seq: iv.kind === 'seq',
    who: parts.map(p => {
      const nm = p.nm || personById(p.uid || '')?.nm || '면접관'
      return `${nm} · ${p.role} · ${p.dur}분`
    }),
  }

  // 이미 고른 링크를 다시 연 경우 — 확정 화면을 그대로 보여 준다.
  if (iv.st === 'confirmed' || iv.st === 'done') {
    const picked = slotsOf(iv.id).find(s => s.st === 'picked')
    return <PickClient data={{
      ...base, status: 'booked',
      ...(picked ? { bookedLabel: `${dayLabel(picked.date)} ${fmtMin(picked.start)}–${fmtMin(picked.end)}` } : {}),
    }} />
  }

  // 가예약이 풀린 뒤(또는 아직 안 보낸 상태) — 고르게 두면 안 된다.
  const timeUp = iv.st !== 'proposed' ||
                 (!!iv.holdUntil && iv.holdUntil < demoNow().toISOString())
  if (timeUp) return <PickClient data={{ ...base, status: 'expired' }} />

  /* 선착순 — 같은 자리를 여러 후보자에게 함께 냈으므로, 남이 이미 확정한 자리는
     여기서 조용히 뺀다. 후보자에게는 '면접관 일정이 그만큼 찼다'로만 보이고,
     다른 지원자의 존재는 어디에도 드러나지 않는다. */
  const live = slotsOf(iv.id).filter(s => s.st === 'offered' && !seatTaken(
    iv.id, s.date,
    parts.map(p => ({ uid: p.uid, start: s.start + p.offMin, end: s.start + p.offMin + p.dur })),
  ))
  // 다 나간 경우 '기한 만료'라고 하면 거짓말이 된다 — 기한은 남았고 자리만 없다.
  if (!live.length) return <PickClient data={{ ...base, status: 'full' }} />

  const slots: PickSlot[] = live.map(s => ({
    ord: s.ord,
    day: dayLabel(s.date),
    label: `${fmtMin(s.start)}–${fmtMin(s.end)}`,
  }))
  return <PickClient data={{ ...base, status: 'choose', slots }} />
}
