/* TalentCore 계정으로 로그인 — 도착 (H2)
   ---------------------------------------------------------
   1) 출발할 때 적어 둔 state 와 표 속 state 가 같은지
   2) 표를 TalentCore 에 서버끼리 다시 물어 누구인지 받는다(X-API-Token)
   3) Hire 사용자 명단에 적는다 — 승인 대기면 들여보내지 않는다
   4) 승인된 사람에게만 표(쿠키)를 준다 */
import { NextResponse, type NextRequest } from 'next/server'
import { GATE_COOKIE, USER_DAYS, issueUserTicket, APP_ROLES, type AppRole } from '../../../lib/gate'
import { hydrateData } from '../../../lib/db'
import { loginUpsert, type CoreUser } from '../../../lib/users'

export const dynamic = 'force-dynamic'

const SSO_COOKIE = 'hire_sso'
/* 로그인 유지 기간은 gate.ts 의 USER_DAYS 하나로 둔다 — 문지기가 기간을 미뤄 주므로
   두 곳에 적으면 발급 기간과 연장 기간이 어긋난다. */

function back(req: Request, q: string) {
  const res = NextResponse.redirect(new URL('/login?sso=' + q, req.url))
  res.cookies.set(SSO_COOKIE, '', { path: '/api/auth/core', maxAge: 0 })
  return res
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const t = url.searchParams.get('t') || ''
  const raw = req.cookies.get(SSO_COOKIE)?.value || ''
  const cut = raw.indexOf('|')
  const state = cut > 0 ? raw.slice(0, cut) : ''
  const nextEnc = cut > 0 ? raw.slice(cut + 1) : ''
  if (!t || !state) return back(req, 'expired')

  const core = (process.env.CORE_URL || '').trim().replace(/\/+$/, '')
  const token = (process.env.CORE_API_TOKEN || '').trim()
  if (!core || !token) return back(req, 'unconfigured')

  let body: { ok?: boolean; state?: string; user?: CoreUser; error?: string }
  try {
    const r = await fetch(core + '/api/sso/verify', {
      method: 'POST',
      headers: { 'X-API-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ t }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    body = await r.json().catch(() => ({}))
    if (!r.ok || !body.ok || !body.user) {
      return back(req, body.error === 'expired' ? 'expired' : body.error === 'inactive user' ? 'inactive' : 'failed')
    }
  } catch {
    return back(req, 'unreachable')
  }
  if (body.state !== state) return back(req, 'failed')

  await hydrateData()
  const up = await loginUpsert(body.user)
  if (!up.ok) return back(req, up.reason === 'no-table' ? 'setup' : 'failed')
  const u = up.user
  if (u.st === 'blocked') return back(req, 'blocked')
  if (u.st !== 'active' || !u.role || !APP_ROLES.includes(u.role)) return back(req, 'pending')

  const next = decodeURIComponent(nextEnc || '')
  const res = NextResponse.redirect(new URL(/^\/(?!\/)/.test(next) ? next : '/', req.url))
  res.cookies.set(GATE_COOKIE, await issueUserTicket(
    { uid: u.id, urole: u.role as AppRole, nm: u.nm, pid: u.person_id }, USER_DAYS,
  ), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: USER_DAYS * 86_400,
  })
  res.cookies.set(SSO_COOKIE, '', { path: '/api/auth/core', maxAge: 0 })
  return res
}
