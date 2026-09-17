/* TalentCore 계정으로 로그인 — 출발 (H2)
   ---------------------------------------------------------
   되돌아올 때 "우리가 보낸 사람이 맞는지" 확인할 무작위 값(state)을
   이 브라우저 쿠키에 적어 두고 TalentCore 로 보낸다.
   남의 표를 주소에 붙여 이 브라우저에 밀어 넣는 공격은 이 값이 달라서 막힌다. */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SSO_COOKIE = 'hire_sso'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const core = (process.env.CORE_URL || '').trim().replace(/\/+$/, '')
  if (!core || !(process.env.CORE_API_TOKEN || '').trim()) {
    return NextResponse.redirect(new URL('/login?sso=unconfigured', req.url))
  }
  const next = url.searchParams.get('next') || '/'
  const back = /^\/(?!\/)/.test(next) ? next : '/'

  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const state = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')

  const res = NextResponse.redirect(core + '/sso/hire?state=' + state)
  res.cookies.set(SSO_COOKIE, state + '|' + encodeURIComponent(back), {
    httpOnly: true,
    sameSite: 'lax',          // TalentCore 에서 돌아오는 주소 이동에도 실려 와야 한다
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/core',
    maxAge: 600,
  })
  return res
}
