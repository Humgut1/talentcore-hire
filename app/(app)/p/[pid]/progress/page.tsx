import RenderScreen from '../../../../components/RenderScreen'
import NoAccess from '../../../../components/NoAccess'
import { progressHTML } from '../../../../lib/render'
import { viewerScope, seePos, isAll } from '../../../../lib/access'

export default async function Page({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params
  const sc = await viewerScope()
  if (!seePos(sc, pid)) return <NoAccess />
  const staff = isAll(sc)
  return <RenderScreen build={() => progressHTML(pid, staff)} />
}
