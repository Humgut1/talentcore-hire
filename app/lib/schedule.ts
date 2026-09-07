/* =========================================================
   Cadence — 일정 조율 엔진 (Phase A)
   ---------------------------------------------------------
   2층 구조 (research-interview-scheduling.md 결정):
     · 배관층(plumbing)  = free-busy 조회 + 타임존 + 교집합 계산.
       provider 인터페이스 뒤로 추상화 → 지금은 수동 가용성(ManualProvider),
       나중에 GoogleProvider / Cronofy 로 교체(같은 인터페이스).
     · 판단층(judgment) = EA 자동제외·코디네이터 라우팅, 확정 게이팅,
       0슬롯 에스컬레이션. Cadence 가 실제로 의견 낸 차별점 → 직접 구현.

   시간 표현: 벽시계(wall-clock) 로컬 기준.
     날짜 'YYYY-MM-DD' + 자정으로부터의 분(minute). 타임존 변환을 피해
     수동 가용성에서는 결정적으로 동작(Google 연동 시 provider 가 변환).
   ========================================================= */

import { avail, stagesOf, stageById, auto, personById, TODAY, DEFAULT_POLICY, demoNow,
         type Candidate, type Stage, type IvPolicy } from './data'
import { interviews as ivAll, partsOf, slotsOf, type Interview, type IvPart } from './iv-store'

/* ---- 배관층: provider 인터페이스 + 타입 ---- */
export interface BusyBlock { date: string; start: number; end: number
  /** 그 일정의 성격. 앞뒤로 이동시간을 얼마나 비울지가 여기서 갈린다.
      in = 사내(0분) / out = 외부(60분) / 없거나 unknown = 모름(60분, RC 가 풀 수 있다) */
  kind?: 'in' | 'out' | 'unknown' } // 분, 로컬 벽시계
export interface Availability { wh: [number, number]; busy: BusyBlock[] } // 근무시간[시작,끝] + 바쁜 블록

export interface CalendarProvider {
  /** userIds 의 [from..to) 범위 free-busy 를 날짜별 바쁜 블록으로. */
  freeBusy(userIds: string[], dates: string[]): Record<string, BusyBlock[]>
  /** userId 의 근무시간(분). provider 가 모르면 config 기본값 사용. */
  workHours(userId: string): [number, number] | null
}

/** 수동 가용성 provider — data.ts 의 avail 시드를 읽는다(DB/Google 은 나중에 교체). */
export const ManualProvider: CalendarProvider = {
  freeBusy(userIds, dates) {
    const out: Record<string, BusyBlock[]> = {}
    userIds.forEach(uid => {
      const a = avail[uid]
      out[uid] = a ? a.busy.filter(b => dates.includes(b.date)) : []
    })
    return out
  },
  workHours(userId) {
    return avail[userId]?.wh ?? null
  },
}

/* ---------------------------------------------------------
   Cadence 가 스스로 잡아 둔 시간
   ---------------------------------------------------------
   provider(수동 가용성·구글)는 '캘린더에 이미 있는 일정'만 안다.
   그런데 Cadence 가 방금 다른 후보자에게 보낸 자리는 아직 아무 캘린더에도
   없을 수 있다(구글 쓰기 권한 전에는 sim 가예약이라 아예 없다).

   이걸 빼지 않으면 수요일 17:30 이 후보자 A 와 B 에게 동시에 나간다.
   둘 다 그 시간을 고르면 면접관 한 명이 같은 시각에 두 곳에 있어야 한다.
   여러 명에게 한꺼번에 보내는 경우에는 반드시 터진다.

   그래서 확정된 면접과 '아직 살아 있는 가예약'을 바쁜 시간으로 얹는다.
   기한이 지난 가예약은 곧 풀릴 자리라 얹지 않는다.
   --------------------------------------------------------- */
