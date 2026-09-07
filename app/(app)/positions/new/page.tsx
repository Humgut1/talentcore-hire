import NewPosition from '../../../components/NewPosition'
import { hydrateData } from '../../../lib/db'
import { people, positions } from '../../../lib/data'

export default async function Page() {
  await hydrateData()
  /* 부문 목록은 따로 관리하는 표가 없다 — 지금 있는 공고·사람에서 뽑아 쓴다.
     조직 트리는 TalentCore(HRIS)의 것이라, 연결되면 거기서 받아 온다. */
  const depts = Array.from(new Set([
    ...positions.map(p => p.dept),
    ...people.map(p => p.dept),
  ].filter(Boolean))).sort()
  return <NewPosition people={people} depts={depts} />
}
