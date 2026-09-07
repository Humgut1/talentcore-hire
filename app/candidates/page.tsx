import RenderScreen from '../components/RenderScreen'
import { candidatesHTML } from '../lib/render'

export default function Page() {
  return <RenderScreen build={candidatesHTML} />
}