function cadenceBusy(
  uids: string[], dates: string[], nowIso: string, exceptIv?: string | string[],
): Record<string, BusyBlock[]> {
  const skip = exceptIv == null ? [] : Array.isArray(exceptIv) ? exceptIv : [exceptIv]
  const out: Record<string, BusyBlock[]> = {}
  uids.forEach(u => { out[u] = [] })
  for (const iv of ivAll) {
    if (skip.includes(iv.id) || iv.st === 'canceled') continue
    const parts = partsOf(iv.id).filter(p => p.uid && uids.includes(p.uid))
    if (!parts.length) continue

    const put = (date: string, start: number) => {
      if (!dates.includes(date)) return
      for (const p of parts)
        out[p.uid!].push({ date, start: start + p.offMin, end: start + p.offMin + p.dur, kind: 'in' })
    }
    if (iv.st === 'confirmed' && iv.date && iv.start !== undefined) { put(iv.date, iv.start); continue }
    if (iv.st !== 'proposed') continue
    for (const sl of slotsOf(iv.id)) {
      if (sl.st === 'dropped' || sl.st === 'expired') continue
      if (sl.st === 'offered' && sl.holdUntil && sl.holdUntil < nowIso) continue
      put(sl.date, sl.start)
    }
  }
  return out
}

/** provider 위에 Cadence 자신의 가예약·확정을 얹은 provider. 근무시간은 그대로 통과시킨다. */
export function withCadenceHolds(
  p: CalendarProvider, nowIso: string, exceptIv?: string | string[],
): CalendarProvider {
  return {
    freeBusy(uids, dates) {
      const base = p.freeBusy(uids, dates)
      const mine = cadenceBusy(uids, dates, nowIso, exceptIv)
      const out: Record<string, BusyBlock[]> = {}
      uids.forEach(u => { out[u] = [...(base[u] || []), ...(mine[u] || [])] })
      return out
    },
    workHours: uid => p.workHours(uid),
  }
}

/* ---------------------------------------------------------
   자리를 '고르는 순간' 확인 — 이미 확정된 면접과 겹치는가
   ---------------------------------------------------------
   벌크(선착순)에서는 같은 자리를 여러 후보자에게 **일부러** 같이 낸다.
   그래서 위의 withCadenceHolds 처럼 '남이 받아 간 가예약'까지 막으면 안 된다.
   여기서 막아야 하는 건 딱 하나 — 누군가 이미 그 자리를 **확정**한 경우다.
   먼저 누른 사람이 가져가고, 늦게 누른 사람은 여기서 걸린다.
   --------------------------------------------------------- */
export function seatTaken(
  exceptIv: string,
  date: string,
  spans: { uid?: string; start: number; end: number }[],
): string | null {
  for (const iv of ivAll) {
    if (iv.id === exceptIv || iv.st === 'canceled') continue
    if (iv.st !== 'confirmed' && iv.st !== 'done') continue
    if (iv.date !== date || iv.start === undefined) continue
    for (const p of partsOf(iv.id)) {
      if (!p.uid) continue
      const s = iv.start + p.offMin, e = s + p.dur
      for (const sp of spans) {
        if (sp.uid !== p.uid) continue
        if (sp.start < e && sp.end > s) return p.nm || '면접관'
      }
    }
  }
  return null
}

/* ---- 질의/결과 타입 ---- */
export interface Slot { date: string; start: number; end: number } // 분
export interface SlotQuery {
  interviewers: string[]      // person id
  durationMin: number
  windowDays: number          // 탐색 지평(영업일 아님, 달력일 범위)
  workHours: [number, number] // config 기본 근무시간(분)
  bufferMin: number           // 미팅 앞뒤 버퍼
  baseDate: Date
  limit?: number              // 최대 슬롯 수(기본 6)
  perDay?: number             // 하루 최대(기본 2)
}
export type SearchOutcome =
  | { kind: 'proposed'; slots: Slot[]; scanned: number }               // 슬롯 발견 → 후보자에 제안
  | { kind: 'empty'; scanned: number }                                 // 0개 → 에스컬레이션(범위 확대/재탐색)
  | { kind: 'coordinator'; eaNames: string[] }                         // EA 포함 → 자동화 제외·수동
  | { kind: 'no-interviewer' }                                         // 면접관 미지정

