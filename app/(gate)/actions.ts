'use server'

/* 문을 여는 동작. 여기서만 표(쿠키)를 발급한다. */

import { cookies } from 'next/headers'
import { GATE_COOKIE, issueTicket, passwordConfigured } from '../lib/gate'

const FULL_DAYS = 30
const DEMO_DAYS = 1

/** 비밀번호로 들어오기 */
export async function signIn(password: string): Promise<{ ok: boolean; reason?: string }> {
  if (!passwordConfigured()) return { ok: false, reason: 'not-configured' }

  /* 틀린 비밀번호에 항상 같은 시간을 쓴다.
     빨리 틀리고 늦게 맞으면 그 차이만으로도 힌트가 된다.
     자동으로 마구 넣어 보는 것도 이 지연 하나로 꽤 느려진다. */
  await new Promise(r => setTimeout(r, 400))

  const want = process.env.HIRE_PASSWORD || ''
  const got = password || ''
  if (got.length !== want.length) return { ok: false, reason: 'bad-password' }
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i)
  if (diff !== 0) return { ok: false, reason: 'bad-password' }

  await setTicket('full', FULL_DAYS)
  return { ok: true }
}

/** 표지에서 넘어온 사람 — 전부 보이고 아무것도 안 바뀐다 */
export async function enterDemo(): Promise<{ ok: boolean }> {
  await setTicket('demo', DEMO_DAYS)
  return { ok: true }
}

export async function signOut(): Promise<{ ok: boolean }> {
  const jar = await cookies()
  jar.delete(GATE_COOKIE)
  return { ok: true }
}

async function setTicket(role: 'full' | 'demo', days: number) {
  const jar = await cookies()
  jar.set(GATE_COOKIE, await issueTicket(role, days), {
    httpOnly: true,           // 화면 쪽 코드가 표를 읽지 못하게
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: days * 86_400,
  })
}
