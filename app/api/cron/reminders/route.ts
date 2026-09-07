/* =========================================================
   /api/cron/reminders — 임박한 리마인드 일괄 발송
   ---------------------------------------------------------
   외부 스케줄러(Vercel Cron 등)가 주기적으로 호출한다.
   아무나 부르면 스팸이 되므로 CRON_SECRET 으로 잠근다.
     · CRON_SECRET 미설정 → 개발 환경에서만 허용
     · 설정됨 → Authorization: Bearer <CRON_SECRET> 필요
   ========================================================= */
import { NextResponse } from 'next/server'
import { hydrateData } from '../../../lib/db'
import { sendDueReminders } from '../../../lib/send-reminders'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, reason: 'CRON_SECRET 미설정' }, { status: 401 })
  }

  await hydrateData()
  const report = await sendDueReminders()
  return NextResponse.json(report)
}
