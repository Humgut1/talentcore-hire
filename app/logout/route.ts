/* 표를 버리고 문 앞으로 돌아간다. */
import { NextResponse } from 'next/server'
import { GATE_COOKIE } from '../lib/gate'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url))
  res.cookies.set(GATE_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
