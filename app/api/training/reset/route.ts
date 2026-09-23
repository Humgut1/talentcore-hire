/* =========================================================
   POST /api/training/reset — 연습 Hire 를 처음 상태로
   ---------------------------------------------------------
   Grow 교육 모드의 [연습 데이터 처음으로] 가 두드리는 문.
   Core 쪽 짝은 TalentCore 의 /api/training/reset 이다.

   연습 배포에서만 열린다(TRAINING_MODE=1 + TRAIN_RESET_TOKEN).
   실제 채용 배포에는 둘 다 없으므로 503 으로 닫혀 있다.
   ========================================================= */
import { NextResponse } from 'next/server'
import { trainingAuth, resetTrainingHire, resetTrainingPositions } from '../../../lib/training'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = trainingAuth(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  /* body { positions: [...] } 면 그 공고만 — 한 사람의 [처음으로]. 없으면 전체. */
  const body = await req.json().catch(() => ({})) as { positions?: unknown }
  const r = Array.isArray(body.positions)
    ? await resetTrainingPositions(body.positions.map(String))
    : await resetTrainingHire()
  return NextResponse.json(r, { status: r.ok ? 200 : 502 })
}
