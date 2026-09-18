import NewPosition, { type CopySource } from '../../../components/NewPosition'
import { hydrateData } from '../../../lib/db'
import { people, positions, stagesOf } from '../../../lib/data'

export default async function Page() {
  await hydrateData()
  /* 부문 목록은 따로 관리하는 표가 없다 — 지금 있는 공고·사람에서 뽑아 쓴다.
     조직 트리는 TalentCore(HRIS)의 것이라, 연결되면 거기서 받아 온다. */
  const depts = Array.from(new Set([
    ...positions.map(p => p.dept),
    ...people.map(p => p.dept),
  ].filter(Boolean))).sort()
  /* 이전 공고 복사용 — 최근에 연 것부터. 단계는 지원 접수·끝 레일을 뺀 몸통만 넘긴다. */
  const sources: CopySource[] = [...positions]
    .sort((a, b) => (b.opened || '').localeCompare(a.opened || ''))
    .map(p => ({
      id: p.id, title: p.title, dept: p.dept, team: p.team, emp: p.emp,
      rec: p.rec, hm: p.hm, band: p.band ? [p.band[0], p.band[1]] : [0, 0],
      jd: p.jd, st: p.st, opened: p.opened,
      stages: stagesOf(p.id)
        .filter(s => !s.rail && s.kind !== 'apply')
        .map(s => ({ nm: s.nm, kind: s.kind, sla: s.sla, dur: s.dur, mode: s.mode, ivs: s.ivs, auto: s.auto })),
    }))
  return <NewPosition people={people} depts={depts} sources={sources} />
}
