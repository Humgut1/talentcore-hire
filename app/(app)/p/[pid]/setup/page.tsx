import StageEditor from '../../../../components/StageEditor'
import { hydrateData } from '../../../../lib/db'
import { stagesOf, posById, people, cands } from '../../../../lib/data'

export default async function Page({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params
  await hydrateData()
  const stages = stagesOf(pid)
  const position = posById(pid)
  // 단계별 진행 중 후보자 수 (삭제 차단 판단용)
  const candCounts: Record<string, number> = {}
  for (const c of cands) if (c.p === pid) candCounts[c.st] = (candCounts[c.st] || 0) + 1
  return (
    <StageEditor
      pid={pid}
      initialStages={stages}
      people={people}
      candCounts={candCounts}
      position={position}
    />
  )
}
