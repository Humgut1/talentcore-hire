/* =========================================================
   Cadence 로 들어오는 문 — 인증 (T3)
   ---------------------------------------------------------
   TalentCore(HRIS)가 승인된 자리 카드를 밀어 넣는 문 하나뿐이다.
   구글·메일과 같은 3상태 규칙을 따른다.

     unconfigured  토큰이 없다 → 문이 아예 닫혀 있다(401). 화면에는
                   "TalentCore 연동 안 됨"이라고만 뜨고 아무 일도 안 한다.
     configured    토큰이 있다 → 헤더가 일치할 때만 받는다.

   토큰은 .env.local 의 CORE_INBOUND_TOKEN 하나로 끝난다.
   TalentCore 쪽 설정 화면에 같은 값을 넣어야 문이 열린다.
   ※ 이 값은 비밀이다. 저장소에 올리지 않는다.
   ========================================================= */

export type InboundState = 'unconfigured' | 'configured'

export function inboundState(): InboundState {
  return process.env.CORE_INBOUND_TOKEN ? 'configured' : 'unconfigured'
}

/* 타이밍 공격을 신경 쓸 만큼 민감한 문은 아니지만, 길이가 다르면
   먼저 잘라내고 같은 길이일 때만 전부 비교한다(조기 반환을 없앤다). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface AuthResult { ok: boolean; status: number; error?: string }

export function checkInbound(req: Request): AuthResult {
  const expected = process.env.CORE_INBOUND_TOKEN
  if (!expected) return { ok: false, status: 503, error: 'inbound not configured' }

  const got = req.headers.get('x-api-token') || ''
  if (!got) return { ok: false, status: 401, error: 'missing X-API-Token' }
  if (!safeEqual(got, expected)) return { ok: false, status: 401, error: 'invalid token' }
  return { ok: true, status: 200 }
}
