/* =========================================================
   Cadence — 리마인드 엔진 (Phase A)
   ---------------------------------------------------------
   확정된 면접에 대해 후보자·면접관에게 보낼 리마인드를 계산한다.
   (Greenhouse/Ashby 식 자동 리마인드 시퀀스: 면접 12h 전 / 4h 전)

   · 발송 자체는 아직 시뮬레이션(앱의 인비/Slack 발송과 동일 방식).
     실제 이메일/Slack 연동은 이후 provider 로 교체.
   · 확정 시각은 후보자 why('8/13(목) 12:30–13:30 확정 …' / '8/14 14:00 확정')
     에서 파싱한다. 벽시계 로컬 기준(분).
   ========================================================= */

import { auto, personById, stageById, TODAY,
         type Candidate, type Stage } from './data'
import { fmtMin } from './schedule'

export type ReminderState = 'sent' | 'due' | 'scheduled'
export interface ReminderEvent {
  who: string                 // '후보자' 또는 면접관 이름
  role: 'candidate' | 'interviewer'
  channel: string             // '이메일' | 'Slack'
  offsetLabel: string         // '12시간 전'
  atDate: string              // 'YYYY-MM-DD'
  atMin: number               // 발송 시각(분)
  atLabel: string             // '8/13 00:30'
  state: ReminderState
  /* --- 실발송용 --- */
  key: string                 // 중복 발송을 막는 고유 키(reminder_log 의 PK)
  cid: string                 // 후보자 id
  uid?: string                // 면접관이면 그 사람 id (후보자면 없음)
  offset: number              // 오프셋(분) — 원본값
}
export interface ConfirmedTime { date: string; min: number }

const pad = (n: number) => String(n).padStart(2, '0')
function isoOf(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const DOW = ['일', '월', '화', '수', '목', '금', '토']

/* 데모 '현재 시각' — 기준일 10:00. 이 시각 이전 리마인드는 '발송됨'. */
const NOW = { date: isoOf(TODAY), min: 600 }

/* auto[pid].remind('12h / 4h 전') → 오프셋(분) 배열. 없으면 [720,240]. */
export function parseRemind(pid: string): number[] {
  const s = auto[pid]?.remind
  if (!s) return [720, 240]
  const hrs = [...s.matchAll(/(\d+)\s*h/gi)].map(m => Number(m[1]) * 60)
  return hrs.length ? hrs : [720, 240]
}

/* 확정 사유 문자열에서 '월/일 + 시작시각'을 파싱한다. 실패 시 null. */
export function parseConfirmed(why: string): ConfirmedTime | null {
  if (!why || !/확정/.test(why)) return null
  const md = why.match(/(\d{1,2})\/(\d{1,2})/)
  const hm = why.match(/(\d{1,2}):(\d{2})/)
  if (!md || !hm) return null
  const mo = Number(md[1]), d = Number(md[2])
  const min = Number(hm[1]) * 60 + Number(hm[2])
  const y = TODAY.getFullYear()
  return { date: `${y}-${pad(mo)}-${pad(d)}`, min }
}

/* 확정 시각에서 오프셋(분)을 뺀 발송 시점을 날짜 경계 넘겨 계산. */
function shift(base: ConfirmedTime, offsetMin: number): ConfirmedTime {
  let min = base.min - offsetMin
  const [y, mo, d] = base.date.split('-').map(Number)
  let day = new Date(y, mo - 1, d)
  while (min < 0) { min += 1440; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1) }
  while (min >= 1440) { min -= 1440; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1) }
  return { date: isoOf(day), min }
}

/* NOW 대비 상태. 30분 이내면 'due'(임박). */
function stateAt(at: ConfirmedTime): ReminderState {
  const key = (t: ConfirmedTime) => `${t.date} ${pad(Math.floor(t.min / 60))}:${pad(t.min % 60)}`
  const a = key(at), n = key(NOW)
  if (a < n) return 'sent'
  const sameDay = at.date === NOW.date
  if (sameDay && at.min - NOW.min <= 30) return 'due'
  return 'scheduled'
}

const chLabel = (ch?: string) => (ch === 'email' ? '이메일' : ch === 'both' ? 'Slack·이메일' : 'Slack')
const mdLabel = (date: string) => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}` }

export function offsetLabel(min: number): string {
  return min % 60 === 0 ? `${min / 60}시간 전` : `${min}분 전`
}

/* 확정된 면접에 대한 전체 리마인드 이벤트(발송 시점 순). */
export function remindersFor(cand: Candidate): ReminderEvent[] {
  const stage: Stage = stageById(cand.p, cand.st)
  if (stage.kind !== 'interview') return []
  const ct = parseConfirmed(cand.why)
  if (!ct) return []

  const offsets = parseRemind(cand.p)
  const out: ReminderEvent[] = []
  offsets.forEach(off => {
    const at = shift(ct, off)
    const st = stateAt(at)
    const ol = offsetLabel(off)
    const atLabel = `${mdLabel(at.date)} ${fmtMin(at.min)}`
    // 후보자
    out.push({ who: '후보자', role: 'candidate', channel: '이메일', offsetLabel: ol, atDate: at.date, atMin: at.min, atLabel, state: st,
               key: `${cand.id}:${off}:c`, cid: cand.id, offset: off })
    // 면접관들
    ;(stage.ivs || []).forEach(uid => {
      const p = personById(uid)
      if (!p) return
      out.push({ who: p.nm, role: 'interviewer', channel: chLabel(p.ch), offsetLabel: ol, atDate: at.date, atMin: at.min, atLabel, state: st,
                 key: `${cand.id}:${off}:i:${uid}`, cid: cand.id, uid, offset: off })
    })
  })
  return out.sort((a, b) => (a.atDate < b.atDate ? -1 : a.atDate > b.atDate ? 1 : a.atMin - b.atMin))
}

/* 면접 시각 사람이 읽는 라벨('8/13(목) 12:30'). */
export function confirmedLabel(ct: ConfirmedTime): string {
  const [y, mo, d] = ct.date.split('-').map(Number)
  const dow = DOW[new Date(y, mo - 1, d).getDay()]
  return `${mo}/${d}(${dow}) ${fmtMin(ct.min)}`
}
