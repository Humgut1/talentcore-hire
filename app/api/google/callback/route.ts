/* GET /api/google/callback — Google 이 code(또는 error)를 붙여 돌려보내는 곳.
   code 를 토큰으로 교환·저장하고 설정 화면으로 돌아간다. */
import { NextResponse } from 'next/server'
import { exchangeCode } from '../../../lib/google'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const origin = url.origin
  const error = url.searchParams.get('error')
  const code = url.searchParams.get('code')

  if (error) return NextResponse.redirect(`${origin}/settings?google=denied`)
  if (!code) return NextResponse.redirect(`${origin}/settings?google=nocode`)

  try {
    await exchangeCode(code)
    return NextResponse.redirect(`${origin}/settings?google=connected`)
  } catch {
    return NextResponse.redirect(`${origin}/settings?google=failed`)
  }
}
