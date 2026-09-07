/* POST /api/google/disconnect — 저장된 토큰을 지워 연결 해제. */
import { NextResponse } from 'next/server'
import { disconnectGoogle } from '../../../lib/google'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const origin = new URL(req.url).origin
  await disconnectGoogle()
  return NextResponse.redirect(`${origin}/settings?google=disconnected`, { status: 303 })
}
