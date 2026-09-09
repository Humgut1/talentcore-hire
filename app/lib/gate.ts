/* =========================================================
   문지기 — 누가 들어올 수 있는가 (B)

   이 앱은 후보자 이름·연락처·면접 평가·처우안을 담고 있다.
   주소만 알면 아무나 볼 수 있는 상태로 두면 안 된다.

   ---------------------------------------------------------
   그런데 전부 막으면 제품이 죽는다.
   면접관과 후보자에게 보내는 링크(/iv /brief /avail /book /pick)는
   "계정 없이 링크만으로 열린다"가 설계다 — 링크에 붙은 토큰이 열쇠다.
   채용 사이트(/careers)는 애초에 공개하려고 만든 화면이다.
   그래서 문은 화면마다가 아니라 **주소 규칙 한 곳**에서 가른다.

   ---------------------------------------------------------
   표는 두 가지다.
   · full — 비밀번호를 아는 사람. 전부 할 수 있다.
   · demo — 포트폴리오 표지에서 넘어온 사람. 전부 볼 수 있고 아무것도 못 바꾼다.
     (TalentCore 의 /demo 와 같은 규칙이다. 두 제품이 다르게 굴면 설명이 두 배가 된다.)

   ---------------------------------------------------------
   ★ 모르는 주소는 막는다 ★
   아래 목록은 '열어 둘 곳'이지 '막을 곳'이 아니다.
   나중에 화면이 하나 늘었을 때, 깜빡하면 열리는 게 아니라 닫히는 쪽이어야 한다.
   ========================================================= */

export const GATE_COOKIE = 'hire_gate'

export type GateRole = 'full' | 'demo'

/** 표에 찍는 도장. 없으면 표를 만들 수도 읽을 수도 없다(= 전부 잠긴다). */
function secret(): string {
  return (
    process.env.HIRE_SESSION_SECRET ||
    // 전용 값을 안 넣어 뒀어도 문이 열리지는 않게, 서버에만 있는 다른 열쇠를 빌린다.
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  )
}

/** 비밀번호가 설정돼 있는가. 없으면 'full' 로는 아무도 못 들어온다(데모는 열린다). */
export function passwordConfigured(): boolean {
  return Boolean(process.env.HIRE_PASSWORD)
}

const enc = new TextEncoder()

async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 표 한 장을 발급한다. `역할.만료시각.서명` */
export async function issueTicket(role: GateRole, days: number): Promise<string> {
  const exp = Date.now() + days * 86_400_000
  const body = `${role}.${exp}`
  return `${body}.${await hmac(body)}`
}

/** 표를 읽는다. 위조·만료·도장 없음은 전부 null(= 못 들어옴). */
export async function readTicket(raw: string | undefined | null): Promise<GateRole | null> {
  if (!raw || !secret()) return null
  const parts = raw.split('.')
  if (parts.length !== 3) return null
  const [role, expStr, sig] = parts
  if (role !== 'full' && role !== 'demo') return null

  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp <= Date.now()) return null

  const want = await hmac(`${role}.${exp}`)
  if (sig.length !== want.length) return null
  /* 글자를 하나씩 비교하다 다르면 바로 멈추면, 걸린 시간으로 서명을 맞혀 볼 수 있다.
     끝까지 다 보고 마지막에 판단한다. */
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= sig.charCodeAt(i) ^ want.charCodeAt(i)
  return diff === 0 ? (role as GateRole) : null
}

/* ---------------------------------------------------------
   문지기를 지나지 않는 길
   --------------------------------------------------------- */

const OPEN_EXACT = new Set([
  '/login', '/demo', '/logout',
  '/favicon.ico', '/robots.txt', '/sitemap.xml',
])

const OPEN_PREFIX = [
  '/careers',              // 공개 채용 사이트 — 공개가 목적인 화면
  '/pick/',                // 후보자: 면접 시간 고르기 (링크 토큰이 열쇠)
  '/book/',                // 후보자: 셀프 예약
  '/iv/',                  // 면접관: 시간 확정 / 불가 사유
  '/brief/',               // 면접관: 면접 브리핑
  '/avail/',               // 면접관: 가능한 시간 저장
  '/_next/',               // 프레임워크가 쓰는 정적 파일
  '/assets/',
]

/* API 는 화면이 아니라 기계가 부르는 문이라 각자 열쇠가 따로 있다.
   여기 적힌 것만 문지기를 건너뛴다 — 나머지 API 는 사람과 같이 막힌다. */
const OPEN_API = [
  '/api/openings',         // TalentCore → Hire (CORE_INBOUND_TOKEN)
  '/api/directory/sync',   // TalentCore → Hire (CORE_INBOUND_TOKEN)
  '/api/cron/',            // 예약 실행 (CRON_SECRET)
  '/api/google/callback',  // 구글이 되돌려 보내는 주소 — 우리 쿠키가 없다
  '/api/dev-seed',         // 스스로 개발 환경에서만 동작한다
]

/** 이 주소는 표 없이 열리는가 */
export function isOpenPath(path: string): boolean {
  if (OPEN_EXACT.has(path)) return true
  if (OPEN_PREFIX.some(p => path === p.slice(0, -1) || path.startsWith(p))) return true
  if (OPEN_API.some(p => path === p || path.startsWith(p.endsWith('/') ? p : p + '/'))) return true
  return false
}

/* ---------------------------------------------------------
   데모가 못 하는 일
   ---------------------------------------------------------
   Next 는 화면에서 서버 함수를 부를 때 요청에 Next-Action 표식을 붙인다.
   저장·수정·삭제는 전부 그 길로 지나가므로, 그 표식 하나만 보면
   함수 55 개를 하나씩 손대지 않고도 한 곳에서 막을 수 있다.

   공개 주소(/iv /book /avail /pick /careers)에서 나가는 서버 함수는
   면접관·후보자가 자기 일을 하는 것이므로 여기 걸리지 않는다 —
   애초에 문지기를 지나지 않는 길이다.
   --------------------------------------------------------- */
export function isWriteAttempt(method: string, headers: Headers): boolean {
  if (method !== 'POST') return false
  return headers.has('next-action')
}
