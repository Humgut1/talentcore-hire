/* =========================================================
   POST /api/directory/sync — TalentCore 직원 명부 당겨오기 (T4)
   ---------------------------------------------------------
   화면의 [지금 동기화] 버튼은 서버 액션을 쓴다. 이 문은 그 바깥용이다.
   · 하루 한 번 도는 스케줄러(cron, Vercel Cron, 사내 잡)가 두드리는 곳
   · 인사팀에서 대규모 인사이동을 반영한 직후 즉시 맞추고 싶을 때

   인증은 들어오는 문과 같은 열쇠(CORE_INBOUND_TOKEN)를 쓴다.
   토큰이 없으면 문 자체가 닫혀 있다(503) — inbound 와 같은 3상태 규칙.
   ========================================================= */
import { NextResponse } from 'next/server'
import { checkInbound } from '../../../lib/inbound'
import { syncDirectory } from '../../../lib/directory'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = checkInbound(req)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const r = await syncDirectory()
  if (!r.ok) {
    /* 설정이 안 된 것과 저쪽이 안 뜬 것은 다른 문제다. 상태 코드로 갈라 준다 —
       스케줄러가 재시도할 값어치가 있는지 여기서 판단할 수 있어야 한다. */
    const status = r.reason === 'core-not-configured' || r.reason === 'not-configured' ? 503
      : r.reason === 'unauthorized' ? 401
      : 502
    return NextResponse.json({ ok: false, error: r.reason, detail: r.detail }, { status })
  }
  return NextResponse.json(r)
}
