/* =========================================================
   GET /api/iv/rooms?id=면접id — 확정된 면접의 면접실 추천·잡은 방 (회의실·온보딩 V1 W5)
   ---------------------------------------------------------
   화면 읽기는 서버 함수가 아니라 이 GET 으로 한다.
   데모 표는 서버 함수(POST + Next-Action)를 전부 막으므로, 읽기까지 막히지 않게.
   잡기·놓기·장소 안내는 쓰기라서 서버 함수(iv-actions)로 두고 데모에서 막힌다.
   ========================================================= */
import { NextResponse } from 'next/server'
import { ivRoomView } from '../../../lib/iv-actions'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ ok: false, reason: 'no-interview' }, { status: 400 })
  return NextResponse.json(await ivRoomView(id))
}
