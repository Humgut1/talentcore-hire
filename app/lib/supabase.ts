/* =========================================================
   Supabase 접속 클라이언트
   ※ 환경변수(.env.local)가 없으면 null을 돌려주고,
     앱은 기존 샘플 데이터로 그대로 동작합니다.
   ========================================================= */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY

/** .env.local 이 채워져 있는지 */
export const isSupabaseConfigured = Boolean(url && anon)

/** 서버 전용 클라이언트 (읽기·쓰기). service role 키가 있으면 그것을, 없으면 anon 키를 사용. */
export function serverClient(): SupabaseClient | null {
  const key = service || anon
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}
