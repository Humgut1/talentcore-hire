/* =========================================================
   POST /api/training/applicants — 연습 지원자 3명 보내기
   ---------------------------------------------------------
   교육에서는 진짜 지원자를 기다릴 수 없다. 미션이 "지원자가 들어왔습니다"
   로 넘어갈 때 Grow 가 이 문을 두드려 세 명을 넣는다.
   본문 { position_id } 를 주면 그 공고, 안 주면 가장 최근 공고.

   연습 배포에서만 열린다 — 판단은 reset 과 같은 열쇠 한 쌍.
   ========================================================= */
import { NextResponse } from 'next/server'
import { trainingAuth, addTrainingApplicants } from '../../../lib/training'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = trainingAuth(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  let pid = ''
  try {
    const b = await req.json() as { position_id?: string }
    pid = (b?.position_id || '').trim()
  } catch { /* 본문이 없어도 된다 — 그러면 가장 최근 공고 */ }

  const r = await addTrainingApplicants(pid)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
