/* =========================================================
   Cadence — 리마인드 실발송 · 서버 전용
   ---------------------------------------------------------
   reminders.ts : 언제 무엇을 보낼지 계산       (순수 계산)
   mailer.ts    : 이메일/Slack 로 실제 내보내기 (배관)
   이 파일      : 둘을 잇고, 보낸 기록을 남긴다 (중복 발송 방지)

   중복 방지 원칙
     · 모든 발송 단위에는 고유 key 가 있다 (ReminderEvent.key).
       예: 'c11:720:i:u1'  = 후보자 c11 · 12시간 전 · 면접관 u1
     · 보내기 전에 reminder_log 를 조회해 이미 있는 key 는 건너뛴다.
     · 보낸 뒤 log 에 insert 한다. 테이블이 없으면(미생성) 로그만 생략하고
       발송은 계속한다 — 단, 그때는 중복 방지가 되지 않으므로 reason 에 남긴다.

   ⚠️ 서버에서만 import 한다(시크릿 사용).
   ========================================================= */

import { cands, personById, posById, stageById, type Candidate } from './data'
import { remindersFor, parseConfirmed, confirmedLabel, type ReminderEvent } from './reminders'
import {
  sendEmail, sendSlack, mailerStatus,
  interviewerMessage, candidateMessage,
} from './mailer'
import { serverClient } from './supabase'

export interface SendOutcome {
  key: string
  who: string
  channel: string
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
}
export interface SendReport {
  ok: boolean
  configured: boolean          // 발송 키가 하나라도 있나
  sent: number
  skipped: number
  failed: number
  results: SendOutcome[]
  note?: string
}

const BASE = () => process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

/* ---------------------------------------------------------
   발송 기록 (reminder_log)
   --------------------------------------------------------- */
async function loadLog(keys: string[]): Promise<{ sent: Set<string>; ok: boolean }> {
  const sb = serverClient()
  if (!sb || !keys.length) return { sent: new Set(), ok: false }
  const { data, error } = await sb.from('reminder_log').select('key').in('key', keys)
  if (error) return { sent: new Set(), ok: false }
  return { sent: new Set((data ?? []).map(r => r.key as string)), ok: true }
}

async function writeLog(rows: {
  key: string; cid: string; uid: string | null
  channel: string; to_addr: string | null; ok: boolean; reason: string | null
}[]): Promise<void> {
  const sb = serverClient()
  if (!sb || !rows.length) return
  await sb.from('reminder_log').upsert(rows, { onConflict: 'key' })
}

/* ---------------------------------------------------------
   한 건 보내기
   면접관 채널이 'both' 면 이메일·Slack 둘 다 시도하고,
   하나라도 성공하면 성공으로 본다(알림은 도달이 목적).
   --------------------------------------------------------- */
async function sendOne(cand: Candidate, ev: ReminderEvent): Promise<SendOutcome> {
  const pos = posById(cand.p)
  const stage = stageById(cand.p, cand.st)
  const ct = parseConfirmed(cand.why)
  const when = ct ? confirmedLabel(ct) : cand.why
  const mode = stage.mode || '화상'
  const dur = stage.dur || 60

  if (ev.role === 'candidate') {
    const msg = candidateMessage({
      candName: cand.nm, positionTitle: pos.title, stageName: stage.nm,
      when, dur, mode, offsetLabel: ev.offsetLabel,
      recruiter: personById(pos.rec)?.nm,
    })
    const r = await sendEmail(cand.email, msg.subject, msg.text)
    return {
      key: ev.key, who: `${cand.nm} (후보자)`, channel: '이메일',
      status: r.ok ? 'sent' : 'failed', ...(r.reason ? { reason: r.reason } : {}),
    }
  }

  const p = ev.uid ? personById(ev.uid) : undefined
  const msg = interviewerMessage({
    ivName: p?.nm ?? '면접관', candName: cand.nm, candRole: cand.role,
    stageName: stage.nm, when, dur, mode, offsetLabel: ev.offsetLabel,
    link: `${BASE()}/iv/${cand.id}/${ev.uid}`,
  })

  const ch = p?.ch ?? 'slack'
  const jobs: Promise<{ ok: boolean; reason?: string }>[] = []
  if (ch === 'email' || ch === 'both') jobs.push(sendEmail(p?.email, msg.subject, msg.text))
  if (ch === 'slack' || ch === 'both') {
    // 웹훅은 채널로 간다 → 본문 첫 줄에 수신 대상을 명시한다.
    jobs.push(sendSlack(`*${p?.nm ?? '면접관'}* 님께 — ${msg.subject}\n${msg.text}`))
  }
  const rs = await Promise.all(jobs)
  const ok = rs.some(r => r.ok)
  const reason = rs.filter(r => !r.ok).map(r => r.reason).join(' / ')
  return {
    key: ev.key, who: p?.nm ?? '면접관', channel: ev.channel,
    status: ok ? 'sent' : 'failed', ...(reason && !ok ? { reason } : {}),
  }
}

