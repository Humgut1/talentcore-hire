/* =========================================================
   배포본 자가 진단
   ---------------------------------------------------------
   "환경 변수를 넣었는데 왜 DB 를 못 보나" 를 눈으로 확인하려고 둔다.
   값은 절대 내보내지 않는다 — 있는지 없는지, 길이, 그리고
   "이상한 글자가 섞였는지"만 말한다.

   bad 가 true 로 나오면 값 안에 영문·숫자·기호가 아닌 글자가 있다는 뜻이다.
   호스팅 화면이 가려서 보여 주는 값(eyJ••••••)을 그대로 복사해 붙여 넣으면
   가운뎃점 • 이 그대로 저장되는데, 겉보기 길이는 맞아서 눈으로는 못 잡는다.
   그걸 여기서 잡으라고 둔 항목이다.

   env 아래 값들은 전부 앱이 켜질 때 읽는다(빌드에 박히지 않는다).
   값을 고쳤으면 다시 배포만 하면 반영된다.
   ========================================================= */
import { NextResponse } from 'next/server'
import { serverClient } from '../../lib/supabase'

export const dynamic = 'force-dynamic'

/** 있는지·길이·이상한 글자 유무만 돌려준다. 값 자체는 절대 나가지 않는다. */
const seen = (v?: string) => {
  if (!v) return { ok: false }
  const bad = /[^\x20-\x7E]/.test(v)          // 눈에 보이는 ASCII 밖의 글자 = 오염
  return bad ? { ok: true, len: v.length, bad: true } : { ok: true, len: v.length }
}

export async function GET() {
  const env = {
    SUPABASE_URL: seen(process.env.SUPABASE_URL),
    SUPABASE_ANON_KEY: seen(process.env.SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: seen(process.env.SUPABASE_SERVICE_ROLE_KEY),
    REMINDER_TEST_TO: seen(process.env.REMINDER_TEST_TO),
    CORE_URL: seen(process.env.CORE_URL),
    CORE_API_TOKEN: seen(process.env.CORE_API_TOKEN),
    CORE_INBOUND_TOKEN: seen(process.env.CORE_INBOUND_TOKEN),
    VERCEL_PROJECT_PRODUCTION_URL: seen(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    VERCEL_GIT_COMMIT_SHA: seen(process.env.VERCEL_GIT_COMMIT_SHA),
  }
  // 옛 이름으로 아직 설정돼 있으면 여기 뜬다 (지워도 되는지 판단하라고).
  const legacy = {
    NEXT_PUBLIC_SUPABASE_URL: seen(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: seen(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
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
    env, legacy, db,
  })
}
