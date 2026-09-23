/* =========================================================
   문지기 — 누가 들어올 수 있는가 (B)

   이 앱은 후보자 이름·연락처·면접 평가·처우안을 담고 있다.
   주소만 알면 아무나 볼 수 있는 상태로 두면 안 된다.

   ---------------------------------------------------------
   그런데 전부 막으면 제품이 죽는다.
   면접관과 후보자에게 보내는 링크(/iv /avail /book /pick)는
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

/* TalentCore 계정으로 들어온 사람(H2)의 Hire 역할. HR Admin 이 승인하며 정한다. */
export type AppRole = 'admin' | 'recruiter' | 'hm' | 'interviewer'
export const APP_ROLES: AppRole[] = ['admin', 'recruiter', 'hm', 'interviewer']
export const ROLE_LABEL: Record<AppRole, string> = {
  admin: 'HR Admin', recruiter: '리크루터', hm: '하이어링 매니저', interviewer: '면접관',
}

/** 표에 적힌 사람. 비밀번호로 들어온 표에는 uid 가 없다(= 관리자 비상 출입). */
export interface GateSession {
  role: GateRole
  uid?: string        // app_users.id (core:<tenant>:<user>)
  urole?: AppRole
  nm?: string
  pid?: string        // Hire 명부 사람 id — 면접관 본인 확인에 쓴다
  exp: number         // 이 표가 언제까지 유효한가 (ms)
}

/* 로그인 유지 기간 — TalentCore 계정으로 들어온 사람의 표.
   이 표는 '브라우저를 닫아도 남는' 기간이다. 7일 동안 한 번도 안 들어오면 다시 로그인.
   대신 쓰는 동안에는 지나갈 때마다 기간을 다시 7일로 미뤄 준다(아래 shouldSlide).
   → 매일 쓰는 사람은 로그인 화면을 다시 볼 일이 없고,
     두고 간 컴퓨터의 표는 일주일 뒤 저절로 죽는다. */
export const USER_DAYS = 7

/** 표를 새로 발급해 줄 때가 됐는가 — 하루 넘게 쓴 표만 갱신한다(요청마다 쓰지 않게). */
export function shouldSlide(exp: number, now = Date.now()): boolean {
  const left = exp - now
  return left > 0 && left < (USER_DAYS - 1) * 86_400_000
}

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

/* 사람 정보는 표 가운데 칸에 base64url 로 싣는다. 점(.)이 섞이지 않게. */
function b64e(s: string): string {
  let bin = ''
  enc.encode(s).forEach(b => { bin += String.fromCharCode(b) })
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64d(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)))
}

/** TalentCore 계정으로 들어온 사람의 표. `full.만료.사람.서명` */
export async function issueUserTicket(
  u: { uid: string; urole: AppRole; nm: string; pid?: string | null }, days: number,
): Promise<string> {
  const exp = Date.now() + Math.round(days * 86_400_000)
  const body = 'full.' + exp + '.' + b64e(JSON.stringify({ u: u.uid, r: u.urole, n: u.nm, p: u.pid || undefined }))
  return body + '.' + await hmac(body)
}

/** 표를 읽는다. 위조·만료·도장 없음은 전부 null(= 못 들어옴). */
export async function readTicket(raw: string | undefined | null): Promise<GateRole | null> {
  return (await readSession(raw))?.role ?? null
}

/** 표를 읽어 누가 들고 왔는지까지 돌려준다. */
export async function readSession(raw: string | undefined | null): Promise<GateSession | null> {
  if (!raw || !secret()) return null
  const parts = raw.split('.')
  if (parts.length !== 3 && parts.length !== 4) return null
  const [role, expStr] = parts
  const sig = parts[parts.length - 1]
  const who = parts.length === 4 ? parts[2] : null
  if (role !== 'full' && role !== 'demo') return null
  if (who !== null && role !== 'full') return null

  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp <= Date.now()) return null

  const want = await hmac(parts.slice(0, -1).join('.'))
  if (sig.length !== want.length) return null
  /* 글자를 하나씩 비교하다 다르면 바로 멈추면, 걸린 시간으로 서명을 맞혀 볼 수 있다.
     끝까지 다 보고 마지막에 판단한다. */
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= sig.charCodeAt(i) ^ want.charCodeAt(i)
  if (diff !== 0) return null
  if (who === null) return { role: role as GateRole, exp }
  try {
    const j = JSON.parse(b64d(who)) as { u?: string; r?: string; n?: string; p?: string }
    if (!j.u || !APP_ROLES.includes(j.r as AppRole)) return null
    return { role: 'full', uid: j.u, urole: j.r as AppRole, nm: j.n || '', pid: j.p || undefined, exp }
  } catch {
    return null
  }
}

/* ---------------------------------------------------------
   링크 열쇠 — 계정 없이 여는 주소 (오퍼 O2)
   ---------------------------------------------------------
   후보자에게 보내는 오퍼레터 주소(/offer/…)에는 로그인이 없다. 대신
   주소 자체가 열쇠다. 후보자 번호를 그대로 쓰면 c51 → c52 로 바꿔
   남의 처우안이 열리므로, 서명과 기한을 붙인 토큰으로 만든다.
   면접 링크(/pick /iv)는 표에 토큰 칸이 있지만 오퍼에는 없다 —
   칸을 늘리지 않고 서명만으로 같은 일을 한다.
   --------------------------------------------------------- */

/** `종류.값.만료.서명` — 값에 점(.)이 없는 id 만 싣는다(후보자 번호). */
export async function issueLinkToken(kind: string, id: string, days: number): Promise<string> {
  if (!secret()) return ''
  const exp = Date.now() + Math.round(days * 86_400_000)
  const body = `${kind}.${id}.${exp}`
  return `${body}.${await hmac(body)}`
}

/** 토큰을 읽는다. 종류가 다르거나·위조·기한이 지났으면 null. */
export async function readLinkToken(kind: string, raw: string | undefined | null): Promise<string | null> {
  if (!raw || !secret()) return null
  const parts = raw.split('.')
  if (parts.length !== 4) return null
  const [k, id, expStr, sig] = parts
  if (k !== kind || !id) return null
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp <= Date.now()) return null
  const want = await hmac(`${k}.${id}.${expStr}`)
  if (sig.length !== want.length) return null
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= sig.charCodeAt(i) ^ want.charCodeAt(i)
  return diff === 0 ? id : null
}

/* ---------------------------------------------------------
   문지기를 지나지 않는 길
   --------------------------------------------------------- */

const OPEN_EXACT = new Set([
  '/login', '/demo', '/logout',
  '/favicon.ico', '/icon.svg', '/robots.txt', '/sitemap.xml',
])

const OPEN_PREFIX = [
  '/careers',              // 공개 채용 사이트 — 공개가 목적인 화면
  '/pick/',                // 후보자: 면접 시간 고르기 (링크 토큰이 열쇠)
  '/book/',                // 후보자: 셀프 예약
  '/iv/',                  // 면접관: 시간 확정 / 불가 사유
  '/offer/',               // 후보자: 오퍼레터 보기·수락·거절 (링크 토큰이 열쇠)
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
  '/api/auth/core',        // TalentCore 계정 로그인 출발·도착 — 아직 표가 없는 사람이 지난다
  '/api/training/',        // Grow 교육 모드 → 연습 배포 (TRAIN_RESET_TOKEN). 실제 배포엔 그 열쇠가 없다
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
