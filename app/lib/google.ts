/* =========================================================
   Cadence — Google Calendar 연동 (Phase A · 서버 전용)
   ---------------------------------------------------------
   scheduling 아키텍처(2층 구조)의 "배관층" 실연동:
     · schedule.ts 의 CalendarProvider 인터페이스는 그대로 두고,
       Google free-busy 를 미리 조회(async)해 스냅샷으로 감싼
       "동기 provider"를 만들어 엔진(findSlots)에 그대로 넣는다.
       → 엔진/판단층 코드는 한 줄도 바뀌지 않는다.

   상태 3단계:
     · unconfigured : GOOGLE_CLIENT_ID/SECRET 미설정 → 연동 불가(설정 안내)
     · configured   : 키는 있으나 아직 계정 연결 전 → "연결" 버튼
     · connected    : OAuth 토큰 보유 → 실제 캘린더 조회

   토큰 저장: 로컬 개발용으로 프로젝트 루트 .google-tokens.json 에 보관
     (.gitignore 에 포함 · 절대 커밋 금지). 서버리스 배포 시에는
     이 파일 저장소를 DB/KV 로 교체해야 한다(주석 표시).

   ⚠️ 이 파일은 서버에서만 import 된다(fs·시크릿 사용).
      render.ts(클라이언트 번들)에서는 `import type` 로 타입만 가져온다.
   ========================================================= */
import { promises as fs } from 'fs'
import { readFileSync } from 'fs'
import path from 'path'
import type { BusyBlock, CalendarProvider } from './schedule'
import { ManualProvider } from './schedule'
import { personById } from './data'

/* ---- 타입 (render.ts 가 type-only 로 재사용) ---- */
export type GoogleState = 'unconfigured' | 'configured' | 'connected'
export interface GoogleStatus {
  state: GoogleState
  email?: string          // 연결된 계정
  connectedAt?: string    // 연결 시각(ISO)
  scope?: string
}
export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expiry: number          // epoch ms
  email?: string
  scope?: string
  connectedAt?: string
}

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const TOKEN_FILE = path.join(process.cwd(), '.google-tokens.json')

/* ---- 설정/토큰 ---- */
export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}
function redirectUri(): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'}/api/google/callback`
  )
}

/** 동기 토큰 읽기(설정 화면 렌더처럼 빠른 상태 판단용). 없으면 null. */
function readTokensSync(): GoogleTokens | null {
  try {
    return JSON.parse(readFileSync(TOKEN_FILE, 'utf8')) as GoogleTokens
  } catch {
    return null
  }
}
async function readTokens(): Promise<GoogleTokens | null> {
  try {
    return JSON.parse(await fs.readFile(TOKEN_FILE, 'utf8')) as GoogleTokens
  } catch {
    return null
  }
}
async function writeTokens(t: GoogleTokens): Promise<void> {
  await fs.writeFile(TOKEN_FILE, JSON.stringify(t, null, 2), 'utf8')
}
export async function disconnectGoogle(): Promise<void> {
  try { await fs.unlink(TOKEN_FILE) } catch { /* 이미 없음 */ }
}

/** 설정 화면용 현재 상태(동기). */
export function googleStatus(): GoogleStatus {
  if (!googleConfigured()) return { state: 'unconfigured' }
  const t = readTokensSync()
  if (!t?.access_token) return { state: 'configured' }
  return { state: 'connected', email: t.email, connectedAt: t.connectedAt, scope: t.scope }
}

/* ---- OAuth ---- */
export function authUrl(): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`
}

/** 콜백에서 받은 code 를 토큰으로 교환하고 저장. 실패 시 throw. */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`)
  const j = await res.json()
  const tokens: GoogleTokens = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expiry: Date.now() + (j.expires_in ?? 3600) * 1000,
    scope: j.scope,
    connectedAt: new Date().toISOString(),
  }
  tokens.email = await fetchEmail(tokens.access_token).catch(() => undefined)
  await writeTokens(tokens)
  return tokens
}

async function fetchEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return undefined
  const j = await res.json()
  return j.email
}

/** 만료 시 refresh_token 으로 access_token 갱신. 유효한 access_token 반환. */
/** 유효한 액세스 토큰(만료 시 자동 갱신). 캘린더 쓰기(hold.ts)도 같은 토큰을 쓴다. */
export async function validAccessToken(): Promise<string | null> {
  const t = await readTokens()
  if (!t) return null
  if (Date.now() < t.expiry - 60_000) return t.access_token
  if (!t.refresh_token) return t.access_token // 갱신 불가 → 있는 값 시도
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      refresh_token: t.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return t.access_token
  const j = await res.json()
  const next: GoogleTokens = { ...t, access_token: j.access_token, expiry: Date.now() + (j.expires_in ?? 3600) * 1000 }
  await writeTokens(next)
  return next.access_token
}

