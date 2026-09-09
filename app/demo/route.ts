/* 표지의 '채용 화면 보기' 가 도착하는 곳.
   누르면 바로 안으로 들어간다 — 대신 읽기 전용 표를 준다.
   TalentCore 의 /demo 와 같은 규칙이라 두 제품이 같은 방식으로 열린다. */
import { NextResponse } from 'next/server'
import { GATE_COOKIE, issueTicket } from '../lib/gate'

export const dynamic = 'force-dynamic'

const DAYS = 1

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/', req.url))
  res.cookies.set(GATE_COOKIE, await issueTicket('demo', DAYS), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: DAYS * 86_400,
  })
  return res
}