/* ---- 시간/날짜 헬퍼 ---- */
const STEP = 30 // 후보 시작시각 간격(분)
const HOLIDAYS = new Set(['2026-08-15']) // 광복절 등(데모용 최소)
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const DOW = ['일', '월', '화', '수', '목', '금', '토']

export function parseHours(s: string): [number, number] {
  // '10:00–18:00' / '10:00-18:00'
  const [a, b] = s.split(/[–-]/).map(x => x.trim())
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0) }
  return [toMin(a), toMin(b)]
}
export const fmtMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
export function slotLabel(s: Slot): string {
  const [y, mo, d] = s.date.split('-').map(Number)
  const dow = DOW[new Date(y, mo - 1, d).getDay()]
  return `${mo}/${d}(${dow}) ${fmtMin(s.start)}–${fmtMin(s.end)}`
}

/** baseDate 부터 windowDays 범위의 영업일(주말·공휴일 제외) 날짜 문자열. */
export function businessDays(base: Date, windowDays: number): string[] {
  const out: string[] = []
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    const wd = d.getDay()
    if (wd === 0 || wd === 6) continue
    const s = iso(d)
    if (HOLIDAYS.has(s)) continue
    out.push(s)
  }
  return out
}

/* ---- 배관층 코어: 교집합 슬롯 탐색 ----
   면접관 전원이 같은 시간에 비어 있어야 하는 '패널형' 탐색.
   아래 Phase B 의 연속 엔진에 파트를 1개만 넘긴 것과 같아서, 계산은 그쪽에 맡긴다
   (버퍼 하나로 앞뒤를 똑같이 비우던 옛 동작을 그대로 유지한다). */
export function findSlots(q: SlotQuery, provider: CalendarProvider = ManualProvider): Slot[] {
  return findSeqSlots({
    parts: [{ interviewers: q.interviewers, durMin: q.durationMin, offMin: 0 }],
    totalMin: q.durationMin,
    windowDays: q.windowDays,
    workHours: q.workHours,
    buf: { in: q.bufferMin, out: q.bufferMin, unknown: q.bufferMin },
    baseDate: q.baseDate,
    limit: q.limit,
    perDay: q.perDay,
  }, provider).map(({ date, start, end }) => ({ date, start, end }))
}

/* ---- 판단층: 후보자×단계 → 조율 결과 ---- */
export interface EngineConfig {
  windowDays: number; workHours: [number, number]; bufferMin: number
}
/** auto[pid] 설정에서 엔진 config 를 뽑는다(없으면 기본값). */
export function configFor(pid: string): EngineConfig {
  const a = auto[pid]
  return {
    windowDays: a?.window ?? 10,
    workHours: a ? parseHours(a.hours) : [10 * 60, 18 * 60],
    bufferMin: a?.buffer ?? 15,
  }
}

/** 인터뷰 단계 후보자의 슬롯을 탐색하고 EA/0슬롯 판단까지 적용.
    windowDays 를 넘기면 config 대신 그 값으로(범위 넓혀 재탐색). */
export function scheduleFor(
  cand: Candidate,
  provider: CalendarProvider = ManualProvider,
  base: Date = TODAY,
  windowDays?: number,
): SearchOutcome {
  const stage: Stage = stageById(cand.p, cand.st)
  const ivs = stage.ivs || []
  if (ivs.length === 0) return { kind: 'no-interviewer' }

  // 판단①: EA 포함 → 자동화 제외, 코디네이터 수동 라우팅(auto rule r6, lock)
  const eaNames = ivs.map(personById).filter(p => p?.ea).map(p => p!.nm)
  if (eaNames.length) return { kind: 'coordinator', eaNames }

  const base0 = configFor(cand.p)
  const cfg = { ...base0, windowDays: windowDays ?? base0.windowDays }
  const dates = businessDays(base, cfg.windowDays)
  const scanned = dates.length
  const slots = findSlots({
    interviewers: ivs,
    durationMin: stage.dur || 60,
    windowDays: cfg.windowDays,
    workHours: cfg.workHours,
    bufferMin: cfg.bufferMin,
    baseDate: base,
  }, provider)

  // 판단②: 0슬롯 → 에스컬레이션(면접관 전원 불가 → 범위 확대/재탐색, auto rule r1)
  return slots.length ? { kind: 'proposed', slots, scanned } : { kind: 'empty', scanned }
}

