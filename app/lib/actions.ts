'use server'
/* =========================================================
   서버 액션 — 보드에서 카드를 옮기면 DB에 저장한다.
   DB 미설정이면 조용히 no-op (앱은 화면 상태만 바뀜).
   ========================================================= */
import { serverClient } from './supabase'
import { hydrateData } from './db'
import {
  cands, stageById, stagesOf, personById, personByName, posById, people, TODAY,
  auto, evals, offerOf, _patchAuto, _pushEval, _setOffer, _patchCand, _pushTrail,
  _addPosition, nextPositionId, defaultAuto, _setAvail, _patchMeeting, meetings,
  _addCand, nextCandId, _patchPositionBand, _patchPositionState, _patchPerson,
  type AutoConfig, type Rule, type Candidate, type TrailItem, type Position, type Person,
} from './data'
import { stagesFromTemplate } from './templates'
import type { Rating } from './scorecard'
import { verdictOf, VERDICT_LABEL } from './scorecard'
import { rejectDef, REJECT_REASONS, type RejectCode } from './decision'
import {
  canAct, canSend, isApproved, overBand, declineDef,
  type Offer, type DeclineCode,
} from './offer'
import {
  scheduleFor, configFor, businessDays, findSlots, slotLabel,
  type SearchOutcome,
} from './schedule'
import {
  mtgView, mtgLabel, suggestAttendees, attendeePool, mtgKind, MTG_DUR,
  type MtgView, type PoolRow,
} from './meetings'
import { personKeyOf, gradeOf } from './pool'
import { remindersFor, parseConfirmed, confirmedLabel } from './reminders'
import { cancelPlan, cancelDef, type CancelCode } from './reschedule'
import { resolveProvider } from './google'
import { sendNowFor, sendDueReminders as runDueReminders, type SendReport } from './send-reminders'
import { mailerStatus, type MailerStatus } from './mailer'
import { sendCandMail } from './maillog'
import { tplByCode } from './cand-mail'
import { syncDirectory, lastSyncedAt, type SyncReport } from './directory'
import { coreState, coreLabel, fetchSeats, pushHire, type CoreSeat } from './core'

const TODAY_ISO = '2026-08-12' // 데모 기준일 (daysSince 계산 일관성 유지)

