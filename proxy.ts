/* =========================================================
   문 (모든 요청이 여기를 먼저 지난다)

   규칙은 app/lib/gate.ts 에 있다. 여기는 그 규칙을 실행만 한다.
   두 곳에 규칙을 나눠 적으면 언젠가 한쪽만 고치게 된다.

   Next 16 에서 이 파일의 이름은 proxy.ts 다(예전 이름은 middleware.ts).
   ========================================================= */
import { NextResponse, type NextRequest } from 'next/server'
import { GATE_COOKIE, isOpenPath, isWriteAttempt, readTicket } from './app/lib/gate'

export default async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl
  const role = await readTicket(req.cookies.get(GATE_COOKIE)?.value)

  /* 이미 표가 있는 사람이 로그인 화면에 오면 되돌려 보낸다.
     (브라우저가 기억한 /login 을 눌렀을 때 빈 화면을 보지 않게) */
  if (pathname === '/login' && role) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  if (isOpenPath(pathname)) return NextResponse.next()

  if (!role) {
    /* 서버 함수 호출은 리다이렉트를 받아도 화면이 못 알아듣는다 — 숫자로 답한다. */
    if (isWriteAttempt(req.method, req.headers)) {
      return new NextResponse('로그인이 필요합니다', { status: 401 })
    }
    const to = new URL('/login', req.url)
    // 로그인 뒤 원래 보려던 곳으로 돌려보내기 위한 메모
    if (pathname !== '/') to.searchParams.set('next', pathname + search)
    return NextResponse.redirect(to)
  }

  /* 데모는 전부 볼 수 있고 아무것도 못 바꾼다. */
  if (role === 'demo' && isWriteAttempt(req.method, req.headers)) {
    return new NextResponse('데모에서는 저장·수정이 잠겨 있습니다', { status: 403 })
  }

  return NextResponse.next()
}

export const config = {
  /* 정적 파일까지 매번 이 함수를 태우면 느려지기만 한다.
     실제 판단은 위 isOpenPath 가 다시 하므로 여기는 성능용 그물이다. */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