/** 단계가 슬롯 탐색 대상(인터뷰 종류)인지. */
export function isSchedulable(pid: string, stageId: string): boolean {
  return stageById(pid, stageId).kind === 'interview'
}

/** 인터뷰 단계 목록(면접 길이/면접관 요약용). */
export function interviewStages(pid: string): Stage[] {
  return stagesOf(pid).filter(s => s.kind === 'interview')
}

/* =========================================================
   Phase B — 연속(sequential) 면접 엔진
   ---------------------------------------------------------
   Phase A 는 "면접관 전원이 같은 시간에 비어 있는 자리"를 찾았다(패널형).
   그런데 확정된 2차는 패널이 아니라 **이어서 보는 방식**이다 —
     차상위 리더 60분 → 곧바로 협업 리더 60분 = 120분 연속, 사이 휴식 없음.
   패널 계산을 그대로 쓰면 "두 사람이 120분 내내 동시에 비어 있어야" 하므로
   실제보다 훨씬 빡빡해져 자리가 거의 안 나온다. 그래서 '파트' 개념을 넣었다.

     파트 = { 이 사람(들), 몇 분짜리, 시작으로부터 몇 분 뒤 }
     1차   → 파트 1개 (0분부터 60분)
     2차   → 파트 2개 (0분부터 60분 / 60분부터 60분)

   버퍼도 하나의 숫자가 아니다. 앞뒤 일정의 성격에 따라 다르게 비운다 —
     사내 0분 / 외부 60분(이동) / 모름 60분(단 RC 가 풀 수 있다).
   '모름'을 풀어서 겨우 잡힌 자리는 note:'unknown' 으로 표시해 되돌아온다.

   정책 숫자는 코드에 박지 않는다. 전부 automation 표(마이그레이션 010)에서 읽는다.
   ========================================================= */


/** 한 사람(또는 몇 사람)이 맡는 한 토막. */
export interface PartSpec {
  interviewers: string[]
  durMin: number
  offMin: number       // 면접 시작으로부터의 오프셋
  nm?: string
}
export interface Buf { in: number; out: number; unknown: number }

export interface SeqQuery {
  parts: PartSpec[]
  totalMin?: number           // 비우면 파트에서 계산
  windowDays: number
  workHours: [number, number]
  buf: Buf
  baseDate: Date
  limit?: number
  perDay?: number
  releaseUnknown?: boolean    // '모름' 이동시간을 풀고 다시 볼 것인가
  /** 이 시각보다 이른 자리는 내놓지 않는다. 오늘 오후 2시에 보내면서
      오늘 12시를 제시하면 후보자는 그걸 '실수'로 읽는다. */
  notBefore?: { date: string; min: number }
}
export interface SeqSlot extends Slot {
  note?: 'unknown'
  parts: { start: number; end: number }[]
  /** 이 자리 앞뒤로 비어 있는 시간(분, 최대 120). 여유를 강제로 비우는 대신
      "얼마나 붙어 있는지"를 사실 그대로 담아 RC 가 보고 판단하게 한다. */
  gapBefore?: number
  gapAfter?: number
}
/** 앞뒤 여유 중 좁은 쪽. 정렬 기준 — 넉넉한 자리를 위로 올린다. */
export const slotRoom = (s: SeqSlot) => Math.min(s.gapBefore ?? GAP_CAP, s.gapAfter ?? GAP_CAP)
const GAP_CAP = 120
/** 화면에 그대로 띄우는 한 줄 — "이 자리가 앞뒤 일정에 얼마나 붙어 있는가". */
export function roomLabel(s: SeqSlot): string {
  const g = (v?: number) => (v == null || v >= GAP_CAP ? '여유' : v === 0 ? '바로 붙음' : `${v}분`)
  return `앞 ${g(s.gapBefore)} · 뒤 ${g(s.gapAfter)}`
}

