/* =========================================================
   면접 평가 공개 시점 (H5)
   ---------------------------------------------------------
   이 단계에 배정된 면접관이 '모두' 제출하기 전에는 이 단계 평가 내용을
   아무 화면에도 내려보내지 않는다. 먼저 낸 점수에 뒤에 쓰는 사람이
   끌려가지 않게(앵커링) — 개수와 누가 냈는지만 보인다.
   · 앞 단계 평가는 이미 끝난 것이라 그대로 보인다.
   · 배정된 면접관이 없는 단계는 기다릴 사람이 없으니 가리지 않는다.
   ========================================================= */
import { cands, evals, stageById, personById, type EvalItem } from './data'
import { attrsFor, isGradable } from './scorecard'

export interface EvalSeat { uid: string; nm: string; done: boolean }
export interface EvalGate {
  cid: string
  stageNm: string
  gradable: boolean
  closed: boolean
  attrs: string[]
  roster: EvalSeat[]   // 이 단계 면접관과 제출 여부
  submitted: number    // 이 단계에 들어온 평가 수
  expected: number     // 배정된 면접관 수
  sealed: boolean      // 아직 덜 모여서 내용을 가린다
  /* 로그인한 사람(H2). undefined = 작성자를 고정하지 않음(비밀번호 관리자·HR Admin),
     null = 계정은 있지만 Hire 명부와 연결되지 않음, 문자열 = 그 사람으로만 쓴다 */
  me?: string | null
}

export function evalGate(cid: string, me?: string | null): EvalGate | null {
  const c = cands.find(x => x.id === cid)
  if (!c) return null
  const st = stageById(c.p, c.st)
  const gradable = isGradable(st.kind)
  const here = (evals[cid] || []).filter(e => e.st === st.nm)
  const done = new Set(here.map(e => e.uid))
  const roster = (st.ivs || []).map(uid => ({ uid, nm: personById(uid)?.nm ?? '면접관', done: done.has(uid) }))
  return {
    cid, stageNm: st.nm, gradable, closed: !!st.rail,
    attrs: attrsFor(st.kind),
    roster,
    submitted: here.length,
    expected: roster.length,
    sealed: gradable && roster.length > 0 && roster.some(r => !r.done),
    ...(me !== undefined ? { me } : {}),
  }
}

/** 화면에 보여도 되는 평가만. 가려진 단계 평가는 빠진다. */
export function visibleEvals(cid: string): EvalItem[] {
  const all = evals[cid] || []
  const g = evalGate(cid)
  if (!g || !g.sealed) return all
  return all.filter(e => e.st !== g.stageNm)
}

/** 가려졌을 때 한 줄 안내 — 'N/M 제출 · 미제출 A, B' */
export function sealedLine(g: EvalGate): string {
  const left = g.roster.filter(r => !r.done).map(r => r.nm)
  return g.stageNm + ' 평가 ' + g.submitted + '/' + g.expected + ' 제출' +
    (left.length ? ' · 미제출 ' + left.join(', ') : '') +
    ' — 모두 제출하면 내용이 공개됩니다'
}