export async function persistMove(
  cid: string, toStage: string, status: string, why: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb
    .from('candidates')
    .update({ st: toStage, s: status, why, d: 0, en: TODAY_ISO, act: null })
    .eq('id', cid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

export async function persistCand(
  cid: string, status: string, why: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb
    .from('candidates')
    .update({ s: status, why, act: null })
    .eq('id', cid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 후보자 추가 — 새 카드를 candidates 테이블에 insert 한다.
   id 는 클라이언트에서 crypto.randomUUID() 로 만들어 넘긴다. */
export interface NewCandidate {
  id: string; pid: string; nm: string; st: string
  s: string; yr: number; role: string; src: string; why: string
}
export async function addCandidate(
  c: NewCandidate,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('candidates').insert({
    id: c.id, position_id: c.pid, nm: c.nm, st: c.st, s: c.s,
    d: 0, ap: TODAY_ISO, en: TODAY_ISO, why: c.why,
    src: c.src, yr: c.yr, role: c.role, act: null,
  })
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 일정 조율 에스컬레이션 — 상태(esc)·사유·처리액션을 저장한다.
   조율 처리함(inboxItems)이 esc/late 를 집계하므로 여기로 넘어간다. */
export async function escalateCand(
  cid: string, why: string, act: string[],
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb
    .from('candidates')
    .update({ s: 'esc', why, act })
    .eq('id', cid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 후보자 셀프 예약 확정 — 후보자가 링크에서 슬롯을 직접 고르면 저장한다.
   상태를 done 으로, 사유를 '{라벨} 확정 (후보자 선택)' 으로 기록한다.
   act 은 비워 조율 처리함에서 빠지게 한다. */
export async function bookSlot(
  cid: string, label: string,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb
    .from('candidates')
    .update({ s: 'done', why: `${label} 확정 (후보자 선택)`, act: null })
    .eq('id', cid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* =========================================================
   외부 면접관 링크 (/iv/{cid}/{uid})
   ---------------------------------------------------------
   "AI는 제안까지, 확정은 사람이 누른다"의 그 클릭이 여기서 일어난다.
   면접관은 ATS 계정 없이 링크로 들어와 시간을 확정하거나, 불가 사유를
   남기고 거절한다. 거절은 조율 처리함으로 올라간다(대체 면접관 라우팅).
   ========================================================= */

/* 면접관이 시간을 확정 — 확정자가 누구인지 사유에 남긴다. */
export async function ivConfirm(
  cid: string, uid: string, label: string,
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const nm = personById(uid)?.nm ?? '면접관'
  const why = `${label} 확정 (면접관 ${nm} 확인)`
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb
    .from('candidates').update({ s: 'done', why, act: null }).eq('id', cid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 면접관이 거절 — 사유를 남기고 조율 처리함으로 넘긴다.
   act 은 코디네이터가 바로 누를 다음 수(대체 면접관/재탐색)를 제시한다.
   ('use server' 파일은 async 함수만 export 할 수 있어 상수는 함수 안에 둔다.) */
export async function ivDecline(
  cid: string, uid: string, reason: string,
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const nm = personById(uid)?.nm ?? '면접관'
  const why = `면접관 불가 (${nm}) — ${reason}`
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb
    .from('candidates')
    .update({ s: 'esc', why, act: ['대체 면접관 지정', '다른 시간 재탐색'] })
    .eq('id', cid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 평가(스코어카드) 제출 — 면접관 링크에서 호출한다.
   같은 면접관이 다시 내면 덮어쓴다(수정 = 재제출) → upsert.
   DB 미설정이어도 인메모리에는 반영해, 데모에서 바로 화면에 보이게 한다. */
export async function submitEval(
  cid: string, uid: string,
  items: [string, string][], overall: string, memo: string,
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const p = personById(uid)
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }

  const stage = stageById(c.p, c.st)
  const role = p?.roles?.includes('하이어링 매니저') ? 'HM' : (p?.tt || '면접관')
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const at = `${now.getMonth() + 1}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

  _pushEval(cid, {
    uid, iv: p?.nm ?? '면접관', role, st: stage.nm,
    items: items as [string, Rating][], overall: overall as Rating, memo, at,
  })

  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('evaluations').upsert({
    candidate_id: cid, interviewer_id: uid,
    iv: p?.nm ?? '면접관', role, st: stage.nm,
    items, overall, memo, at,
  }, { onConflict: 'candidate_id,interviewer_id' })
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* =========================================================
   리마인드 실발송
   ---------------------------------------------------------
   계산(reminders.ts)과 발송(mailer.ts)을 잇는 액션.
   키가 없으면 아무것도 보내지 않고 configured:false 로 돌려준다
   → 화면은 기존처럼 '시뮬레이션'으로 표시된다.
   ========================================================= */

/* 후보자 한 명의 다음 리마인드 회차를 지금 보낸다(보드 드로어 버튼). */
export async function sendReminderNow(cid: string): Promise<SendReport> {
  await hydrateData()
  return sendNowFor(cid)
}

/* 임박(due)한 리마인드를 전부 보낸다(크론/설정 화면 버튼). */
export async function sendDueReminders(): Promise<SendReport> {
  await hydrateData()
  return runDueReminders()
}

/* 설정 화면에 보여줄 발송 연동 상태. */
export async function getMailerStatus(): Promise<MailerStatus> {
  return mailerStatus()
}

/* =========================================================
   오퍼
   ---------------------------------------------------------
   상태 전이 규칙은 lib/offer.ts 한 곳에만 둔다. 여기서는
   "그 규칙이 허용하는 전이인지"를 서버에서 한 번 더 확인한다.
   화면에서만 막으면 우회되기 때문이다 — 특히 거절 사유.
   ========================================================= */

function offerRow(o: Offer) {
  return {
    candidate_id: o.cid, st: o.st, level: o.level,
    base: o.base, sign: o.sign, band_lo: o.band[0], band_hi: o.band[1],
    start_date: o.start ?? null, chain: o.chain, created_at: o.createdAt,
    opening_code: o.openingCode ?? null,
    sent_at: o.sentAt ?? null, resp_at: o.respAt ?? null,
    decline_code: o.declineCode ?? null, decline_memo: o.declineMemo ?? null,
  }
}

async function saveOffer(o: Offer): Promise<{ ok: boolean; reason?: string }> {
  _setOffer(o)
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const row = offerRow(o)
  const { error } = await sb.from('offers').upsert(row, { onConflict: 'candidate_id' })
  /* opening_code 는 009 에서 추가된 칸이다. 아직 없는 DB 에서는 upsert 전체가
     실패해 오퍼가 통째로 저장되지 않는다 → 그 칸만 빼고 한 번 더 저장한다.
     (exit_stage 때와 같은 처리) */
  if (error && error.message.includes('opening_code')) {
    const { opening_code: _drop, ...rest } = row
    const retry = await sb.from('offers').upsert(rest, { onConflict: 'candidate_id' })
    return retry.error ? { ok: false, reason: retry.error.message } : { ok: true }
  }
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 처우안 만들기 — 서랍에서 오퍼를 '시작'하는 문.
   지금까지 오퍼는 씨앗 데이터에만 있었고, 새 후보자에게는 만들 길이 없었다.
   금액은 공고 밴드의 가운데를 초안으로 깔아 둔다(사람이 고치라고 두는 값이다).
   승인 줄은 하이어링 매니저 한 명으로 시작하고, 밴드를 넘기면
   승인 요청을 누를 때 본부 승인이 저절로 붙는다. */
export async function createOffer(cid: string): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  if (offerOf(cid)) return { ok: false, reason: 'exists' }
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  const pos = posById(c.p)
  const band: [number, number] = pos.band ?? [4000, 7000]
  const hm = people.find(p => p.nm === pos.hm)
  const today = new Date(TODAY)
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return saveOffer({
    cid, st: 'draft', level: '—',
    base: Math.round((band[0] + band[1]) / 2 / 100) * 100, sign: 0, band,
    chain: hm
      ? [{ uid: hm.id, nm: hm.nm, role: '하이어링 매니저', s: 'pending' }]
      : [],
    createdAt: iso,
  })
}

/* 처우안 저장 — 초안 단계에서만 금액을 고칠 수 있다.
   승인이 시작된 뒤 금액이 바뀌면 앞서 승인한 사람의 결재가 무의미해진다. */
export async function saveOfferDraft(
  cid: string,
  patch: { level: string; base: number; sign: number; start: string; openingCode?: string },
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const o = offerOf(cid)
  if (!o) return { ok: false, reason: 'no-offer' }
  if (o.st !== 'draft') return { ok: false, reason: 'not-draft' }
  return saveOffer({
    ...o, ...patch,
    start: patch.start || undefined,
    openingCode: patch.openingCode || undefined,
  })
}

/* 승인 요청 — 초안을 승인 체인에 올린다.
   밴드를 넘겼는데 본부 승인이 체인에 없으면 여기서 자동으로 붙인다. */
export async function submitOfferForApproval(
  cid: string,
): Promise<{ ok: boolean; reason?: string; added?: string }> {
  await hydrateData()
  const o = offerOf(cid)
  if (!o) return { ok: false, reason: 'no-offer' }
  if (o.st !== 'draft') return { ok: false, reason: 'not-draft' }

  let chain = o.chain
  let added: string | undefined
  if (overBand(o) && !chain.some(a => a.role.indexOf('밴드 초과') >= 0)) {
    const c = cands.find(x => x.id === cid)
    const dept = c ? posById(c.p).dept : ''
    const head = people.find(p => p.dept === dept && (p.tt || '').indexOf('본부장') >= 0)
      ?? people.find(p => (p.tt || '').indexOf('CTO') >= 0)
    if (head) {
      chain = [...chain, { uid: head.id, nm: head.nm, role: '본부 승인 (밴드 초과)', s: 'pending' }]
      added = head.nm
    }
  }
  const r = await saveOffer({ ...o, st: 'approval', chain })
  return added ? { ...r, added } : r
}

/* 승인 — 순차이므로 '지금 차례인 사람'만 누를 수 있다. */
export async function approveOffer(
  cid: string, uid: string,
): Promise<{ ok: boolean; reason?: string; done?: boolean }> {
  await hydrateData()
  const o = offerOf(cid)
  if (!o) return { ok: false, reason: 'no-offer' }
  if (!canAct(o, uid)) return { ok: false, reason: 'not-your-turn' }

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const at = `${now.getMonth() + 1}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const chain = o.chain.map(a => a.uid === uid ? { ...a, s: 'ok' as const, at } : a)
  const next = { ...o, chain }
  const r = await saveOffer(next)
  return { ...r, done: isApproved(next) }
}

/* 보류 — 사유를 반드시 남긴다. 보류되면 체인 전체가 멈춘다. */
export async function holdOffer(
  cid: string, uid: string, memo: string,
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const o = offerOf(cid)
  if (!o) return { ok: false, reason: 'no-offer' }
  if (!canAct(o, uid)) return { ok: false, reason: 'not-your-turn' }
  if (!memo.trim()) return { ok: false, reason: 'need-memo' }

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const at = `${now.getMonth() + 1}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const chain = o.chain.map(a =>
    a.uid === uid ? { ...a, s: 'hold' as const, at, memo: memo.trim() } : a)
  return saveOffer({ ...o, chain })
}

/* 보류 해제 — 다시 대기 상태로 돌린다(사유는 기록에 남긴 채). */
export async function resumeOffer(cid: string): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const o = offerOf(cid)
  if (!o) return { ok: false, reason: 'no-offer' }
  const chain = o.chain.map(a => a.s === 'hold' ? { ...a, s: 'pending' as const } : a)
  return saveOffer({ ...o, chain })
}

/* 발송 — 승인이 전부 끝나야만 나간다. 여기서부터 수락률의 분모에 들어간다. */
export async function sendOffer(cid: string): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const o = offerOf(cid)
  if (!o) return { ok: false, reason: 'no-offer' }
  if (!canSend(o)) return { ok: false, reason: 'not-approved' }
  return saveOffer({ ...o, st: 'sent', sentAt: TODAY_ISO })
}

/* 후보자 응답 기록.
   거절이면 사유 코드가 없으면 저장하지 않는다 — 거절 사유가
   다음 채용의 유일한 자산이라, 비워둘 수 있으면 아무도 안 채운다. */
export async function respondOffer(
  cid: string, accept: boolean, code?: string, memo?: string,
): Promise<{ ok: boolean; reason?: string; handoff?: HandoffResult }> {
  await hydrateData()
  const o = offerOf(cid)
  if (!o) return { ok: false, reason: 'no-offer' }
  if (o.st !== 'sent') return { ok: false, reason: 'not-sent' }
  if (!accept && !code) return { ok: false, reason: 'need-reason' }

  const next: Offer = accept
    ? { ...o, st: 'accepted', respAt: TODAY_ISO }
    : {
      ...o, st: 'declined', respAt: TODAY_ISO,
      declineCode: code as DeclineCode,
      ...(memo?.trim() ? { declineMemo: memo.trim() } : {}),
    }
  const r = await saveOffer(next)

  /* 수락이면 TalentCore 로 내보낸다 — 여기가 Hire 에서 나가는 문이다(T5).
     실패해도 수락은 되돌리지 않는다. 후보자는 이미 수락했고 그 사실이
     사라지면 안 된다. 사유만 돌려주어 화면이 말할 수 있게 한다. */
  let handoff: HandoffResult | undefined
  if (accept) handoff = await handOffToCore(cid, next)

  /* 후보자 카드도 함께 옮긴다 — 수락은 입사 레일, 거절은 불합격 레일.
     오퍼만 바뀌고 보드가 그대로면 두 화면이 서로 다른 말을 하게 된다. */
  const c = cands.find(x => x.id === cid)
  if (c) {
    const st = stagesOf(c.p).find(s => s.kind === (accept ? 'hired' : 'reject'))
    if (st) {
      const why = accept ? '오퍼 수락' : `오퍼 거절 — ${declineDef(code as DeclineCode).l}`
      _patchCand(cid, { st: st.id, s: 'done', why, ...(accept ? {} : { ex: c.st }) })
      const sb = serverClient()
      if (sb) {
        const base = { st: st.id, s: 'done', why, act: null }
        const { error } = await sb.from('candidates')
          .update({ ...base, ...(accept ? {} : { exit_stage: c.st }) }).eq('id', cid)
        /* exit_stage 는 나중에 추가된 칸이다. 아직 없는 DB에서는 update 전체가 실패해
           '오퍼는 거절인데 카드는 그대로'가 된다 → 그 칸만 빼고 한 번 더 저장한다. */
        if (error && error.message.includes('exit_stage')) {
          await sb.from('candidates').update(base).eq('id', cid)
        }
      }
    }
  }
  return handoff ? { ...r, handoff } : r
}

/* =========================================================
   합격자를 TalentCore 로 넘긴다 (T5)
   ---------------------------------------------------------
   자리를 잡아 두는 시점은 '수락'이다. 보낼 때 잡아 두면 거절 한 번에
   자리가 묶여 다음 후보자를 못 넣는다.

   자리 코드가 오퍼에 박혀 있으면 그 카드로 보낸다. TalentCore 가
   "그 카드는 이미 찼다"고 막으면(409) 여기서 실패로 남는다 —
   승인된 정원을 넘기지 않는 건 카드를 가진 쪽이 판단할 일이다.

   자리 코드가 없으면(공고가 Hire 에서 직접 열렸거나 009 이전 오퍼)
   자리 없이 보낸다. TalentCore 는 '정원 밖'으로 받는다.
   ========================================================= */

export interface HandoffResult {
  sent: boolean
  seatCode?: string
  closedPosition?: boolean   // 마지막 자리가 차서 공고를 닫았는가 (D4)
  reason?: string
  detail?: string
}

async function handOffToCore(cid: string, o: Offer): Promise<HandoffResult> {
  if (coreState() !== 'configured') return { sent: false, reason: 'not-configured' }

  const c = cands.find(x => x.id === cid)
  if (!c) return { sent: false, reason: 'no-candidate' }
  const pos = posById(c.p)

  const push = await pushHire({
    name: c.nm,
    email: c.email ?? null,
    start_date: o.start ?? null,
    department: pos.dept || null,
    position: o.level || null,
    job_title: pos.title || null,
    /* 오퍼는 만원 단위, TalentCore 는 원 단위다. 사이닝은 연봉이 아니라
       일회성이므로 더하지 않는다 — 더하면 다음 해 인상률 계산이 어긋난다. */
    salary: o.base ? o.base * 10_000 : null,
    memo: `Hire 오퍼 수락 (${o.respAt ?? TODAY_ISO})`,
    opening_code: o.openingCode ?? null,
    req_ref: pos.reqRef ?? null,
    candidate_ref: cid,
  })

  if (!push.ok) return { sent: false, reason: push.reason, detail: push.detail }

  const out: HandoffResult = { sent: true, ...(push.openingCode ? { seatCode: push.openingCode } : {}) }

  /* D4 — 마지막 자리가 차면 공고를 자동으로 닫는다. 진행 중이던 다른
     후보자를 불합격시키지는 않는다. 자리가 늘어나면(TalentCore 에서
     추가 결재) 다시 열면 된다. */
  if (pos.reqRef && pos.st === 'open') {
    const seats = await fetchSeats(pos.reqRef)
    if (seats.ok) {
      const mine = seatsOfPosition(seats.seats, pos.openingCodes)
      if (mine.length && !mine.some(s => s.open)) {
        _patchPositionState(pos.id, 'closed')
        await persistPosition(pos.id, { st: 'closed' })
        out.closedPosition = true
      }
    }
  }
  return out
}

/** 이 공고가 들고 있는 카드만 골라낸다 — 같은 요청서의 다른 공고 카드는 남의 것이다. */
function seatsOfPosition(seats: CoreSeat[], codes?: string[]): CoreSeat[] {
  if (!codes?.length) return seats
  return seats.filter(s => codes.includes(s.code))
}

/* 처우안 화면이 쓸 자리 목록 — "남은 자리 2 · 진행 중 오퍼 3" 을 여기서 만든다. */
export interface SeatView {
  state: 'ok' | 'not-configured' | 'no-req' | 'error'
  seats: CoreSeat[]
  open: number
  pending: number     // 이 공고에서 아직 수락 전인 오퍼 수
  detail?: string
}

export async function listSeats(pid: string): Promise<SeatView> {
  await hydrateData()
  const pos = posById(pid)
  const pending = cands.filter(c => {
    if (c.p !== pid) return false
    const o = offerOf(c.id)
    return !!o && (o.st === 'draft' || o.st === 'approval' || o.st === 'sent')
  }).length

  if (coreState() !== 'configured')
    return { state: 'not-configured', seats: [], open: 0, pending }
  if (!pos.reqRef)
    return { state: 'no-req', seats: [], open: 0, pending }

  const r = await fetchSeats(pos.reqRef)
  if (!r.ok) return { state: 'error', seats: [], open: 0, pending, detail: r.detail ?? r.reason }

  const mine = seatsOfPosition(r.seats, pos.openingCodes)
  return { state: 'ok', seats: mine, open: mine.filter(s => s.open).length, pending }
}

/* =========================================================
   전형 판정 — 다음 단계 / 보류 / 불합격
   ---------------------------------------------------------
   지금까지 후보자를 앞으로 보내는 방법은 '보드에서 카드를 손으로 끄는 것'
   하나뿐이었다. 그래서 평가를 받아도 아무 일도 일어나지 않았다.
   여기서 평가 → 판정 → 이동을 한 줄로 잇는다.

   규칙(lib/decision.ts)에 대한 서버 쪽 최종 확인:
   · 불합격은 사유 코드가 없으면 저장하지 않는다. 화면에서만 막으면 우회된다.
   · 판정 흔적(stage_events)은 반드시 남긴다 — 되돌릴 수 있어야 하기 때문에
     "누가 언제 왜"가 없으면 되돌린 뒤 아무도 이유를 모른다.
   ========================================================= */

function nowLabel() {
  const n = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${n.getMonth() + 1}/${pad(n.getDate())} ${pad(n.getHours())}:${pad(n.getMinutes())}`
}

/* 후보자 저장 — 나중에 추가된 칸(exit_stage·reject_code…)이 아직 없는 DB에서는
   update 전체가 실패해 '판정은 했는데 카드는 그대로'가 된다.
   그 칸들만 빼고 한 번 더 저장해 최소한 이동은 남게 한다. */
async function updateCand(
  cid: string,
  base: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('candidates').update({ ...base, ...extra }).eq('id', cid)
  if (!error) return { ok: true }
  if (!Object.keys(extra).some(k => error.message.includes(k))) {
    return { ok: false, reason: error.message }
  }
  const again = await sb.from('candidates').update(base).eq('id', cid)
  return again.error ? { ok: false, reason: again.error.message } : { ok: true }
}

/* 기록 한 줄 — 표가 아직 없으면 메모리에만 남는다(화면에는 보인다). */
async function pushTrail(cid: string, t: TrailItem) {
  _pushTrail(cid, t)
  const sb = serverClient()
  if (!sb) return
  await sb.from('stage_events').insert({ candidate_id: cid, ...t })
}

/* 이 단계에서 받은 평가만 — 앞 단계 평가가 판정에 섞이면 안 된다. */
function evalsAt(cid: string, stageNm: string) {
  return (evals[cid] || []).filter(e => e.st === stageNm)
}

/* 오퍼 단계로 넘어가면 처우안 초안을 자동으로 만들어 둔다.
   밴드는 '지금 이 공고의 밴드'를 복사한다(오퍼는 그때 값을 들고 있어야 한다).
   금액은 밴드 하단으로 채워 두되, 어차피 초안에서 고쳐야 한다. */
function draftOfferFor(c: Candidate): Offer {
  const pos = posById(c.p)
  const hm = personByName(pos.hm)
  const band: [number, number] = pos.band ?? [0, 0]
  return {
    cid: c.id, st: 'draft', level: pos.title,
    base: band[0], sign: 0, band,
    chain: hm ? [{ uid: hm.id, nm: hm.nm, role: '하이어링 매니저', s: 'pending' }] : [],
    createdAt: TODAY_ISO,
  }
}

/* 합격 — 다음 단계로 보낸다. */
export async function advanceCand(
  cid: string,
): Promise<{ ok: boolean; reason?: string; to?: string; offerMade?: boolean }> {
  await hydrateData()
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  const cur = stageById(c.p, c.st)
  if (cur.rail) return { ok: false, reason: 'closed' }

  const line = stagesOf(c.p).filter(s => !s.rail)
  const next = line[line.findIndex(s => s.id === c.st) + 1]
  if (!next) return { ok: false, reason: 'no-next' }

  const ev = evalsAt(cid, cur.nm)
  const why = `${cur.nm} 통과`
  _patchCand(cid, { st: next.id, s: 'idle', d: 0, en: TODAY_ISO, why, act: undefined })
  const r = await updateCand(cid, { st: next.id, s: 'idle', d: 0, en: TODAY_ISO, why, act: null })

  /* 오퍼 단계라면 초안까지 만들어 둔다 — 여기서 끊기면 다음에 누를 것이 없다. */
  let offerMade = false
  if (next.kind === 'offer' && !offerOf(cid)) {
    await saveOffer(draftOfferFor(c))
    offerMade = true
  }

  await pushTrail(cid, {
    at: nowLabel(), s: 'done',
    b: `${cur.nm} 통과 → ${next.nm}`,
    p: ev.length
      ? `평가 ${ev.length}건 · ${VERDICT_LABEL[verdictOf(ev)]}${offerMade ? ' · 처우안 초안 자동 생성' : ''}`
      : `평가 없이 진행${offerMade ? ' · 처우안 초안 자동 생성' : ''}`,
  })
  return { ...r, to: next.nm, offerMade }
}

/* 보류 — 단계는 그대로 두고 '사람이 봐야 하는 건'으로 올린다.
   합·불 둘만 두면 "일단 킵"이 아무 데도 남지 않고 사람 머릿속에만 남는다. */
export async function holdCand(
  cid: string, memo: string,
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  if (stageById(c.p, c.st).rail) return { ok: false, reason: 'closed' }
  if (!memo.trim()) return { ok: false, reason: 'need-memo' }

  const why = `판정 보류 — ${memo.trim()}`
  const act = ['판정 다시 하기', '후보자에게 상황 안내']
  _patchCand(cid, { s: 'esc', why, act })
  const r = await updateCand(cid, { s: 'esc', why, act })
  await pushTrail(cid, { at: nowLabel(), s: 'now', b: '판정 보류', p: memo.trim() })
  return r
}

/* 불합격 — 사유 없이는 저장하지 않는다.
   사유는 '우리가 거절'과 '후보자가 이탈'로 나뉜다. 둘을 섞으면
   퍼널에서 기준의 문제와 매력의 문제가 구분되지 않는다. */
export async function rejectCand(
  cid: string, code: string, memo?: string,
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  const cur = stageById(c.p, c.st)
  if (cur.rail) return { ok: false, reason: 'closed' }
  if (!code || !REJECT_REASONS.some(r => r.v === code)) return { ok: false, reason: 'need-reason' }

  const rail = stagesOf(c.p).find(s => s.kind === 'reject')
  if (!rail) return { ok: false, reason: 'no-rail' }

  const def = rejectDef(code as RejectCode)
  const note = memo?.trim() || ''
  const why = `${def.side === 'them' ? '후보자 이탈' : '불합격'} — ${def.l}`

  _patchCand(cid, {
    st: rail.id, s: 'done', d: 0, why, act: undefined,
    ex: c.st, rj: code as RejectCode, decided: TODAY_ISO,
    ...(note ? { rjMemo: note } : {}),
  })
  const r = await updateCand(cid,
    { st: rail.id, s: 'done', d: 0, why, act: null },
    {
      exit_stage: c.st, reject_code: code,
      reject_memo: note || null, decided_at: TODAY_ISO,
    })
  await pushTrail(cid, {
    at: nowLabel(), s: 'bad',
    b: `${cur.nm}에서 ${def.side === 'them' ? '이탈' : '불합격'}`,
    p: note ? `${def.l} · ${note}` : def.l,
  })
  return r
}

/* 판정 되돌리기 — 불합격은 우리 손으로 누른 판단이라 오조작이 있을 수 있다.
   (오퍼 수락·거절에 되돌리기를 두지 않은 것과 다른 이유: 그건 후보자의 답이다.
    그래서 오퍼가 거절로 끝난 건은 여기서도 되돌릴 수 없다.) */
export async function undoReject(cid: string): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  if (stageById(c.p, c.st).kind !== 'reject') return { ok: false, reason: 'not-rejected' }
  if (offerOf(cid)?.st === 'declined') return { ok: false, reason: 'offer-declined' }

  const line = stagesOf(c.p).filter(s => !s.rail)
  const back = (c.ex ? line.find(s => s.id === c.ex) : undefined) ?? line[0]
  const why = '판정 되돌림 — 다시 확인 필요'

  _patchCand(cid, {
    st: back.id, s: 'esc', why, act: ['판정 다시 하기'],
    ex: undefined, rj: undefined, rjMemo: undefined, decided: undefined,
  })
  const r = await updateCand(cid,
    { st: back.id, s: 'esc', why, act: ['판정 다시 하기'] },
    { exit_stage: null, reject_code: null, reject_memo: null, decided_at: null })
  await pushTrail(cid, {
    at: nowLabel(), s: 'now', b: '판정 되돌림', p: `${back.nm} 단계로 되돌렸습니다`,
  })
  return r
}

/* 일정 조율 슬롯 탐색(서버) — provider 를 서버에서 결정한다.
   Google 캘린더가 연결돼 있으면 실제 free-busy 로, 아니면 수동 가용성(Manual)으로
   슬롯을 계산한다. 결과와 함께 어떤 소스를 썼는지(source)도 돌려준다.
   미연결/조회 실패 시 조용히 Manual 로 폴백 → 화면 동작은 동일하게 유지된다. */
export async function searchSlots(
  cid: string, widen: boolean,
): Promise<{ outcome: SearchOutcome; source: 'google' | 'manual' }> {
  await hydrateData()
  const cand = cands.find(c => c.id === cid)
  if (!cand) return { outcome: { kind: 'no-interviewer' }, source: 'manual' }

  const base0 = configFor(cand.p)
  const windowDays = widen ? Math.min(base0.windowDays * 2, 30) : base0.windowDays

  // EA 포함/면접관 미지정이면 Google 조회가 무의미 → Manual 로 바로.
  const stage = stageById(cand.p, cand.st)
  const ivs = stage.ivs || []
  const hasEA = ivs.some(u => personById(u)?.ea)
  if (ivs.length === 0 || hasEA) {
    return { outcome: scheduleFor(cand, undefined, TODAY, windowDays), source: 'manual' }
  }

  const dates = businessDays(TODAY, windowDays)
  const { provider, source } = await resolveProvider(ivs, dates)
  return { outcome: scheduleFor(cand, provider, TODAY, windowDays), source }
}

/* 후보자 상세 편집 저장 — 이름/연차/이력/출처를 수정한다. */
export async function editCandidate(
  cid: string, patch: { nm: string; yr: number; role: string; src: string },
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('candidates').update(patch).eq('id', cid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* =========================================================
   공고 설정 — 전형 단계 편집 (setup 화면)
   ---------------------------------------------------------
   단계 이름/체류일/면접 길이/면접관, 순서, 추가·삭제, 기본 정보를
   stages·positions 테이블에 저장한다. DB 미설정이면 조용히 no-op.
   ========================================================= */

/* 단계 하나의 속성 수정 — 이름·체류일·면접길이·면접관·자동 여부 */
export interface StagePatch {
  nm?: string; sla?: number; dur?: number; ivs?: string[]; auto?: boolean
}
export async function persistStageEdit(
  pid: string, id: string, patch: StagePatch,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb
    .from('stages').update(patch)
    .eq('position_id', pid).eq('id', id)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 순서·색상 저장 — 드래그로 순서를 바꾸거나 단계를 더/뺀 뒤 호출.
   비레일 단계는 색 램프가 바뀌므로 ord·color 를 함께 반영한다. */
export async function persistStageLayout(
  pid: string, rows: { id: string; ord: number; color: string }[],
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  for (const r of rows) {
    const { error } = await sb
      .from('stages').update({ ord: r.ord, color: r.color })
      .eq('position_id', pid).eq('id', r.id)
    if (error) return { ok: false, reason: error.message }
  }
  return { ok: true }
}

/* 단계 추가 — 새 단계를 stages 에 insert. id 는 클라이언트에서 생성. */
export interface NewStage {
  id: string; nm: string; kind: string; sla: number
  dur: number; mode: string; color: string; auto: boolean; ord: number
}
export async function persistAddStage(
  pid: string, s: NewStage,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('stages').insert({
    position_id: pid, id: s.id, ord: s.ord, nm: s.nm, kind: s.kind,
    sla: s.sla, dur: s.dur, mode: s.mode, ivs: [], color: s.color,
    auto: s.auto, rail: false,
  })
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 단계 삭제 — 진행 중인 후보자가 있으면 거부(친절한 메시지).
   DB 미설정이어도 후보자 수는 하이드레이트된 데이터로 재확인한다. */
export async function persistDeleteStage(
  pid: string, id: string,
): Promise<{ ok: boolean; reason?: string; count?: number }> {
  await hydrateData()
  const n = cands.filter(c => c.p === pid && c.st === id).length
  if (n > 0) return { ok: false, reason: 'has-candidates', count: n }
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb
    .from('stages').delete()
    .eq('position_id', pid).eq('id', id)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* =========================================================
   자동화 설정 — 규칙 on/off·임계값, 슬롯 탐색·리마인더 파라미터
   ---------------------------------------------------------
   저장과 동시에 인메모리 auto[pid] 를 갱신한다. 그래야 같은 프로세스의
   스케줄링 엔진(configFor)이 편집한 탐색범위·시간대·버퍼를 즉시 반영한다.
   DB 미설정이면 인메모리 갱신만(세션 내 유지).
   ========================================================= */
function autoRow(pid: string, a: AutoConfig) {
  return {
    position_id: pid, win: a.window, hours: a.hours, buffer: a.buffer,
    cand_sla: a.candSla, iv_sla: a.ivSla, remind: a.remind, tz: a.tz, rules: a.rules,
  }
}

/* 슬롯 탐색·리마인더 파라미터 저장 */
export async function persistAuto(
  pid: string, patch: Partial<AutoConfig>,
): Promise<{ ok: boolean; reason?: string }> {
  _patchAuto(pid, patch)
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('automation')
    .upsert(autoRow(pid, auto[pid]), { onConflict: 'position_id' })
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 에스컬레이션 규칙 저장 — 클라이언트의 최종 규칙 배열을 통째로 반영 */
export async function persistAutoRules(
  pid: string, rules: Rule[],
): Promise<{ ok: boolean; reason?: string }> {
  _patchAuto(pid, { rules })
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('automation')
    .upsert(autoRow(pid, auto[pid]), { onConflict: 'position_id' })
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 공고 기본 정보 저장 — 공고명/팀/고용형태/상태/JD 등. */
export interface PositionPatch {
  title?: string; team?: string; emp?: string
  st?: string; jd?: string; rec?: string; hm?: string
}
export async function persistPosition(
  pid: string, patch: PositionPatch,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('positions').update(patch).eq('id', pid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* 연봉 밴드 수정 — 칸 두 개를 한 번에 고친다.
   마이그레이션 004 전에는 band_lo/hi 칸이 없으므로 저장은 실패할 수 있다.
   그런 때도 화면은 진행시킨다 — 메모리에는 이미 들어가 있고,
   오퍼 초안은 그 값을 그대로 복사해 간다. */
export async function savePositionBand(
  pid: string, bandLo: number, bandHi: number,
): Promise<{ ok: boolean; reason?: string }> {
  const lo = Math.max(0, bandLo)
  const hi = Math.max(0, bandHi)
  _patchPositionBand(pid, [lo, hi])
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('positions').update({ band_lo: lo, band_hi: hi }).eq('id', pid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* =========================================================
   공고 개설 (C-2) — 채용 한 건의 출발점
   ---------------------------------------------------------
   한 번의 호출로 세 가지를 함께 만든다. 하나라도 빠지면 보드가 열리지 않는다.
     ① positions   공고 자체
     ② stages      전형 단계(= 보드의 열). 템플릿에서 펼친다
     ③ automation  이 공고의 탐색 범위·응답 제한·에스컬레이션 규칙
   DB가 없거나 일부 칸이 아직 없어도 화면은 열려야 하므로,
   인메모리 반영을 먼저 하고 DB 저장은 되는 만큼만 한다.

   ※ 채용 요청(Requisition)과 그 결재는 여기서 다루지 않는다.
     조직·정원·예산이 있는 TalentCore(HRIS)의 몫이고, Hire 는
     '승인된 요청 → 공고 개설'만 받는다. 연결되기 전까지 req 는 비어 있다.
   ========================================================= */
export interface NewPositionInput {
  title: string; dept: string; team: string; emp: string
  rec: string; hm: string
  bandLo: number; bandHi: number
  jd: string
  template: string
  /* TalentCore 에서 밀려 들어온 경우에만 채워진다(T3).
     사람이 Hire 안에서 직접 개설하면 셋 다 비어 있고, openings 는 1이 된다. */
  reqRef?: string          // 채용 요청서 번호 (REQ-12)
  openingCodes?: string[]  // 자리 카드 코드 (OP-12-1 …). 장수가 곧 뽑는 인원이다
}

export async function createPosition(
  input: NewPositionInput,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  await hydrateData()

  const title = input.title.trim()
  if (!title) return { ok: false, reason: 'no-title' }
  /* 밴드는 뒤집혀 들어올 수 있다(하한 > 상한). 오퍼 초안이 이 값을 그대로
     복사해 가므로 여기서 바로잡지 않으면 '밴드 초과' 경고가 영원히 뜬다. */
  const lo = Math.min(input.bandLo, input.bandHi)
  const hi = Math.max(input.bandLo, input.bandHi)

  const pid = nextPositionId()
  const st = stagesFromTemplate(input.template)
  const cfg = defaultAuto()
  /* 자리 카드 코드가 왔으면 장수가 곧 뽑는 인원이다. 사람이 직접 만든 공고는 1명. */
  const codes = (input.openingCodes ?? []).filter(Boolean)
  const openings = codes.length || 1

  const pos: Position = {
    id: pid, title, dept: input.dept, team: input.team.trim(), emp: input.emp,
    st: 'open', rec: input.rec, hm: input.hm, opened: TODAY_ISO, ttf: 0,
    jd: input.jd.trim(), band: [lo, hi],
    ...(input.reqRef ? { reqRef: input.reqRef } : {}),
    ...(codes.length ? { openings, openingCodes: codes } : {}),
  }

  _addPosition(pos, st, cfg)

  const sb = serverClient()
  if (!sb) return { ok: true, id: pid, reason: 'not-configured' }

  /* 공고 — band_lo/hi 는 마이그레이션 004, req_ref/openings/opening_codes 는 007 이
     만드는 칸이라 아직 없을 수 있다. 통째로 실패하면 공고 자체가 안 생기므로
     없을 수 있는 칸부터 한 겹씩 벗겨가며 다시 넣는다. */
  const base = {
    id: pid, title: pos.title, dept: pos.dept, team: pos.team, emp: pos.emp,
    st: pos.st, rec: pos.rec, hm: pos.hm, opened: pos.opened, ttf: 0, jd: pos.jd,
  }
  const withBand = { ...base, band_lo: lo, band_hi: hi }
  const link = input.reqRef || codes.length
    ? { req_ref: input.reqRef ?? null, openings, opening_codes: codes }
    : {}

  let { error } = await sb.from('positions').insert({ ...withBand, ...link })
  if (error && /req_ref|openings|opening_codes/.test(error.message)) {
    ({ error } = await sb.from('positions').insert(withBand))
  }
  if (error && (error.message.includes('band_lo') || error.message.includes('band_hi'))) {
    ({ error } = await sb.from('positions').insert(base))
  }
  if (error) return { ok: false, reason: error.message }

  const sErr = await sb.from('stages').insert(st.map((s, i) => ({
    position_id: pid, id: s.id, ord: i, nm: s.nm, kind: s.kind, sla: s.sla,
    dur: s.dur, mode: s.mode, ivs: [], color: s.color, auto: s.auto, rail: !!s.rail,
  })))
  if (sErr.error) return { ok: false, reason: sErr.error.message }

  await sb.from('automation').upsert(autoRow(pid, cfg), { onConflict: 'position_id' })
  return { ok: true, id: pid }
}

/* ---------------------------------------------------------
   면접관 가용시간 저장 (외부 링크 ④)
   ---------------------------------------------------------
   화면은 '가능한 시간'을 보내오고, 여기서는 그것을 뒤집은 busy 블록을 받는다
   (뒤집기는 lib/availability.ts 의 toBusy 가 이미 끝내둔다).
   저장이 성공하든 아니든 인메모리에는 먼저 반영한다 — availability 테이블이
   아직 없는 환경에서도 일정 탐색이 방금 고른 시간을 곧바로 쓰게 하려는 것.
   --------------------------------------------------------- */
export async function saveAvailability(
  uid: string,
  wh: [number, number],
  busy: { date: string; start: number; end: number }[],
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  if (!personById(uid)) return { ok: false, reason: 'no-interviewer' }

  _setAvail(uid, wh, busy)

  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb
    .from('availability')
    .upsert({ uid, wh_lo: wh[0], wh_hi: wh[1], busy, updated_at: new Date().toISOString() })
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* =========================================================
   E-4 일정 변경·취소
   ---------------------------------------------------------
   리마인드 '회수'는 따로 지우는 일이 아니다. 리마인드는 후보자 why 에 적힌
   확정 시각에서 계산되므로, why 에서 확정을 지우는 순간 예약분은 사라진다.
   (이미 나간 것은 reminder_log 에 남는다 — 발송 이력은 지우지 않는다.)
   ========================================================= */
export async function cancelInterview(
  cid: string,
  input: {
    mode: 'cancel' | 'reschedule'
    code: CancelCode
    memo?: string
    notifyCand: boolean
    notifyIv: boolean
  },
): Promise<{ ok: boolean; reason?: string; why?: string; status?: string; recalled?: number }> {
  await hydrateData()
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  const ct = parseConfirmed(c.why)
  if (!ct) return { ok: false, reason: 'not-confirmed' }

  const stage = stageById(c.p, c.st)
  const ivNames = (stage.ivs || []).map(u => personById(u)?.nm).filter(Boolean) as string[]
  /* 아직 안 나간 리마인드만 '회수'다. 이미 나간 것을 회수했다고 말하면 거짓말이 된다. */
  const recalled = remindersFor(c).filter(e => e.state !== 'sent').length

  const plan = cancelPlan({
    mode: input.mode,
    code: input.code,
    memo: input.memo?.trim(),
    when: confirmedLabel(ct),
    remCount: recalled,
    ivNames,
    notifyCand: input.notifyCand,
    notifyIv: input.notifyIv,
    dur: stage.dur || 60,
  })

  _patchCand(cid, {
    s: plan.status, why: plan.why,
    act: plan.act.length ? plan.act : undefined,
  })
  const r = await updateCand(cid, {
    s: plan.status, why: plan.why, act: plan.act.length ? plan.act : null,
  })
  await pushTrail(cid, {
    at: nowLabel(),
    s: input.mode === 'reschedule' ? 'now' : 'bad',
    b: plan.trailB,
    p: plan.trailP,
  })
  return { ...r, why: plan.why, status: plan.status, recalled }
}

/* =========================================================
   F. 공고 단위 내부 미팅 (킥오프 · 디브리프)
   ---------------------------------------------------------
   미팅에는 표 컬럼을 늘리지 않았다. 참석자는 who(이름 배열), 시간은 v 한 줄에
   담긴다 — 마이그레이션 없이 지금 있는 meetings 표를 그대로 쓴다.
   상태(s)와 다음 한 수(act)는 저장하되, 화면이 믿는 값은 meetings.ts 가
   매번 다시 계산한 것이다(저장값이 낡아도 화면은 맞다).
   ========================================================= */

/* meetings 표에 한 건 저장 — 표가 없으면 메모리에만 남는다(화면에는 보인다). */
async function updateMeeting(mid: string, patch: Record<string, unknown>) {
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('meetings').update(patch).eq('id', mid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

function findMeeting(pid: string, mid: string) {
  return (meetings[pid] || []).find(m => m.id === mid)
}

/** F-3 참석자 지정 — HM 이 고른 사람들을 저장한다.
    이름으로 저장하는 이유는 표의 기존 형식(who text[])을 그대로 쓰기 위해서다. */
export async function assignMeeting(
  pid: string, mid: string, uids: string[],
): Promise<{ ok: boolean; reason?: string; view?: MtgView }> {
  await hydrateData()
  const m = findMeeting(pid, mid)
  if (!m) return { ok: false, reason: 'no-meeting' }
  const who = uids.map(u => personById(u)?.nm).filter(Boolean) as string[]
  if (!who.length) return { ok: false, reason: 'no-attendee' }

  _patchMeeting(pid, mid, { who, act: undefined })
  const after = mtgView(pid, { ...m, who, act: undefined })
  _patchMeeting(pid, mid, { s: after.s, v: after.v, ag: after.ag, act: after.act })
  /* 저장이 실패해도(표 없음·미연결) 화면은 진행시킨다 — 계산된 view 가 진짜다. */
  await updateMeeting(mid, {
    who, s: after.s, v: after.v, ag: after.ag, act: after.act ?? null,
  })
  return { ok: true, view: mtgView(pid, findMeeting(pid, mid)!) }
}

/** 참석자 기본값 제안 — HM 이 처음 열었을 때 체크돼 있어야 할 사람들. */
export async function meetingPicker(
  pid: string, mid: string,
): Promise<{ uids: string[]; pool: PoolRow[] }> {
  await hydrateData()
  const m = findMeeting(pid, mid)
  if (!m) return { uids: [], pool: [] }
  return { uids: suggestAttendees(pid, mtgKind(m.nm)), pool: attendeePool(pid) }
}

/** 30분 교집합 탐색 — 참석자 전원이 비어 있는 자리를 찾는다.
    인터뷰와 같은 엔진·같은 버퍼를 쓴다(설정을 두 벌로 나누면 결과가 갈린다). */
export async function searchMeetingSlots(
  pid: string, mid: string, widen: boolean,
): Promise<{
  ok: boolean; reason?: string
  slots?: { date: string; start: number; end: number; label: string }[]
  scanned?: number; source?: 'google' | 'manual'; ea?: string[]
}> {
  await hydrateData()
  const m = findMeeting(pid, mid)
  if (!m) return { ok: false, reason: 'no-meeting' }
  const view = mtgView(pid, m)
  if (!view.uids.length) return { ok: false, reason: 'no-attendee' }
  if (view.ea.length) return { ok: false, reason: 'ea', ea: view.ea }

  const base = configFor(pid)
  const windowDays = widen ? Math.min(base.windowDays * 2, 30) : base.windowDays
  const dates = businessDays(TODAY, windowDays)
  const { provider, source } = await resolveProvider(view.uids, dates)
  const slots = findSlots({
    interviewers: view.uids,
    durationMin: m.dur || MTG_DUR,
    windowDays,
    workHours: base.workHours,
    bufferMin: base.bufferMin,
    baseDate: TODAY,
  }, provider)
  return {
    ok: true, source, scanned: dates.length,
    slots: slots.map(x => ({ ...x, label: slotLabel(x) })),
  }
}

/** 시간 확정 — v 에 '{날짜} {시각} 예정' 을 적는다.
    이 문자열을 meetings.ts 가 다시 읽어 '확정됨'으로 판단하므로, 형식을 바꾸면
    미팅이 영원히 미확정으로 보인다(라벨 생성은 mtgLabel 하나로 모아둔 이유). */
export async function confirmMeeting(
  pid: string, mid: string, date: string, start: number,
): Promise<{ ok: boolean; reason?: string; view?: MtgView }> {
  await hydrateData()
  const m = findMeeting(pid, mid)
  if (!m) return { ok: false, reason: 'no-meeting' }
  if (!(m.who || []).length) return { ok: false, reason: 'no-attendee' }

  const v = mtgLabel(date, start)
  _patchMeeting(pid, mid, { v, act: undefined })
  const after = mtgView(pid, { ...m, v, act: undefined })
  _patchMeeting(pid, mid, { s: after.s, ag: after.ag, act: after.act })
  await updateMeeting(mid, {
    v, s: after.s, ag: after.ag, act: after.act ?? null,
  })
  return { ok: true, view: mtgView(pid, findMeeting(pid, mid)!) }
}


/* =========================================================
   인재풀 · 중복 정리
   ---------------------------------------------------------
   왜 지원건을 옮기지 않고 새로 만드는가, 왜 자동으로 합치지 않는가는
   lib/pool.ts 머리글에 정리해 뒀다. 여기서는 저장만 한다.
   person_key 칸이 아직 없는 DB에서도 화면은 진행시킨다 —
   메모리 덮개(data.ts pkOverlay)가 새로고침까지는 버텨 준다.
   ========================================================= */

/** person_key 저장 — 칸이 없으면 사유를 돌려주되 메모리에는 이미 반영돼 있다. */
async function setPersonKey(cid: string, pk: string): Promise<string | undefined> {
  _patchCand(cid, { pk })
  const sb = serverClient()
  if (!sb) return 'not-configured'
  const { error } = await sb.from('candidates').update({ person_key: pk }).eq('id', cid)
  return error ? error.message : undefined
}

/** 인재풀에서 이 공고로 다시 올리기 — 과거 지원건은 그대로 두고 새 지원건을 만든다. */
export async function recallToPosition(
  cid: string, pid: string,
): Promise<{ ok: boolean; reason?: string; id?: string; nm?: string }> {
  await hydrateData()
  const src = cands.find(c => c.id === cid)
  if (!src) return { ok: false, reason: 'no-candidate' }
  const line = stagesOf(pid).filter(x => !x.rail)
  const first = line.find(x => x.kind === 'apply') ?? line[0]
  if (!first) return { ok: false, reason: 'no-stage' }
  if (cands.some(x => x.p === pid && x.st !== 's0' && personKeyOf(x) === personKeyOf(src)))
    return { ok: false, reason: 'already-open' }

  const id = nextCandId()
  const pk = personKeyOf(src)
  const row: Candidate = {
    id, nm: src.nm, p: pid, st: first.id, s: 'idle', d: 0,
    ap: TODAY_ISO, en: TODAY_ISO, why: '', src: '인재풀', yr: src.yr, role: src.role,
    ...(src.email ? { email: src.email } : {}), pk,
  }
  _addCand(row)
  /* 과거 지원건도 같은 사람으로 묶어 둔다 — 안 그러면 방금 만든 건이 '중복'으로 다시 뜬다. */
  if (!src.pk) await setPersonKey(src.id, pk)

  await pushTrail(id, {
    at: nowLabel(), b: '인재풀에서 다시 올림',
    p: `${posById(src.p).title} · ${src.ex ? stageById(src.p, src.ex).nm : '이력'} · ${gradeOf(src).why}`,
    s: 'done',
  })

  const sb = serverClient()
  if (!sb) return { ok: true, id, nm: src.nm, reason: 'not-configured' }
  const base: Record<string, unknown> = {
    id, position_id: pid, nm: src.nm, st: first.id, s: 'idle',
    d: 0, ap: TODAY_ISO, en: TODAY_ISO, why: '', src: '인재풀',
    yr: src.yr, role: src.role, act: null,
  }
  let { error } = await sb.from('candidates').insert({ ...base, person_key: pk, email: src.email ?? null })
  if (error) ({ error } = await sb.from('candidates').insert(base))
  return error
    ? { ok: false, reason: error.message }
    : { ok: true, id, nm: src.nm }
}

/** 같은 사람으로 묶기 — 지원건은 둘 다 그대로 남는다.
    어느 쪽을 '대표'로 삼을지는 묻지 않는다 — 지원건을 지우지 않기 때문에
    사람 눈에 보이는 차이가 없고, 의미 없는 선택을 물으면 손만 느려진다.
    먼저 들어온 지원건을 열쇠로 쓴다(그 사람을 처음 만난 기록). */
export async function mergeCandidates(
  aId: string, bId: string,
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const x = cands.find(c => c.id === aId)
  const y = cands.find(c => c.id === bId)
  if (!x || !y) return { ok: false, reason: 'no-candidate' }
  const [a, b] = x.ap <= y.ap ? [x, y] : [y, x]
  const pk = personKeyOf(a)
  const e1 = await setPersonKey(a.id, pk)
  const e2 = await setPersonKey(b.id, pk)
  const line = (y: typeof a) => ({
    at: nowLabel(), b: '중복 정리 — 같은 사람으로 묶음',
    p: `${posById(y.p).title} 지원건(${y.role})과 동일 인물로 확인`, s: 'done',
  })
  await pushTrail(a.id, line(b))
  await pushTrail(b.id, line(a))
  const err = e1 ?? e2
  return err ? { ok: false, reason: err } : { ok: true }
}

/** 동명이인으로 확정 — 각자 자기 id 를 열쇠로 가지면 다시 묻지 않는다. */
export async function dismissDuplicate(
  aId: string, bId: string,
): Promise<{ ok: boolean; reason?: string }> {
  await hydrateData()
  const a = cands.find(c => c.id === aId)
  const b = cands.find(c => c.id === bId)
  if (!a || !b) return { ok: false, reason: 'no-candidate' }
  const e1 = a.pk ? undefined : await setPersonKey(a.id, a.id)
  const e2 = b.pk ? undefined : await setPersonKey(b.id, b.id)
  const err = e1 ?? e2
  return err ? { ok: false, reason: err } : { ok: true }
}

/* =========================================================
   직원 명부 (T4) — TalentCore 에서 당겨오기 · Hire 칸 고치기
   ---------------------------------------------------------
   이름·직함·부서·메일·재직여부는 TalentCore 것이라 여기에 고치는 함수가 없다.
   고쳐야 하면 TalentCore 에서 고치고 다시 동기화한다.
   ========================================================= */

export async function syncDirectoryNow(): Promise<SyncReport> {
  return syncDirectory()
}

export async function directoryStatus(): Promise<{
  state: 'unconfigured' | 'configured'; url: string; last: string | null
}> {
  return { state: coreState(), url: coreLabel(), last: await lastSyncedAt() }
}

/** 면접 역할 태그 — 이 사람을 면접에 부를 수 있게 할지, 어떤 역할로 부를지. */
export async function setPersonRoles(
  uid: string, roles: string[],
): Promise<{ ok: boolean; reason?: string }> {
  const clean = [...new Set(roles.map(r => r.trim()).filter(Boolean))]
  _patchPerson(uid, { roles: clean })
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('people').update({ roles: clean }).eq('id', uid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/** 조율 방식·알림 채널·응답 기준 — 전부 Hire 것이다. 동기화가 덮어쓰지 않는다. */
export async function setPersonPrefs(
  uid: string, prefs: { ea?: boolean; eaNm?: string; ch?: string; sla?: number },
): Promise<{ ok: boolean; reason?: string }> {
  const patch: Partial<Person> = {}
  const row: Record<string, unknown> = {}
  if (prefs.ea !== undefined) { patch.ea = prefs.ea; row.ea = prefs.ea }
  if (prefs.eaNm !== undefined) {
    const nm = prefs.eaNm.trim()
    patch.eaNm = nm; row.ea_nm = nm || null
  }
  if (prefs.ch !== undefined) { patch.ch = prefs.ch; row.ch = prefs.ch }
  if (prefs.sla !== undefined) {
    const h = Math.max(1, Math.min(168, Math.round(prefs.sla)))
    patch.sla = h; row.sla = h
  }
  /* EA 를 끄면 비서 이름도 같이 지운다 — 꺼진 채로 이름만 남으면
     표에서 '직접 연락'인데 비서가 있는 것처럼 읽힌다. */
  if (prefs.ea === false) { patch.eaNm = ''; row.ea_nm = null }

  _patchPerson(uid, patch)
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }
  const { error } = await sb.from('people').update(row).eq('id', uid)
  return error ? { ok: false, reason: error.message } : { ok: true }
}

/* =========================================================
   여러 명을 한 번에
   ---------------------------------------------------------
   보드에서 카드를 여러 장 고른 뒤 누르는 것들. 한 명씩 처리하는 함수를
   그대로 줄 세워 부른다 — 판정 규칙·기록·처우안 초안 생성이 한 명일 때와
   똑같이 돌아야 하기 때문이다. '빠른 길'을 따로 파면 여기서만 기록이 빠진다.

   한 번의 요청 안에서 도는 반복이라 hydrateData() 는 처음 한 번만 실제로 돌고,
   메모리 위의 명단은 앞 사람 처리 결과가 반영된 채로 다음 사람에게 넘어간다.
   ========================================================= */
export interface BulkReport {
  ok: number                              // 처리된 사람 수
  fail: { cid: string; nm: string; reason: string }[]
}

const nameOf = (cid: string) => cands.find(x => x.id === cid)?.nm ?? cid

/** 여러 명을 각자의 다음 단계로. 마지막 단계에 서 있는 사람은 건너뛴다. */
export async function bulkAdvance(cids: string[]): Promise<BulkReport> {
  await hydrateData()
  const fail: BulkReport['fail'] = []
  let ok = 0
  for (const cid of cids) {
    const nm = nameOf(cid)
    const r = await advanceCand(cid)
    if (r.ok) ok++
    else fail.push({ cid, nm, reason: r.reason ?? 'unknown' })
  }
  return { ok, fail }
}

/** 여러 명을 같은 사유로 불합격. 사유가 없으면 한 명도 처리하지 않는다. */
export async function bulkReject(
  cids: string[], code: string, memo?: string,
): Promise<BulkReport> {
  await hydrateData()
  if (!code || !REJECT_REASONS.some(r => r.v === code)) {
    return { ok: 0, fail: cids.map(cid => ({ cid, nm: nameOf(cid), reason: 'need-reason' })) }
  }
  const fail: BulkReport['fail'] = []
  let ok = 0
  for (const cid of cids) {
    const nm = nameOf(cid)
    const r = await rejectCand(cid, code, memo)
    if (r.ok) ok++
    else fail.push({ cid, nm, reason: r.reason ?? 'unknown' })
  }
  return { ok, fail }
}

/** 여러 명에게 같은 템플릿으로 메일.
    본문은 사람마다 다시 만든다 — 이름·단계가 각자 다르기 때문에
    한 명의 본문을 복사해 돌리면 남의 단계가 적힌 메일이 나간다. */
export async function bulkMail(cids: string[], code: string): Promise<BulkReport> {
  await hydrateData()
  const t = tplByCode(code)
  if (!t) return { ok: 0, fail: cids.map(cid => ({ cid, nm: nameOf(cid), reason: 'no-template' })) }

  const fail: BulkReport['fail'] = []
  let ok = 0
  for (const cid of cids) {
    const c = cands.find(x => x.id === cid)
    if (!c) { fail.push({ cid, nm: cid, reason: 'no-candidate' }); continue }
    const pos = posById(c.p)
    const m = t.make({
      cand: c.nm, pos: pos.title, stage: stageById(c.p, c.st).nm,
      rc: pos.rec, company: 'TalentCore',
    })
    const r = await sendCandMail({
      cid, kind: code,
      ...(c.email ? { to: c.email } : {}),
      subject: m.subject, body: m.body, byNm: pos.rec,
    })
    if (r.ok) ok++
    else fail.push({ cid, nm: c.nm, reason: r.reason ?? 'unknown' })
  }
  return { ok, fail }
}
