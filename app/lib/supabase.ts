/* =========================================================
   Supabase 접속 클라이언트
   ---------------------------------------------------------
   이 앱은 DB 를 서버에서만 만진다 — 화면에 뿌릴 HTML 을 서버가
   다 만들어서 내려보내고, 브라우저는 그 결과만 받는다.
   그래서 접속 주소와 열쇠도 브라우저까지 갈 이유가 없다.

   예전에는 이름이 NEXT_PUBLIC_ 으로 시작했다. 그 접두사는
   "이 값을 브라우저에도 넣어라" 는 뜻이라서, 언젠가 누가
   클라이언트 파일에서 이 값을 한 번만 읽어도 그 순간 열쇠가
   페이지 소스에 그대로 박혀 나간다. 미리 막아 두려고 접두사를 뗐다.
   접두사를 떼면 값은 앱이 켜질 때 읽힌다(= 빌드에 박히지 않는다).
   Vercel 에서 값만 고치고 다시 배포하면 바로 반영된다는 뜻이기도 하다.

   옛 이름(NEXT_PUBLIC_…)도 계속 받아 준다. 아직 그 이름으로
   설정해 둔 곳이 있어도 갑자기 죽지 않게 두려는 그물이다.
   ========================================================= */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL          // 옛 이름 (호환용)
const anon =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY     // 옛 이름 (호환용)
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

/** .env.local 이 채워져 있는지 */
export const isSupabaseConfigured = Boolean(url && anon)

/** 서버 전용 클라이언트 (읽기·쓰기). service role 키가 있으면 그것을, 없으면 anon 키를 사용. */
export function serverClient(): SupabaseClient | null {
  const key = service || anon
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}