/** 파트 전체 길이 = 마지막 파트가 끝나는 시각. */
export const seqTotal = (parts: PartSpec[]) =>
  parts.reduce((m, p) => Math.max(m, p.offMin + p.durMin), 0)

/** automation 표의 조율 정책. 없으면 확정된 기본값. */
export function policyFor(pid: string): IvPolicy {
  return { ...DEFAULT_POLICY, ...(auto[pid]?.pol || {}) }
}

function bufOf(kind: BusyBlock['kind'], buf: Buf, release: boolean): number {
  if (kind === 'in') return buf.in
  if (kind === 'out') return buf.out
  return release ? 0 : buf.unknown   // 성격 모름
}

/* ---- 배관층 코어(순수 함수). 파트별로 따로 비어 있으면 된다 ---- */
export function findSeqSlots(q: SeqQuery, provider: CalendarProvider = ManualProvider): SeqSlot[] {
  const limit = q.limit ?? 6
  const perDay = q.perDay ?? 2
  const dates = businessDays(q.baseDate, q.windowDays)
  const everyone = Array.from(new Set(q.parts.flatMap(p => p.interviewers)))
  if (!everyone.length) return []
  const fb = provider.freeBusy(everyone, dates)

  // 파트마다 유효 근무시간(그 파트 면접관들의 교집합 ∩ 공고 기본)
  const win = q.parts.map(p => {
    let a = q.workHours[0], b = q.workHours[1]
    p.interviewers.forEach(uid => {
      const wh = provider.workHours(uid)
      if (wh) { a = Math.max(a, wh[0]); b = Math.min(b, wh[1]) }
    })
    return [a, b] as [number, number]
  })
  const total = q.totalMin || seqTotal(q.parts)

  const out: SeqSlot[] = []
  for (const date of dates) {
    let onDay = 0
    for (let t = q.workHours[0]; t + total <= q.workHours[1]; t += STEP) {
      if (onDay >= perDay) break
      let ok = true
      let usedRelease = false   // 이동시간을 풀었기에 통과한 자리인가
      for (let i = 0; i < q.parts.length && ok; i++) {
        const p = q.parts[i]
        const ps = t + p.offMin, pe = ps + p.durMin
        if (ps < win[i][0] || pe > win[i][1]) { ok = false; break }
        for (const uid of p.interviewers) {
          for (const b of fb[uid] || []) {
            if (b.date !== date) continue
            const kind = b.kind || 'unknown'
            const pad = bufOf(kind, q.buf, !!q.releaseUnknown)
            if (ps < b.end + pad && pe > b.start - pad) { ok = false; break }
            if (kind === 'unknown' && q.releaseUnknown &&
                ps < b.end + q.buf.unknown && pe > b.start - q.buf.unknown) usedRelease = true
          }
          if (!ok) break
        }
      }
      if (!ok) continue
      if (q.notBefore && (date < q.notBefore.date ||
          (date === q.notBefore.date && t < q.notBefore.min))) continue
      // 앞뒤 여유를 잰다. 첫 파트 면접관의 '직전 일정 끝', 마지막 파트 면접관의
      // '직후 일정 시작'까지 몇 분이 비는가. 아무 일정도 없으면 최대치로 본다.
      const first = q.parts[0], last = q.parts[q.parts.length - 1]
      const st0 = t + first.offMin, en0 = t + last.offMin + last.durMin
      let gapBefore = GAP_CAP, gapAfter = GAP_CAP
      for (const uid of first.interviewers)
        for (const b of fb[uid] || [])
          if (b.date === date && b.end <= st0) gapBefore = Math.min(gapBefore, st0 - b.end)
      for (const uid of last.interviewers)
        for (const b of fb[uid] || [])
          if (b.date === date && b.start >= en0) gapAfter = Math.min(gapAfter, b.start - en0)
      out.push({
        date, start: t, end: t + total,
        ...(usedRelease ? { note: 'unknown' as const } : {}),
        parts: q.parts.map(p => ({ start: t + p.offMin, end: t + p.offMin + p.durMin })),
        gapBefore, gapAfter,
      })
      onDay++
      if (out.length >= limit) return out
    }
  }
  return out
}

