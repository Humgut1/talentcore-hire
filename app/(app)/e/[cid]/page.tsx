import RenderScreen from '../../../components/RenderScreen'
import NoAccess from '../../../components/NoAccess'
import { evalCompareHTML } from '../../../lib/render'
import { viewerScope, seeCand, runCand } from '../../../lib/access'

export default async function Page({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params
  const sc = await viewerScope()
  if (!seeCand(sc, cid)) return <NoAccess />
  /* 면접관만인 사람은 평가를 비교해 볼 수는 있어도 판정하러 가는 버튼은 없다 */
  const judge = runCand(sc, cid)
  return <RenderScreen build={() => evalCompareHTML(cid, judge)} />
}
