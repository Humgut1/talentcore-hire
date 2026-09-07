import RenderScreen from '../../components/RenderScreen'
import { evalCompareHTML } from '../../lib/render'

export default async function Page({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params
  return <RenderScreen build={() => evalCompareHTML(cid)} />
}
