/* GET /api/google/auth — Google 동의 화면으로 리다이렉트.
   키 미설정이면 설정 화면으로 되돌리며 안내 플래그를 붙인다. */
import { NextResponse } from 'next/server'
import { googleConfigured, authUrl } from '../../../lib/google'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}/settings?google=unconfigured`)
  }
  return NextResponse.redirect(authUrl())
}
