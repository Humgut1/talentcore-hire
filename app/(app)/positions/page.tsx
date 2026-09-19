import RenderScreen from '../../components/RenderScreen'
import { positionsHTML } from '../../lib/render'
import { viewerScope, seePos, isAll } from '../../lib/access'
import { positions } from '../../lib/data'

export default async function Page() {
  /* 하이어링 매니저는 자기 공고만, 설정·생성 버튼 없이. */
  const sc = await viewerScope()
  return <RenderScreen build={() => positionsHTML(positions.filter(p => seePos(sc, p.id)), isAll(sc))} />
}
