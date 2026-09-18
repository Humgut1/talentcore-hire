import RenderScreen from '../../components/RenderScreen'
import { myHomeHTML } from '../../lib/render'
import { hydrateData } from '../../lib/db'
import { currentSession, myViewer } from '../../lib/session'

/* /todo 와 같은 규칙 — 계정 로그인은 본인 것만, 비밀번호 관리자·데모만 ?u= 로 고른다. */
export default async function Page(
  { searchParams }: { searchParams: Promise<{ u?: string }> },
) {
  const { u } = await searchParams
  await hydrateData()
  const v = myViewer(await currentSession())
  return <RenderScreen build={() => (v.pick ? myHomeHTML(u) : myHomeHTML(v.pid, true))} />
}
