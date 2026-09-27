/* =========================================================
   GET /api/screen/answers?cid=후보자id&iv=면접id — [영상 보기] (SC8)
   그 후보자를 볼 수 있는 사람만. 읽기는 GET 으로 — 데모 표는 서버 함수를 전부 막으므로.
   ========================================================= */
import { NextResponse } from 'next/server'
import { screenAnswersView } from '../../../lib/screen-actions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const cid = q.get('cid') ?? ''
  const iv = q.get('iv') ?? ''
  if (!cid || !iv) return NextResponse.json({ ok: false, reason: 'error' }, { status: 400 })
  try {
    return NextResponse.json(await screenAnswersView(cid, iv), { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 })
  }
}
