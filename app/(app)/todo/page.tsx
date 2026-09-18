import RenderScreen from '../../components/RenderScreen'
import { todoHTML } from '../../lib/render'
import { currentSession, myViewer } from '../../lib/session'

/* TalentCore 계정으로 들어온 사람은 본인 할 일만 본다(?u= 무시).
   비밀번호 관리자·데모만 ?u= 로 다른 사람 화면을 골라 볼 수 있다. */
export default async function Page(
  { searchParams }: { searchParams: Promise<{ u?: string }> },
) {
  const { u } = await searchParams
  const v = myViewer(await currentSession())
  return <RenderScreen build={() => (v.pick ? todoHTML(u) : todoHTML(v.pid, true))} />
}
