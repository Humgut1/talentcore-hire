import LoginForm from '../../components/LoginForm'
import { passwordConfigured } from '../../lib/gate'

export const dynamic = 'force-dynamic'

export default async function Page(
  { searchParams }: { searchParams: Promise<{ next?: string }> },
) {
  const { next } = await searchParams
  /* 로그인 뒤 돌아갈 곳. 바깥 주소로 튕겨 보내는 데 쓰이지 않도록
     '/' 로 시작하고 '//' 가 아닌 것만 받는다. */
  const back = next && /^\/(?!\/)/.test(next) ? next : '/'
  return <LoginForm back={back} configured={passwordConfigured()} />
}
