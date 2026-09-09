/* =========================================================
   배포본 자가 진단
   ---------------------------------------------------------
   "환경 변수를 넣었는데 왜 DB 를 못 보나" 를 눈으로 확인하려고 둔다.
   값은 절대 내보내지 않는다 — 있는지 없는지와 길이만 말한다.

   NEXT_PUBLIC_ 로 시작하는 값은 빌드할 때 코드에 박히고, 나머지는
   앱이 켜질 때 읽는다. 그래서 둘을 나눠서 보여 준다. 한쪽만 비어 있으면
   "환경 변수를 빌드 뒤에 넣었다" 는 뜻이다.
   ========================================================= */
import { NextResponse } from 'next/server'
import { serverClient } from '../../lib/supabase'

export const dynamic = 'force-dynamic'

const seen = (v?: string) => (v ? { ok: true, len: v.length } : { ok: false })

export async function GET() {
  const build = {
    NEXT_PUBLIC_SUPABASE_URL: seen(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: seen(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  }
  const runtime = {
    SUPABASE_SERVICE_ROLE_KEY: seen(process.env.SUPABASE_SERVICE_ROLE_KEY),
    REMINDER_TEST_TO: seen(process.env.REMINDER_TEST_TO),
    CORE_URL: seen(process.env.CORE_URL),
    VERCEL_PROJECT_PRODUCTION_URL: seen(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    VERCEL_GIT_COMMIT_SHA: seen(process.env.VERCEL_GIT_COMMIT_SHA),
  }

  // 실제로 DB 에 닿는지까지 한 번 찔러 본다.
  let db: { reached: boolean; error?: string; candidates?: number } = { reached: false }
  const sb = serverClient()
  if (sb) {
    const { count, error } = await sb.from('candidates').select('id', { count: 'exact', head: true })
    db = error ? { reached: false, error: error.message } : { reached: true, candidates: count ?? 0 }
  } else {
    db = { reached: false, error: 'serverClient() 가 null — 주소나 키가 비어 있음' }
  }

  return NextResponse.json({
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
    build, runtime, db,
  })
}