/* ---- 사람 → 캘린더(이메일) 매핑 ----
   면접관(u1..)별 Google 캘린더 주소가 필요하다.
   1) data.ts 의 person.email 이 있으면 사용,
   2) 없고 GOOGLE_CALENDAR_MAP(JSON: {"u1":"a@x.com"}) 이 있으면 사용,
   3) 그래도 없으면 이 사람은 조회 대상에서 제외(→ 조회 불가로 처리). */
let mapCache: Record<string, string> | null = null
function calendarMap(): Record<string, string> {
  if (mapCache) return mapCache
  try { mapCache = JSON.parse(process.env.GOOGLE_CALENDAR_MAP || '{}') } catch { mapCache = {} }
  return mapCache!
}
export function calendarIdFor(uid: string): string | null {
  const p = personById(uid) as { email?: string } | undefined
  return p?.email || calendarMap()[uid] || null
}

/* ---- 타임존: RFC3339 → Asia/Seoul 벽시계(분) ----
   앱은 벽시계 로컬(분) 기준. 데모/운영 모두 서울 기준으로 고정 변환.
   (다중 타임존은 Cronofy 도입 시 provider 가 처리) */
function toSeoulWall(rfc: string): { date: string; min: number } {
  const d = new Date(rfc)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]))
  const hh = parts.hour === '24' ? 0 : Number(parts.hour)
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: hh * 60 + Number(parts.minute) }
}

/* ---- Google free-busy 조회 (async) ----
   반환: userId → BusyBlock[] (조회된 날짜 범위 안).
   연결 안 됨/조회 실패/매핑 0명 → null 반환(호출부가 ManualProvider 로 폴백). */
export async function googleFreeBusy(
  userIds: string[], dates: string[],
): Promise<Record<string, BusyBlock[]> | null> {
  if (!googleConfigured() || dates.length === 0) return null
  const token = await validAccessToken()
  if (!token) return null

  const resolvable = userIds.filter(u => calendarIdFor(u))
  if (resolvable.length === 0) return null // 매핑된 캘린더가 하나도 없음 → 폴백

  const sorted = [...dates].sort()
  const timeMin = `${sorted[0]}T00:00:00+09:00`
  const timeMax = `${sorted[sorted.length - 1]}T23:59:59+09:00`

  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timeMin, timeMax, timeZone: 'Asia/Seoul',
      items: resolvable.map(u => ({ id: calendarIdFor(u) })),
    }),
  })
  if (!res.ok) return null
  const j = await res.json()
  const cals = j.calendars || {}
  const out: Record<string, BusyBlock[]> = {}
  const dateSet = new Set(dates)
  userIds.forEach(u => {
    const cid = calendarIdFor(u)
    const busies: Array<{ start: string; end: string }> = (cid && cals[cid]?.busy) || []
    out[u] = busies
      .map(b => {
        const s = toSeoulWall(b.start), e = toSeoulWall(b.end)
        // 하루 안에서 끝나는 블록만(자정 넘김은 데모 범위 밖 → 종료일 자정으로 클램프)
        return { date: s.date, start: s.min, end: s.date === e.date ? e.min : 1440 }
      })
      .filter(b => dateSet.has(b.date))
  })
  return out
}

/* ---- 스냅샷 → 동기 provider ----
   미리 조회한 free-busy 맵을 CalendarProvider 로 감싼다.
   workHours 는 아직 Google 에서 안 읽으므로 null(엔진이 config 기본 사용). */
export function snapshotProvider(fb: Record<string, BusyBlock[]>): CalendarProvider {
  return {
    freeBusy(userIds, queryDates) {
      const out: Record<string, BusyBlock[]> = {}
      userIds.forEach(u => { out[u] = (fb[u] || []).filter(b => queryDates.includes(b.date)) })
      return out
    },
    workHours() { return null },
  }
}

/** 조율에 쓸 provider 결정: 연결됐고 조회 성공하면 Google 스냅샷, 아니면 Manual. */
export async function resolveProvider(
  userIds: string[], dates: string[],
): Promise<{ provider: CalendarProvider; source: 'google' | 'manual' }> {
  try {
    const fb = await googleFreeBusy(userIds, dates)
    if (fb) return { provider: snapshotProvider(fb), source: 'google' }
  } catch { /* 조회 실패 → 폴백 */ }
  return { provider: ManualProvider, source: 'manual' }
}