/** 2단 탐색 — 먼저 이동시간을 다 지키고 찾고, 최소 개수를 못 채우면
    '성격 모름' 일정의 이동시간만 풀어 한 번 더 본다(그 자리는 표시해서 돌려준다). */
export function searchSeqSlots(
  q: SeqQuery, slotMin: number, provider: CalendarProvider = ManualProvider,
): SeqSlot[] {
  const strict = findSeqSlots(q, provider)
  const all = strict.length >= slotMin ? strict : (() => {
    const loose = findSeqSlots({ ...q, releaseUnknown: true }, provider)
    const seen = new Set(strict.map(s => `${s.date} ${s.start}`))
    return [...strict, ...loose.filter(s => !seen.has(`${s.date} ${s.start}`))]
  })()
  // 거르지 않고 '정렬만' 한다 — 앞뒤가 넉넉한 자리가 위로, 같으면 빠른 날짜 순.
  return all.sort((a, b) =>
    slotRoom(b) - slotRoom(a) ||
    (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1))
}

/* ---- 판단층: 면접 1건 → 보낼 슬롯과 경고 ---- */
export interface IvPlan {
  kind: 'proposed' | 'empty' | 'coordinator' | 'no-interviewer'
  slots: SeqSlot[]
  scanned: number          // 훑어본 영업일 수
  enough: boolean          // 최소 개수(slotMin)를 채웠는가
  capWarn: string[]        // 그 주에 이미 상한만큼 잡힌 면접관 이름 — 막지 않고 알리기만
  capBlock: boolean        // 정책이 '막기'로 되어 있는가
  seniorNames: string[]    // 실장(L8)+ 면접관 — 발송 직전 확인 모달
  holdUntil: string        // 가예약 만료 시각
  eaNames?: string[]
}

/** 월요일 기준 주 열쇠. 주간 상한을 셀 때 같은 주인지 판단한다. */
export function weekKey(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
  return iso(dt)
}
/** 이 사람이 그 주에 이미 잡혀 있는 면접 수(확정된 것만 센다). */
export function weekLoad(uid: string, date: string): number {
  const k = weekKey(date)
  return ivAll.filter(v =>
    v.st === 'confirmed' && v.date && weekKey(v.date) === k &&
    partsOf(v.id).some(p => p.uid === uid)).length
}

/* '지금'을 30분 칸 기준으로 올림한 지점. base 가 오늘이 아니면(테스트·과거 재현)
   그 날 시작으로 둬서 아무것도 거르지 않는다. */
function nowFloor(base: Date): { date: string; min: number } {
  const now = demoNow()
  if (iso(base) !== iso(now)) return { date: iso(base), min: 0 }
  const m = now.getHours() * 60 + now.getMinutes()
  return { date: iso(now), min: Math.ceil(m / STEP) * STEP }
}

const plusHours = (base: Date, h: number) => new Date(base.getTime() + h * 3600_000).toISOString()

/** DB 의 면접관 자리(interview_parts) → 엔진이 쓰는 파트 명세. */
export function partsToSpec(parts: IvPart[]): PartSpec[] {
  return parts
    .filter(p => p.uid)
    .map(p => ({ interviewers: [p.uid!], durMin: p.dur, offMin: p.offMin, nm: p.nm }))
}

