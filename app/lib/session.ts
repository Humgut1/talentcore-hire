/* =========================================================
   지금 화면을 보는 사람 (H2)
   ---------------------------------------------------------
   표(쿠키)는 proxy.ts 가 이미 검사했다. 여기서는 그 표에 적힌
   사람을 꺼내 화면·서버 함수가 쓰게 할 뿐이다.
   · uid 가 있다   → TalentCore 계정으로 들어온 사람. 역할이 정해져 있다.
   · uid 가 없다   → 비밀번호로 들어온 관리자(비상 출입) 또는 데모.
   ========================================================= */
import { cookies } from 'next/headers'
import { GATE_COOKIE, readSession, ROLE_LABEL, type GateSession } from './gate'

export async function currentSession(): Promise<GateSession | null> {
  try {
    return await readSession((await cookies()).get(GATE_COOKIE)?.value)
  } catch {
    return null
  }
}

/** 사용자 승인·역할을 바꿀 수 있는가 — HR Admin 또는 비밀번호 관리자 */
export function canManageUsers(s: GateSession | null): boolean {
  return !!s && s.role === 'full' && (!s.uid || s.urole === 'admin')
}

/** 사이드바 아래에 찍을 이름·역할. 계정 로그인이 아니면 null(기존 표시 유지). */
export function viewerLabel(s: GateSession | null): { nm: string; role: string } | null {
  if (!s) return null
  if (s.uid && s.urole) return { nm: s.nm || '사용자', role: ROLE_LABEL[s.urole] }
  if (s.role === 'full') return { nm: '관리자', role: '비밀번호 로그인' }
  return null
}

/** 평가 작성자 고정값: undefined = 고정 안 함(비밀번호 관리자·데모), null = 명부 연결 없음 */
export function evalViewer(s: GateSession | null): string | null | undefined {
  if (!s?.uid || s.urole === 'admin') return undefined
  return s.pid ?? null
}
