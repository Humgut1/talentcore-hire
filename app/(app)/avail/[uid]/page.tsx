import AvailClient from '../../../components/AvailClient'
import { hydrateData } from '../../../lib/db'
import { TODAY } from '../../../lib/data'
import { availGrid } from '../../../lib/availability'

/* 외부 면접관 링크 ④ — 가능한 시간 알려주기.
   후보자별이 아니라 사람별 링크다. 면접관이 한 번 저장해두면
   그 뒤의 모든 일정 탐색이 이 값을 쓴다(면접 건마다 다시 묻지 않는다). */
export default async function Page(
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params
  await hydrateData()
  return <AvailClient data={availGrid(uid, TODAY, 14)} />
}
