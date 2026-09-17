import LoginForm from '../../components/LoginForm'
import { passwordConfigured } from '../../lib/gate'

export const dynamic = 'force-dynamic'

export default async function Page(
  { searchParams }: { searchParams: Promise<{ next?: string; sso?: string }> },
) {
  const { next, sso } = await searchParams
  /* 로그인 뒤 돌아갈 곳. 바깥 주소로 튕겨 보내는 데 쓰이지 않도록
     '/' 로 시작하고 '//' 가 아닌 것만 받는다. */
  const back = next && /^\/(?!\/)/.test(next) ? next : '/'
  const coreReady = !!((process.env.CORE_URL || '').trim() && (process.env.CORE_API_TOKEN || '').trim())
  return <LoginForm back={back} configured={passwordConfigured()} sso={sso} coreReady={coreReady} />
}
