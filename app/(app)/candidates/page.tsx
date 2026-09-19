import RenderScreen from '../../components/RenderScreen'
import { candidatesHTML } from '../../lib/render'
import { viewerScope, seeCand } from '../../lib/access'
import { cands } from '../../lib/data'

export default async function Page() {
  /* 하이어링 매니저·면접관은 자기 공고의 후보자와 자기가 면접 보는 후보자만. */
  const sc = await viewerScope()
  return <RenderScreen build={() => candidatesHTML(cands.filter(c => seeCand(sc, c.id)))} />
}
