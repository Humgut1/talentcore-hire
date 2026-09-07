import RenderScreen from '../../../../components/RenderScreen'
import { linksHTML } from '../../../../lib/render'

export default async function Page({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params
  return <RenderScreen build={() => linksHTML(pid)} />
}
