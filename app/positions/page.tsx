import RenderScreen from '../components/RenderScreen'
import { positionsHTML } from '../lib/render'

export default function Page() {
  return <RenderScreen build={positionsHTML} />
}
