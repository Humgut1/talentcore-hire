import RenderScreen from '../../components/RenderScreen'
import { dashboardHTML } from '../../lib/render'
import NoAccess from '../../components/NoAccess'
import { allow } from '../../lib/access'

export default async function Page() {
  if (!(await allow('staff'))) return <NoAccess />
  return <RenderScreen build={dashboardHTML} />
}
