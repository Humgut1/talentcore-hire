/* =========================================================
   Hire 사용자 (H2) — TalentCore 계정으로 들어온 사람의 명단
   ---------------------------------------------------------
   · 처음 들어온 사람은 '승인 대기'로 적힌다. HR Admin 이 역할을 주고 승인해야 들어온다.
   · 아직 HR Admin 이 한 명도 없을 때, TalentCore 관리자(admin) 계정으로 처음 들어온
     사람은 바로 HR Admin 이 된다. 그래야 비밀번호 없이도 첫 승인을 할 수 있다.
   · 이 표는 로그인 열쇠에 닿는다 — service_role 로만 읽고 쓴다(마이그레이션 015).
   ========================================================= */
import { serverClient } from './supabase'
import { people } from './data'
import { APP_ROLES, type AppRole } from './gate'

export type UserSt = 'pending' | 'active' | 'blocked'

export interface AppUser {
  id: string
  email: string | null
  nm: string
  dept: string | null
  role: AppRole | null
  st: UserSt
  person_id: string | null
  approved_by: string | null
  approved_at: string | null
  last_login: string | null
  created_at: string
}

export interface CoreUser {
  id: string; emp_no?: string; name: string; email: string | null
  dept?: string; title?: string; role?: string
}

type Fail = { ok: false; reason: 'not-configured' | 'no-table' | 'error'; detail?: string }

const noTable = (m?: string) =>
  !!m && (m.includes('does not exist') || m.includes('schema cache') || m.includes('PGRST205'))

function fail(e: { message?: string; code?: string } | null): Fail {
  const m = (e?.code || '') + ' ' + (e?.message || '')
  return noTable(m) ? { ok: false, reason: 'no-table' } : { ok: false, reason: 'error', detail: e?.message }
}

/** Hire 명부에서 같은 메일(없으면 같은 사번)의 사람을 찾는다. */
function matchPerson(u: CoreUser): string | null {
  const em = (u.email || '').trim().toLowerCase()
  const p = (em && people.find(x => (x.email || '').trim().toLowerCase() === em)) ||
    (u.emp_no && people.find(x => x.empNo === u.emp_no)) || null
  return p ? p.id : null
}

/** 로그인할 때마다 부른다. 없으면 만들고, 있으면 이름·부서·마지막 로그인만 고친다. */
export async function loginUpsert(u: CoreUser): Promise<{ ok: true; user: AppUser } | Fail> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const now = new Date().toISOString()
  const pid = matchPerson(u)

  const got = await sb.from('app_users').select('*').eq('id', u.id).maybeSingle()
  if (got.error) return fail(got.error)

  if (got.data) {
    const cur = got.data as AppUser
    const patch = {
      nm: u.name || cur.nm, email: u.email, dept: u.dept || null, last_login: now,
      person_id: cur.person_id || pid,
    }
    const up = await sb.from('app_users').update(patch).eq('id', u.id).select('*').single()
    if (up.error) return fail(up.error)
    return { ok: true, user: up.data as AppUser }
  }

  const admins = await sb.from('app_users').select('id', { count: 'exact', head: true })
    .eq('role', 'admin').eq('st', 'active')
  if (admins.error) return fail(admins.error)
  const first = (admins.count ?? 0) === 0 && u.role === 'admin'

  const row = {
    id: u.id, email: u.email, nm: u.name || '이름 없음', dept: u.dept || null,
    role: first ? 'admin' : null, st: first ? 'active' : 'pending',
    person_id: pid, last_login: now,
    approved_by: first ? '첫 HR Admin (TalentCore 관리자)' : null,
    approved_at: first ? now : null,
  }
  const ins = await sb.from('app_users').insert(row).select('*').single()
  if (ins.error) return fail(ins.error)
  return { ok: true, user: ins.data as AppUser }
}

export async function getUser(id: string): Promise<AppUser | null | Fail> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const r = await sb.from('app_users').select('*').eq('id', id).maybeSingle()
  if (r.error) return fail(r.error)
  return (r.data as AppUser) ?? null
}

export async function listUsers(): Promise<{ ok: true; users: AppUser[] } | Fail> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const r = await sb.from('app_users').select('*').order('created_at', { ascending: false })
  if (r.error) return fail(r.error)
  return { ok: true, users: (r.data || []) as AppUser[] }
}

export async function patchUser(
  id: string, p: { role?: AppRole | null; st?: UserSt; person_id?: string | null }, by: string,
): Promise<{ ok: true } | Fail | { ok: false; reason: 'bad-role' | 'last-admin' }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  if (p.role && !APP_ROLES.includes(p.role)) return { ok: false, reason: 'bad-role' }

  /* 마지막 HR Admin 을 스스로 내리거나 막으면, 비밀번호를 아는 사람 말고는 아무도 승인을 못 한다. */
  const cur = await sb.from('app_users').select('*').eq('id', id).maybeSingle()
  if (cur.error) return fail(cur.error)
  const u = cur.data as AppUser | null
  if (!u) return { ok: false, reason: 'error', detail: 'no-user' }
  const losingAdmin = u.role === 'admin' && u.st === 'active' &&
    ((p.role !== undefined && p.role !== 'admin') || (p.st !== undefined && p.st !== 'active'))
  if (losingAdmin) {
    const n = await sb.from('app_users').select('id', { count: 'exact', head: true })
      .eq('role', 'admin').eq('st', 'active')
    if (n.error) return fail(n.error)
    if ((n.count ?? 0) <= 1) return { ok: false, reason: 'last-admin' }
  }

  const patch: Record<string, unknown> = { ...p }
  if (p.st === 'active' && u.st !== 'active') {
    patch.approved_by = by
    patch.approved_at = new Date().toISOString()
  }
  const r = await sb.from('app_users').update(patch).eq('id', id)
  return r.error ? fail(r.error) : { ok: true }
}