/** 면접 1건에 대해 슬롯을 찾고, 보내도 되는지까지 판단한다. */
export function planFor(
  iv: Interview,
  provider: CalendarProvider = ManualProvider,
  base: Date = TODAY,
  windowDays?: number,
  /** 이 면접들끼리는 서로의 가예약을 피하지 않는다 — 벌크(선착순)에서
      한 무리에게 같은 자리를 함께 내주기 위한 예외. 비우면 자기 자신만 뺀다. */
  group?: string[],
): IvPlan {
  const parts = partsOf(iv.id)
  const spec = partsToSpec(parts)
  const empty = (kind: IvPlan['kind'], extra: Partial<IvPlan> = {}): IvPlan => ({
    kind, slots: [], scanned: 0, enough: false, capWarn: [], capBlock: false,
    seniorNames: [], holdUntil: '', ...extra,
  })
  if (!spec.length) return empty('no-interviewer')

  // 판단①: EA 를 끼고 있으면 자동 조율에서 빼고 코디네이터에게 넘긴다(규칙 r6, 잠금)
  const eaNames = spec.flatMap(p => p.interviewers).map(personById).filter(p => p?.ea).map(p => p!.nm)
  if (eaNames.length) return empty('coordinator', { eaNames })

  const pol = policyFor(iv.pid)
  const cfg = configFor(iv.pid)
  // 범위의 주인은 조율 정책이다(보내는 날부터 1주일). cfg.window 는 옛 미팅 탐색용이라
  // 여기서 쓰면 공고마다 10·14·15일로 제각각이 된다. '범위 넓혀 다시 찾기' 버튼만 이 값을 넘긴다.
  const days = windowDays ?? pol.sendDays
  const slots = searchSeqSlots({
    parts: spec,
    totalMin: iv.totalMin || seqTotal(spec),
    windowDays: days,
    workHours: cfg.workHours,
    buf: { in: pol.bufIn, out: pol.bufOut, unknown: pol.bufUnknown },
    baseDate: base,
    // 고를 자리보다 넉넉히 찾아 둬야 '다른 날 하나씩' 규칙이 먹는다.
    // 벌크는 한 무리가 같은 자리를 나눠 쓰므로 사람 수만큼 더 찾아 둔다.
    limit: Math.max(10, (pol.slotMax + (group?.length ?? 1)) * 2),
    // 오늘 이미 지난 시각은 후보에서 뺀다.
    notBefore: nowFloor(base),
  }, pol.slotMin, withCadenceHolds(provider, demoNow().toISOString(), group?.length ? group : iv.id))

  // 판단②: 주간 상한 — 기본은 넛지다. 막지 않고 "이번 주 이미 N건" 만 알린다.
  const capWarn: string[] = []
  spec.forEach(p => p.interviewers.forEach(uid => {
    const over = slots.some(s => weekLoad(uid, s.date) >= pol.weekCap)
    if (over) { const n = personById(uid)?.nm; if (n && !capWarn.includes(n)) capWarn.push(n) }
  }))

  // 판단③: 실장(L8) 이상이 끼면 발송 직전에 RC 가 한 번 확인한다.
  const seniorNames = parts
    .filter(p => (p.level ?? personById(p.uid || '')?.coreLevel ?? 0) >= pol.seniorLv)
    .map(p => p.nm)

  const scanned = businessDays(base, days).length
  const holdUntil = plusHours(base, pol.holdH)
  // 판단④: 0슬롯 → 에스컬레이션(범위 확대·수동 조율). 최소 개수 미달이면 보내되 표시한다.
  return {
    kind: slots.length ? 'proposed' : 'empty',
    slots, scanned,
    enough: slots.length >= pol.slotMin,
    capWarn, capBlock: pol.weekBlock,
    seniorNames, holdUntil,
  }
}

/** 회차별 기본 면접관 자리 모양 — 새 면접을 만들 때 이 틀로 시작한다.
    1차: HM 혼자 60분. 2차: 차상위 리더 → 협업 리더를 이어서(사이 r2Gap 분, 확정값 0). */
export function defaultPartsFor(round: number, pol: IvPolicy = DEFAULT_POLICY): Omit<IvPart, 'iid'>[] {
  if (round === 1) {
    return [{ ord: 0, nm: '', role: '하이어링 매니저', src: 'hm', offMin: 0, dur: pol.r1Min, resp: 'none' }]
  }
  return [
    { ord: 0, nm: '', role: '차상위 리더', src: 'upper', offMin: 0, dur: pol.r2Min, resp: 'none' },
    { ord: 1, nm: '', role: '협업 리더', src: 'collab', offMin: pol.r2Min + pol.r2Gap, dur: pol.r2Min, resp: 'none' },
  ]
}