/* ---------------------------------------------------------
   묶어서 보내기 — 이벤트 목록을 받아 중복을 걸러내고 발송·기록
   --------------------------------------------------------- */
async function run(pairs: { cand: Candidate; ev: ReminderEvent }[]): Promise<SendReport> {
  const st = mailerStatus()
  if (st.state === 'unconfigured') {
    return {
      ok: false, configured: false, sent: 0, skipped: pairs.length, failed: 0, results: [],
      note: '발송 키가 설정되지 않아 실제로 보내지 않았습니다(시뮬레이션 상태).',
    }
  }

  const log = await loadLog(pairs.map(p => p.ev.key))
  const results: SendOutcome[] = []
  const rows: Parameters<typeof writeLog>[0] = []

  for (const { cand, ev } of pairs) {
    if (log.sent.has(ev.key)) {
      results.push({ key: ev.key, who: ev.who, channel: ev.channel, status: 'skipped', reason: '이미 발송됨' })
      continue
    }
    const out = await sendOne(cand, ev)
    results.push(out)
    rows.push({
      key: ev.key, cid: cand.id, uid: ev.uid ?? null,
      channel: ev.channel, to_addr: st.testTo ?? null,
      ok: out.status === 'sent', reason: out.reason ?? null,
    })
  }
  await writeLog(rows)

  const sent = results.filter(r => r.status === 'sent').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const failed = results.filter(r => r.status === 'failed').length
  return {
    ok: failed === 0, configured: true, sent, skipped, failed, results,
    ...(log.ok ? {} : { note: '발송 기록 테이블이 없어 중복 방지가 적용되지 않았습니다.' }),
  }
}

/* ---------------------------------------------------------
   ① 후보자 한 명 — "지금 보내기"
   아직 안 보낸 것 중 가장 이른 회차(예: 12시간 전) 한 묶음만 보낸다.
   버튼 한 번에 모든 회차가 한꺼번에 나가면 안 되기 때문이다.
   --------------------------------------------------------- */
export async function sendNowFor(cid: string): Promise<SendReport> {
  const cand = cands.find(c => c.id === cid)
  if (!cand) return { ok: false, configured: false, sent: 0, skipped: 0, failed: 0, results: [], note: '후보자를 찾을 수 없습니다.' }

  const evs = remindersFor(cand)
  if (!evs.length) {
    return { ok: false, configured: true, sent: 0, skipped: 0, failed: 0, results: [], note: '확정된 면접이 없어 보낼 리마인드가 없습니다.' }
  }
  const log = await loadLog(evs.map(e => e.key))
  // 오프셋이 큰 것(=먼저 보내는 회차)부터 확인한다.
  const offsets = [...new Set(evs.map(e => e.offset))].sort((a, b) => b - a)
  const target = offsets.find(off => evs.some(e => e.offset === off && !log.sent.has(e.key)))
  if (target === undefined) {
    return { ok: true, configured: true, sent: 0, skipped: evs.length, failed: 0, results: [], note: '이 면접의 리마인드는 이미 전부 발송했습니다.' }
  }
  return run(evs.filter(e => e.offset === target).map(ev => ({ cand, ev })))
}

/* ---------------------------------------------------------
   ② 전체 — 배치(크론)
   '임박(due)'만 보낸다. 이미 지난 회차까지 소급 발송하면
   과거 알림이 한꺼번에 쏟아지므로 의도적으로 제외한다.
   --------------------------------------------------------- */
export async function sendDueReminders(): Promise<SendReport> {
  const pairs: { cand: Candidate; ev: ReminderEvent }[] = []
  for (const cand of cands) {
    if (cand.st === 's0') continue
    for (const ev of remindersFor(cand)) {
      if (ev.state === 'due') pairs.push({ cand, ev })
    }
  }
  if (!pairs.length) {
    return { ok: true, configured: mailerStatus().state === 'configured', sent: 0, skipped: 0, failed: 0, results: [], note: '지금 보낼 리마인드가 없습니다.' }
  }
  return run(pairs)
}

/* 화면 표시에 쓸, 이미 실제 발송된 key 목록 */
export async function sentKeysFor(cid: string): Promise<string[]> {
  const cand = cands.find(c => c.id === cid)
  if (!cand) return []
  const log = await loadLog(remindersFor(cand).map(e => e.key))
  return [...log.sent]
}
