'use server'
/* 사용자 승인·역할·차단 (H2). HR Admin 또는 비밀번호 관리자만. */
import { hydrateData } from './db'
import { people } from './data'
import { currentSession, canManageUsers } from './session'
import { patchUser, type UserSt } from './users'
import type { AppRole } from './gate'

type R = { ok: boolean; reason?: string }

async function gate(): Promise<{ ok: true; by: string } | { ok: false; reason: string }> {
  const s = await currentSession()
  if (!canManageUsers(s)) return { ok: false, reason: 'no-permission' }
  return { ok: true, by: s?.uid ? (s.nm || 'HR Admin') : '관리자(비밀번호)' }
}

export async function approveUser(id: string, role: AppRole): Promise<R> {
  const g = await gate()
  if (!g.ok) return g
  if (!role) return { ok: false, reason: 'need-role' }
  return patchUser(id, { role, st: 'active' }, g.by)
}

export async function setUserRole(id: string, role: AppRole): Promise<R> {
  const g = await gate()
  if (!g.ok) return g
  return patchUser(id, { role }, g.by)
}

export async function setUserSt(id: string, st: UserSt): Promise<R> {
  const g = await gate()
  if (!g.ok) return g
  return patchUser(id, { st }, g.by)
}

export async function linkUserPerson(id: string, personId: string): Promise<R> {
  const g = await gate()
  if (!g.ok) return g
  await hydrateData()
  if (personId && !people.some(p => p.id === personId)) return { ok: false, reason: 'no-person' }
  return patchUser(id, { person_id: personId || null }, g.by)
}
