/* =========================================================
   POST /api/training/snapshot — Grow 검사기가 연습 Hire 결과를 읽는 문
   ---------------------------------------------------------
   body { positions: ['p1', …] } — 누구 공고인가는 TalentCore 가 안다(external_ref).
   읽기 전용. 연습 배포에서만 열린다(TRAINING_MODE=1 + TRAIN_RESET_TOKEN).
   ========================================================= */
import { NextResponse } from 'next/server'
import { trainingAuth, trainingSnapshot } from '../../../lib/training'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = trainingAuth(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => ({})) as { positions?: unknown }
  const ids = Array.isArray(body.positions) ? body.positions.map(String) : []
  const r = await trainingSnapshot(ids)
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
