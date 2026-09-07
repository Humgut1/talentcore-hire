import RenderScreen from '../../components/RenderScreen'
import { dashboardHTML } from '../../lib/render'

export default function Page() {
  return <RenderScreen build={dashboardHTML} />
}
