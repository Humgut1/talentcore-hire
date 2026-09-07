import RenderScreen from '../components/RenderScreen'
import { exportHTML } from '../lib/render'

export default function Page() {
  return <RenderScreen build={exportHTML} />
}
