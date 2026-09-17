import StageEditor from '../../../../components/StageEditor'
import AutoRules, { type SlaRow } from '../../../../components/AutoRules'
import MtgSetup from '../../../../components/MtgSetup'
import { hydrateData } from '../../../../lib/db'
import { stagesOf, posById, people, cands, auto } from '../../../../lib/data'
import { mtgViews, attendeePool } from '../../../../lib/meetings'

/* 공고 설정 = 전형 단계 + 공개 정보 + 자동화.
   예전에는 자동화가 따로 탭이었는데, 둘 다 "이 공고를 어떻게 굴릴지" 라서 한 화면에 둔다. */
export default async function Page({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params
  await hydrateData()
  const stages = stagesOf(pid)
  const position = posById(pid)
  // 단계별 진행 중 후보자 수 (삭제 차단 판단용)
  const candCounts: Record<string, number> = {}
  for (const c of cands) if (c.p === pid) candCounts[c.st] = (candCounts[c.st] || 0) + 1
  // 단계별 SLA 현황(읽기 전용): 기준 체류일 대비 현재 평균·초과 인원
  const mine = cands.filter(c => c.p === pid)
  const slaRows: SlaRow[] = stages.filter(s => !s.rail).map(s => {
    const on = mine.filter(c => c.st === s.id)
    const avg = on.length ? on.reduce((x, c) => x + c.d, 0) / on.length : 0
    return {
      nm: s.nm, kind: s.kind, dur: s.dur, color: s.color,
      sla: s.sla, avg, over: on.filter(c => c.d > s.sla).length,
    }
  })
  return (
    <StageEditor
      pid={pid}
      initialStages={stages}
      people={people}
      candCounts={candCounts}
      position={position}
    >
      <AutoRules pid={pid} initialAuto={auto[pid] || auto.p1} slaRows={slaRows} />
      {/* 내부 미팅 참석자 — 킥오프·디브리프에 누가 들어오는지도 '이 공고를 어떻게 굴릴지'다. */}
      <MtgSetup pid={pid} mtgs={mtgViews(pid)} pool={attendeePool(pid)} />
    </StageEditor>
  )
}
