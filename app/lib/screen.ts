/* =========================================================
   Screen(AI 1차 면접)으로 나가는 문 — 서버 전용 (SC4)
   ---------------------------------------------------------
   소유: 면접·점수는 Screen, 후보자·판정은 Hire. Hire 표는 바꾸지 않는다.
   Screen 이 면접 행에 Hire 후보자 id 를 적어 두고, Hire 는 그 id 로 요약만 읽어 온다.
   대화 원문·평가 기준은 받지 않는다 — 보려면 Screen 에 로그인한다.

     SCREEN_URL        Screen 주소 (없으면 '미연결')
     SCREEN_API_TOKEN  서버끼리 쓰는 열쇠 — Screen 쪽 같은 이름의 값과 같아야 한다
   ※ 열쇠는 브라우저로 내려보내지 않는다.
   ========================================================= */

const BASE = (process.env.SCREEN_URL || '').replace(/\/$/, '')
const TOKEN = process.env.SCREEN_API_TOKEN || ''

export const screenReady = () => !!(BASE && TOKEN)

export interface ScreenIv {
  id: string
  jobTitle: string
  stage: '링크발급' | '진행중' | '제출완료'
  invitedAt: string
  expiresAt: string
  expired: boolean
  completedAt: string | null
  reviewStatus: '미검토' | '검토중' | '검토완료' | null
  aiScore: number | null
  finalScore: number | null
  reviewer: string | null
  link: string
  reportUrl: string | null
}

export interface ScreenSummary {
  job: { id: string; title: string; status: string; questionCount: number; url: string } | null
  createUrl: string
  interviews: ScreenIv[]
}

export type ScreenFail = { ok: false; reason: 'off' | 'unreachable' | 'token' | 'error' }

async function call(path: string, init?: RequestInit): Promise<Response | ScreenFail> {
  if (!screenReady()) return { ok: false, reason: 'off' }
  try {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'X-Screen-Token': TOKEN, 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 401) return { ok: false, reason: 'token' }
    return r
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}

export async function screenSummary(cid: string, pid: string): Promise<({ ok: true } & ScreenSummary) | ScreenFail> {
  const r = await call(`/api/hire/summary?cid=${encodeURIComponent(cid)}&pid=${encodeURIComponent(pid)}`)
  if (!(r instanceof Response)) return r
  if (!r.ok) return { ok: false, reason: 'error' }
  try {
    const j = await r.json() as { ok?: boolean } & ScreenSummary
    return j.ok ? { ok: true, job: j.job, createUrl: j.createUrl, interviews: j.interviews || [] } : { ok: false, reason: 'error' }
  } catch { return { ok: false, reason: 'error' } }
}

export type ScreenCreate =
  | { ok: true; reused: boolean; id: string; link: string; expiresAt: string | null }
  | { ok: false; reason: 'no-job'; createUrl: string }
  | { ok: false; reason: 'closed' }
  | ScreenFail

export async function screenCreate(cid: string, pid: string): Promise<ScreenCreate> {
  const r = await call('/api/hire/interviews', { method: 'POST', body: JSON.stringify({ cid, pid }) })
  if (!(r instanceof Response)) return r
  try {
    const j = await r.json() as { ok?: boolean; error?: string; createUrl?: string; reused?: boolean; id?: string; link?: string; expiresAt?: string | null }
    if (r.ok && j.ok && j.id && j.link) return { ok: true, reused: !!j.reused, id: j.id, link: j.link, expiresAt: j.expiresAt ?? null }
    if (j.error === 'no-job' && j.createUrl) return { ok: false, reason: 'no-job', createUrl: j.createUrl }
    if (j.error === 'closed') return { ok: false, reason: 'closed' }
    return { ok: false, reason: 'error' }
  } catch { return { ok: false, reason: 'error' } }
}
