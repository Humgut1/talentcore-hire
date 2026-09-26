/* =========================================================
   GET /api/screen?cid=후보자id — AI 1차 면접 요약 (SC4)
   읽기는 GET 으로 — 데모 표는 서버 함수를 전부 막으므로.
   ========================================================= */
import { NextResponse } from 'next/server'
import { screenView } from '../../lib/screen-actions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const cid = new URL(req.url).searchParams.get('cid') ?? ''
  if (!cid) return NextResponse.json({ ok: false, reason: 'no-candidate' }, { status: 400 })
  try {
    return NextResponse.json(await screenView(cid))
  } catch {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
  }
}
