/* =========================================================
   누가 무엇을 볼 수 있나 — 역할별 화면 제한
   ---------------------------------------------------------
   · 전부(all)   : HR Admin · 리크루터 · 비밀번호 관리자 · 데모(읽기 전용)
   · 담당(member): 하이어링 매니저 · 면접관 — TalentCore 계정으로 들어온 사람
       - 공고: 내가 HM(대행 포함)인 공고만
       - 후보자: 그 공고의 후보자 + 내가 면접을 보는(봤던) 후보자
       - 오퍼·보상: 내가 HM 인 공고만. 면접관은 못 본다.
       - 운영 화면(인재풀·면접관·대시보드·내보내기·설정·공고 만들기·공고 설정): 못 본다.
   판단은 여기 한 곳. 화면(페이지)은 allow(), 서버 함수는 need() 를 부른다.
   화면에서 버튼을 숨기는 것만으로는 안 된다 — 서버 함수는 주소만 알면 불린다.
   ========================================================= */
import { AsyncLocalStorage } from 'node:async_hooks'
import { currentSession } from './session'
import { hydrateData } from './db'
import { cands, posById, stageById, personById, evals, isHmOf } from './data'
import { ivsOfCand, partsOf, ivById } from './iv-store'
import type { GateSession } from './gate'

export type Scope =
  | { kind: 'all'; demo: boolean }
  | { kind: 'member'; nm: string; pid: string | null }
  | { kind: 'none' }

export function scopeOf(s: GateSession | null): Scope {
  if (!s) return { kind: 'none' }
  if (s.role === 'demo') return { kind: 'all', demo: true }
  if (!s.uid || s.urole === 'admin' || s.urole === 'recruiter') return { kind: 'all', demo: false }
  const nm = (s.pid ? personById(s.pid)?.nm : undefined) || s.nm || ''
  return { kind: 'member', nm, pid: s.pid ?? null }
}

export async function viewerScope(): Promise<Scope> {
  await hydrateData()
  return scopeOf(await currentSession())
}

export const isAll = (sc: Scope) => sc.kind === 'all'

/** 공고를 볼 수 있나 — 전부 보는 사람 또는 그 공고의 HM(대행 포함) */
export function seePos(sc: Scope, pid: string): boolean {
  if (sc.kind === 'all') return true
  if (sc.kind !== 'member' || !sc.nm) return false
  return isHmOf(posById(pid), sc.nm)
}

/** 이 사람이 이 후보자의 면접관인가 — 잡힌 면접, 낸 평가, 지금 단계 면접관 */
function interviews(pid: string | null, cid: string): boolean {
  if (!pid) return false
  if (ivsOfCand(cid).some(v => partsOf(v.id).some(p => p.uid === pid))) return true
  if ((evals[cid] || []).some(e => e.uid === pid)) return true
  const c = cands.find(x => x.id === cid)
  return !!c && (stageById(c.p, c.st).ivs || []).includes(pid)
}

export function seeCand(sc: Scope, cid: string): boolean {
  if (sc.kind === 'all') return true
  if (sc.kind !== 'member') return false
  const c = cands.find(x => x.id === cid)
  if (!c) return false
  return seePos(sc, c.p) || interviews(sc.pid, cid)
}

/** 판정·조율·오퍼를 볼 수 있나 — 그 공고를 볼 수 있는 사람(면접관만인 사람은 아니다) */
export function runCand(sc: Scope, cid: string): boolean {
  const c = cands.find(x => x.id === cid)
  return !!c && seePos(sc, c.p)
}

/* ---------- 서버 함수 문지기 ---------- */

/* TalentCore 가 토큰으로 부르는 API(공고 자동 생성 등)는 로그인한 사람이 없다.
   그 경로만 이 안에서 서버 함수를 부른다. 브라우저는 여기 들어올 수 없다. */
const system = new AsyncLocalStorage<boolean>()
export const asSystem = <T>(fn: () => Promise<T>) => system.run(true, fn)

export type Need =
  | 'user'                     // 로그인만 되어 있으면
  | 'staff'                    // 전부 보는 사람만
  | ['pos', string]            // 공고 id
  | ['cand', string | string[]] // 후보자 id — 판정·조율·오퍼
  | ['see', string]            // 후보자 id — 보기·코멘트
  | ['iv', string | string[]]  // 면접 id → 그 후보자에 대해 'cand'

export function allowed(sc: Scope, n: Need): boolean {
  if (sc.kind === 'none') return false
  if (n === 'user' || sc.kind === 'all') return true
  if (n === 'staff') return false
  const ids = (x: string | string[]) => Array.isArray(x) ? x : [x]
  switch (n[0]) {
    case 'pos': return seePos(sc, n[1])
    case 'see': return seeCand(sc, n[1])
    case 'cand': return ids(n[1]).every(c => runCand(sc, c))
    case 'iv': return ids(n[1]).every(i => { const v = ivById(i); return !!v && runCand(sc, v.cid) })
  }
}

/** 서버 함수 첫 줄. 권한이 없으면 던진다(화면에는 버튼이 없어야 정상이다). */
export async function need(n: Need): Promise<void> {
  if (system.getStore()) return
  if (!allowed(await viewerScope(), n)) throw new Error('forbidden')
}

/** 화면(페이지)용 — 던지지 않고 참/거짓 */
export async function allow(n: Need): Promise<boolean> {
  return allowed(await viewerScope(), n)
}
