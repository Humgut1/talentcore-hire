import AutoRules, { type SlaRow } from '../../../components/AutoRules'
import { hydrateData } from '../../../lib/db'
import { auto, stagesOf, posById, cands } from '../../../lib/data'

export default async function Page({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params
  await hydrateData()
  const cfg = auto[pid] || auto.p1
  const position = posById(pid)
  // 단계별 SLA 현황(읽기 전용): 기준 체류일 대비 현재 평균·초과 인원
  const mine = cands.filter(c => c.p === pid)
  const slaRows: SlaRow[] = stagesOf(pid).filter(s => !s.rail).map(s => {
    const on = mine.filter(c => c.st === s.id)
    const avg = on.length ? on.reduce((x, c) => x + c.d, 0) / on.length : 0
    return {
      nm: s.nm, kind: s.kind, dur: s.dur, color: s.color,
      sla: s.sla, avg, over: on.filter(c => c.d > s.sla).length,
    }
  })
  return <AutoRules pid={pid} initialAuto={cfg} slaRows={slaRows} position={position} />
}
