'use server'
/* =========================================================
   Cadence — 면접 조율 서버 액션
   ---------------------------------------------------------
   흐름 한 줄: 자리 찾기 → 보내기(+가예약) → 후보자가 고름 → 확정 → 정리.

   두 가지를 지킨다.
     ① 판단은 iv-flow.ts, 계산은 schedule.ts, 캘린더 쓰기는 hold.ts.
        여기서는 그 셋을 부르고 DB 에 적기만 한다.
     ② DB 가 없거나 캘린더 권한이 없어도 흐름은 끝까지 돈다.
        (권한이 없으면 hold.ts 가 '잡았다고 치고' 넘어간다 — 화면·기록은 동일)

   옛 화면(보드/후보자 카드)도 계속 돌아가야 하므로, 확정·거절은
   candidates 표의 s/why 에도 같은 내용을 적어 준다.
   ========================================================= */

import { randomBytes } from 'crypto'
import { serverClient } from './supabase'
import { hydrateData } from './db'
import {
  cands, posById, stageById, personById, TODAY, DEFAULT_POLICY, demoNow,
  type IvPolicy,
} from './data'
import {
  planFor, policyFor, configFor, businessDays, interviewStages, slotLabel, fmtMin, roomLabel,
  ManualProvider, withCadenceHolds, seatTaken,
  type IvPlan, type SeqSlot,
} from './schedule'
import {
  interviews, ivById, ivOf, partsOf, slotsOf, _addIv, _patchIv, _setIvSlots, _patchIvPart, _pushIvEvent,
  type Interview, type IvPart, type IvSlot,
} from './iv-store'
import {
  sendGate, pickToSend, slotRows, pickResult, declineResult, isExpired, EXPIRE_PATCH,
  stamp, DECLINE, compatCount, poolFor, bulkGate,
  type DeclineCode, type SendGate, type BulkGate,
} from './iv-flow'
import { resolveWriter, writerNote, type WriterState } from './hold'
import { resolveProvider } from './google'
import { sendEmail, sendSlack, mailerStatus } from './mailer'
import { logMail } from './maillog'
import { orgName } from './core'
import { appOrigin } from './origin'
import {
  pickRequest, candConfirm, partConfirm, expiredNotice, declineAlert,
  type IvMailCtx, type Msg,
} from './iv-mail'

type R = { ok: boolean; reason?: string }
const nowIso = () => demoNow().toISOString()

/* ---- 기록 한 줄 남기기(화면 타임라인 + DB) ---- */
async function log(iid: string, b: string, p: string, s: string, who?: string) {
  const at = stamp(demoNow())
  _pushIvEvent(iid, { iid, at, b, p, s, ...(who ? { who } : {}) })
  const sb = serverClient()
  if (!sb) return
  await sb.from('interview_events').insert({ interview_id: iid, at, b, p, s, actor: who ?? null })
}

/* ---------------------------------------------------------
   메일 — 문안은 iv-mail.ts, 발송은 mailer.ts. 여기는 둘을 잇기만 한다.
   ctx 를 한 곳에서 만드는 이유: 화면 미리보기와 실제 발송이 같은 사실을
   보게 하려면 조립하는 자리가 하나여야 한다.
   --------------------------------------------------------- */
export interface IvMailBundle {
  ctx: IvMailCtx
  link: string
  deadline: string
  live: boolean       // 진짜로 나가는가(메일 키가 있는가)
  testTo?: string     // 안전장치로 덮어쓸 수신 주소 — 데모에선 전부 여기로 간다
}
const BASE = appOrigin

/** 가예약 만료 시각을 사람이 읽는 말로 — '8/14(금) 10:30' */
function deadlineLabel(iso?: string): string {
  if (!iso) return '기한 내'
  const d = new Date(iso)
  const DOW = ['일', '월', '화', '수', '목', '금', '토']
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]}) ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function mailCtx(iv: Interview): Promise<IvMailCtx> {
  const cand = cands.find(c => c.id === iv.cid)
  const pos = posById(iv.pid)
  const stage = stageById(iv.pid, iv.sid)
  const parts = partsOf(iv.id)
  const org = await orgName()
  return {
    candNm: cand?.nm ?? '후보자',
    ...(org ? { company: org } : {}),
    posTitle: pos.title,
    stageNm: stage.nm,
    stageKind: stage.kind,
    round: iv.round,
    totalMin: iv.totalMin,
    mode: iv.mode ?? stage.mode ?? '화상',
    ...(iv.loc ? { loc: iv.loc } : {}),
    seq: iv.kind === 'seq',
    who: parts.map(p => {
      const per = personById(p.uid || '')
      return {
        nm: p.nm || per?.nm || '면접관', role: p.role,
        ...(per?.tt ? { tt: per.tt } : {}),
        dur: p.dur, offMin: p.offMin,
      }
    }),
    rcNm: pos.rec,
  }
}

/** 발송 한 통. 키가 없으면 조용히 건너뛰되, 기록에는 '보낼 뻔했다'를 남긴다.
    기록은 두 군데에 남는다 — 조율 기록(면접 단위)과 연락 기록(후보자 단위).
    앞의 것은 "이 면접이 어떻게 흘러갔나", 뒤의 것은 "이 사람에게 뭐라고 했나"에 답한다. */
async function mail(
  iv: { id: string; cid: string }, to: string | undefined, m: Msg, who: string, kind: string,
): Promise<boolean> {
  const st = await mailerStatus()
  if (!st.email) {
    await log(iv.id, '메일 (미발송)', `${who} — ${m.subject} · 메일 키가 없어 보내지 않았습니다`, 'idle')
    await logMail({
      cid: iv.cid, iid: iv.id, kind, ...(to ? { to } : {}),
      subject: m.subject, body: m.text, ok: false, reason: 'not-configured',
    })
    return false
  }
  const r = await sendEmail(to, m.subject, m.text)
  await log(iv.id, r.ok ? '메일 발송' : '메일 실패',
    `${who} — ${m.subject}${r.ok ? '' : ` · ${r.reason ?? '알 수 없음'}`}`, r.ok ? 'idle' : 'esc')
  await logMail({
    cid: iv.cid, iid: iv.id, kind, ...(r.to ? { to: r.to } : {}),
    subject: m.subject, body: m.text, ok: r.ok, ...(r.reason ? { reason: r.reason } : {}),
  })
  return r.ok
}

/* =========================================================
   ① 면접 만들기 — 후보자가 인터뷰 단계에 들어오면 자리를 세운다
   ---------------------------------------------------------
   1차는 HM 혼자 60분, 2차는 두 사람을 이어서 60+60=120분(사이 휴식 없음).
   면접관은 지금 단계 설정(stage.ivs)에서 가져온다. TalentCore 요청서에서
   부서장·차상위·협업 리더가 내려오면 그 값이 이 자리를 채우게 된다.
   ========================================================= */
export async function ivEnsure(cid: string, round?: number): Promise<{ ok: boolean; id?: string; reason?: string }> {
  await hydrateData()
  const cand = cands.find(c => c.id === cid)
  if (!cand) return { ok: false, reason: 'no-candidate' }
  const stage = stageById(cand.p, cand.st)
  if (stage.kind !== 'interview') return { ok: false, reason: 'not-interview' }

  const rnd = round ?? Math.max(1, interviewStages(cand.p).findIndex(s => s.id === stage.id) + 1)
  const found = ivOf(cid, rnd)
  if (found) return { ok: true, id: found.id }

  const pol = policyFor(cand.p)
  const ivs = (stage.ivs || []).filter(Boolean)
  const seq = rnd >= 2 && ivs.length > 1
  const dur = seq ? pol.r2Min : (stage.dur || pol.r1Min)
  const roles: { role: string; src: IvPart['src'] }[] = seq
    ? [{ role: '차상위 리더', src: 'upper' }, { role: '협업 리더', src: 'collab' }]
    : [{ role: '하이어링 매니저', src: 'hm' }]

  const id = `iv_${cid}_${rnd}`
  const parts: IvPart[] = (seq ? ivs.slice(0, 2) : ivs.slice(0, 1)).map((uid, i) => {
    const per = personById(uid)
    return {
      iid: id, ord: i, uid,
      nm: per?.nm ?? '', role: roles[i]?.role ?? '면접관', src: roles[i]?.src ?? 'manual',
      ...(per?.coreLevel != null ? { level: per.coreLevel } : {}),
      offMin: i * (dur + pol.r2Gap), dur, resp: 'none' as const,
    }
  })
  if (!parts.length) return { ok: false, reason: 'no-interviewer' }

  const iv: Interview = {
    id, cid, pid: cand.p, sid: stage.id, round: rnd,
    kind: seq ? 'seq' : 'solo',
    totalMin: parts.reduce((m, p) => Math.max(m, p.offMin + p.dur), 0),
    st: 'searching', s: 'idle', why: '자리를 찾는 중입니다.',
  }
  _addIv(iv, parts)

  const sb = serverClient()
  if (sb) {
    await sb.from('interviews').insert({
      id, candidate_id: cid, position_id: cand.p, stage_id: stage.id, round: rnd,
      kind: iv.kind, total_min: iv.totalMin, st: iv.st, s: iv.s, why: iv.why,
    })
    await sb.from('interview_parts').insert(parts.map(p => ({
      interview_id: id, ord: p.ord, interviewer_id: p.uid ?? null,
      iv_nm: p.nm, iv_role: p.role, src: p.src, core_level: p.level ?? null,
      off_min: p.offMin, dur: p.dur, resp: 'none',
    })))
  }
  await log(id, `${rnd}차 면접 생성`, `${parts.map(p => p.nm).join(' → ')} · 총 ${iv.totalMin}분`, 'idle')
  return { ok: true, id }
}

/** 면접 단계에 서 있는 후보자 전원에게 면접 자리를 세운다.
    "후보자를 면접 단계로 옮기면 시스템이 알아서 줄에 세운다"가 이 기능의 출발점이라,
    공고 보드가 열릴 때 한 번 훑는다. 이미 있는 건은 건드리지 않는다. */
export async function ivEnsureAll(): Promise<{ ok: boolean; made: number }> {
  await hydrateData()
  let made = 0
  for (const c of cands) {
    if (c.ex || c.rj) continue                       // 이미 빠진 후보자
    if (stageById(c.p, c.st).kind !== 'interview') continue
    const before = interviewStages(c.p).findIndex(s => s.id === c.st) + 1
    if (ivOf(c.id, Math.max(1, before))) continue    // 이미 세워 둔 자리
    const r = await ivEnsure(c.id)
    if (r.ok) made++
  }
  return { ok: true, made }
}

/** 공고 보드가 열릴 때 도는 정리 한 번.
    ① 48시간이 지나 버린 가예약을 풀고 → ② 면접 단계에 서 있는데 자리가 없는 사람을 줄에 세운다.
    순서가 중요하다. 먼저 풀어야 '자리가 없는 사람'이 제대로 세어진다.
    쓸기는 사람이 누르는 버튼이 아니다 — 누군가 눌러 줄 때까지 면접관 캘린더가
    잡혀 있는 것이 이 기능이 막으려던 바로 그 문제이기 때문이다.
    이미 정리된 건은 만료로 걸리지 않으므로 몇 번을 다시 돌려도 같은 결과다. */
export async function ivBoardOpen(): Promise<{ ok: boolean; released: number; swept: number; made: number }> {
  const sw = await ivSweepHolds()
  const en = await ivEnsureAll()
  return { ok: true, released: sw.released, swept: sw.swept.length, made: en.made }
}

/** 보드에서 고른 후보자 카드들 → 함께 보낼 수 있는 면접 건들.

    보드는 '후보자'를 고르지만 벌크가 다루는 단위는 '면접 1건'이다. 그 사이를 여기서 잇는다.
    이미 자리가 정해진 사람과 면접 단계가 아닌 사람은 조용히 빼지 않고 이름을 돌려준다 —
    "5명 골랐는데 3명만 나갔다"를 화면이 말해 줄 수 있어야 하기 때문이다. */
export async function ivIdsOfCands(
  cids: string[],
): Promise<{ ids: string[]; skip: { nm: string; why: string }[] }> {
  await hydrateData()
  const ids: string[] = []
  const skip: { nm: string; why: string }[] = []
  for (const cid of cids) {
    const c = cands.find(x => x.id === cid)
    if (!c) continue
    if (c.ex || c.rj) { skip.push({ nm: c.nm, why: '전형이 끝난 후보자' }); continue }
    if (stageById(c.p, c.st).kind !== 'interview') { skip.push({ nm: c.nm, why: '면접 단계가 아님' }); continue }
    const round = Math.max(1, interviewStages(c.p).findIndex(s => s.id === c.st) + 1)
    if (!ivOf(cid, round)) await ivEnsure(cid)
    const v = ivOf(cid, round)
    if (!v) { skip.push({ nm: c.nm, why: '면접을 세우지 못함' }); continue }
    if (v.st === 'confirmed' || v.st === 'done') { skip.push({ nm: c.nm, why: '이미 자리가 정해짐' }); continue }
    if (v.st === 'canceled') { skip.push({ nm: c.nm, why: '취소된 면접' }); continue }
    ids.push(v.id)
  }
  return { ids, skip }
}

/* =========================================================
   ② 자리 찾기 — 엔진을 돌리고 "보내도 되는지"까지 함께 돌려준다
   ========================================================= */
export interface IvPlanView {
  ok: boolean
  reason?: string
  plan?: IvPlan
  gate?: SendGate
  labels?: string[]              // 사람이 읽는 슬롯 표기
  partLabels?: string[][]        // 슬롯마다 "누가 몇 시부터"
  roomLabels?: string[]          // 슬롯마다 앞뒤로 얼마나 비어 있는가(RC 확인용)
  recommend?: number[]           // 시스템이 골라 둔 자리의 번호 — 화면의 기본 체크와 서버의 기본값을 한 곳에서 정한다
  source?: 'google' | 'manual'   // 캘린더를 실제로 읽었는가
  writer?: WriterState
  writerMsg?: string
  days?: string[]                // 훑어본 영업일(주간 격자의 가로축)
  hours?: [number, number]       // 근무시간(세로축)
  busy?: { uid: string; nm: string; blocks: { date: string; start: number; end: number }[] }[]
  mail?: IvMailBundle            // 화면이 '나갈 메일'을 그대로 미리 보여 주기 위한 재료
}
export async function ivSearch(ivId: string, widen = false): Promise<IvPlanView> {
  await hydrateData()
  const iv = ivById(ivId)
  if (!iv) return { ok: false, reason: 'no-interview' }

  const pol = policyFor(iv.pid)
  // 기본 범위는 조율 정책(보내는 날부터 1주일). '범위 넓혀 다시 찾기' 를 누르면 두 배로,
  // 최대 30일까지 본다 — 자리가 0개로 나온 건은 그때만 더 멀리 나간다.
  const days = widen ? Math.min(pol.sendDays * 2, 30) : pol.sendDays
  const uids = partsOf(iv.id).map(p => p.uid).filter(Boolean) as string[]
  const { provider, source } = uids.length
    ? await resolveProvider(uids, businessDays(TODAY, days))
    : { provider: undefined, source: 'manual' as const }

  const plan = planFor(iv, provider, TODAY, days)
  const parts = partsOf(iv.id)
  const w = await resolveWriter()
  const cfg = configFor(iv.pid)
  const dates = businessDays(TODAY, days)

  // 주간 격자에 그릴 '이미 잡힌 일정'. 제목은 못 읽으므로(읽기 권한은 바쁨 여부만 준다)
  // 블록으로만 그린다 — 그래도 "이 자리가 무엇에 붙어 있는지"는 눈으로 보인다.
  // 격자에도 Cadence 자신의 가예약·확정을 얹는다. 엔진이 그 시간을 빼고 자리를 찾는데
  // 화면에는 비어 보이면, RC 는 '왜 여기는 안 되지' 하고 시스템을 의심하게 된다.
  const fb = uids.length
    ? withCadenceHolds(provider ?? ManualProvider, demoNow().toISOString(), iv.id).freeBusy(uids, dates)
    : {}
  const busy = uids.map(uid => ({
    uid, nm: personById(uid)?.nm ?? '',
    blocks: (fb[uid] || []).map(b => ({ date: b.date, start: b.start, end: b.end })),
  }))

  // 화면이 아무것도 고르지 않고 바로 보내도 같은 자리가 나가야 한다.
  // 그래서 추천 자리를 발송 로직(pickToSend)으로 그대로 계산해 번호로 넘긴다.
  const rec = pickToSend(plan.slots, pol)
  const recommend = rec.map(r => plan.slots.indexOf(r)).filter(i => i >= 0)
  const ms = await mailerStatus()

  return {
    ok: true, plan, gate: sendGate(iv, plan, pol), source,
    days: dates, hours: cfg.workHours, busy, recommend,
    mail: {
      ctx: await mailCtx(iv),
      link: `${BASE()}/pick/${iv.token || '(발송하면 링크가 생깁니다)'}`,
      // 이미 보낸 건은 그때 정해진 기한, 아직 안 보낸 건은 '지금 보내면' 기준으로 보여 준다.
      deadline: deadlineLabel(iv.holdUntil
        ?? new Date(demoNow().getTime() + pol.holdH * 3600_000).toISOString()),
      live: ms.email,
      ...(ms.testTo ? { testTo: ms.testTo } : {}),
    },
    labels: plan.slots.map(s => slotLabel(s)),
    roomLabels: plan.slots.map(s => roomLabel(s)),
    partLabels: plan.slots.map(s =>
      s.parts.map((sp, i) => `${parts[i]?.nm ?? '면접관'} ${fmtMin(sp.start)}–${fmtMin(sp.end)}`)),
    writer: w.state, writerMsg: writerNote(w.state),
  }
}

/* 한 건을 실제로 내보내는 몸통 — 단건 발송과 벌크 발송이 같은 길을 쓴다.
   여기를 둘로 나누면 언젠가 한쪽만 고쳐져서 메일과 기록이 어긋난다. */
async function commitSend(
  iv: Interview, chosen: SeqSlot[], pol: IvPolicy,
): Promise<R & { held?: number; sim?: boolean }> {
  // 가예약 만료는 '보낸 순간'부터 센다. 계획을 세운 날 자정부터 세면
  // 후보자가 메일을 받은 순간 이미 절반이 지나 있는 일이 생긴다.
  const holdUntil = new Date(demoNow().getTime() + pol.holdH * 3600_000).toISOString()

  const parts = partsOf(iv.id)
  const cand = cands.find(c => c.id === iv.cid)
  const pos = posById(iv.pid)
  const title = `[가예약] ${cand?.nm ?? '후보자'} ${iv.round}차 — ${pos.title}`

  // 가예약. 권한이 없으면 hold.ts 가 'sim:' id 를 돌려주고 캘린더는 건드리지 않는다.
  const writer = await resolveWriter()
  const rows = slotRows(iv.id, chosen, holdUntil)
  let held = 0
  for (const row of rows) {
    const ids: string[] = []
    for (const p of parts) {
      const id = p.uid
        ? await writer.hold(p.uid, row.date, row.start + p.offMin, row.start + p.offMin + p.dur, title)
        : null
      ids.push(id || '')            // parts 와 같은 순서·길이를 유지한다(빈 칸은 '')
      if (id) held++
    }
    row.holdIds = ids
  }

  const token = iv.token || randomBytes(16).toString('hex')
  const patch: Partial<Interview> = {
    st: 'proposed', s: 'idle', sentAt: nowIso(),
    holdUntil, token,
    why: `자리 ${rows.length}개를 보냈습니다 — 후보자 응답 대기.`,
  }
  _setIvSlots(iv.id, rows)
  _patchIv(iv.id, patch)

  const sb = serverClient()
  if (sb) {
    await sb.from('interview_slots').delete().eq('interview_id', iv.id).eq('st', 'offered')
    await sb.from('interview_slots').insert(rows.map(r => ({
      interview_id: r.iid, ord: r.ord, d: r.date, st_min: r.start, en_min: r.end,
      st: 'offered', buf_note: r.note ?? null,
      hold_ids: r.holdIds ?? [], hold_until: r.holdUntil ?? null,
    })))
    await sb.from('interviews').update({
      st: 'proposed', s: 'idle', sent_at: patch.sentAt,
      hold_until: patch.holdUntil, pick_token: token, why: patch.why,
    }).eq('id', iv.id)
    await sb.from('candidates').update({ s: 'idle', why: patch.why }).eq('id', iv.cid)
  }
  const real = writer.state === 'ready'
  await log(iv.id, '슬롯 발송',
    `${rows.map(r => slotLabel(r as unknown as { date: string; start: number; end: number })).join(' / ')} · ` +
    `가예약 ${held}건${real ? '' : '(캘린더 미연동 — Cadence 안에서만)'}`, 'idle')

  // 후보자에게 선택 요청. 자리를 잡아 둔 뒤에 보낸다 — 순서가 뒤바뀌면
  // 후보자가 링크를 눌렀는데 자리가 아직 없는 순간이 생긴다.
  await mail(iv, cand?.email, pickRequest(await mailCtx(iv), {
    slots: rows.map(r => slotLabel(r as unknown as { date: string; start: number; end: number })),
    link: `${BASE()}/pick/${token}`,
    deadline: deadlineLabel(holdUntil),
  }), `후보자 ${cand?.nm ?? ''}`, 'iv-pick')

  return { ok: true, held, sim: !real }
}

/* =========================================================
   ③ 보내기 — 자리를 잡아 두고(가예약) 후보자·면접관에게 함께 낸다
   ---------------------------------------------------------
   가예약은 슬롯 × 면접관 파트마다 1건씩 만든다. 2차라면 한 슬롯에
   두 사람의 서로 다른 시간대(0~60분 / 60~120분)를 각각 잡는다.
   ========================================================= */
export async function ivSend(
  ivId: string, picks?: number[], ack = false,
): Promise<R & { held?: number; sim?: boolean }> {
  await hydrateData()
  const iv = ivById(ivId)
  if (!iv) return { ok: false, reason: 'no-interview' }
  const pol = policyFor(iv.pid)

  // 실장급 확인은 '한 번 눌렀다'를 기록으로 남긴다 — 다음 발송 때 또 묻지 않는다.
  if (ack && !iv.seniorAck) {
    _patchIv(iv.id, { seniorAck: true })
    const sb0 = serverClient()
    if (sb0) await sb0.from('interviews').update({ senior_ack: true }).eq('id', iv.id)
  }
  const view = await ivSearch(ivId)
  if (!view.ok || !view.plan || !view.gate) return { ok: false, reason: view.reason ?? 'no-plan' }
  if (!view.gate.ok) return { ok: false, reason: view.gate.block }

  const chosen = pickToSend(view.plan.slots, pol, picks)
  if (!chosen.length) return { ok: false, reason: 'empty' }

  return commitSend(iv, chosen, pol)
}

/* =========================================================
   ④ 후보자가 하나를 고름 — 확정하고 나머지 가예약을 푼다
   ========================================================= */
export async function ivPickSlot(token: string, ord: number): Promise<R & { label?: string }> {
  await hydrateData()
  const iv = (await import('./iv-store')).interviews.find(v => v.token === token)
  if (!iv) return { ok: false, reason: 'bad-token' }
  if (iv.st === 'confirmed') return { ok: false, reason: 'already-confirmed' }

  const res = pickResult(slotsOf(iv.id), ord, nowIso())
  if (!res) return { ok: false, reason: 'no-slot' }

  const parts = partsOf(iv.id)
  const cand = cands.find(c => c.id === iv.cid)
  const pos = posById(iv.pid)
  const writer = await resolveWriter()

  // 안 고른 자리부터 푼다 — 면접관 캘린더를 하루라도 덜 잡아 두는 게 낫다.
  const releaseRow = async (row: IvSlot) => {
    const ids = row.holdIds || []
    for (let i = 0; i < ids.length; i++) {
      const uid = parts[i]?.uid
      if (uid && ids[i]) await writer.release(uid, ids[i])
    }
  }
  // 선착순 — 같은 자리를 여러 후보자에게 **일부러** 함께 냈으므로,
  // 고르는 이 순간에 남이 이미 확정했는지 한 번 더 본다.
  // 여기서 안 막으면 면접관 한 명이 같은 시각에 두 곳에 있어야 한다.
  const spans = parts.map(p => ({
    uid: p.uid,
    start: res.picked.start + p.offMin,
    end: res.picked.start + p.offMin + p.dur,
  }))
  if (seatTaken(iv.id, res.picked.date, spans)) {
    // 이 자리만 목록에서 내린다 — 후보자에게는 '방금 마감'으로 보이고,
    // 나머지 자리는 그대로 살아 있어야 다시 고를 수 있다.
    await releaseRow(res.picked)
    _setIvSlots(iv.id, slotsOf(iv.id).map(s =>
      s.ord === ord ? { ...s, st: 'dropped' as const } : s))
    const sbT = serverClient()
    if (sbT) await sbT.from('interview_slots').update({ st: 'dropped' })
      .eq('interview_id', iv.id).eq('ord', ord)
    await log(iv.id, '자리 마감',
      `${slotLabel(res.picked as unknown as { date: string; start: number; end: number })} — ` +
      '다른 일정이 먼저 확정돼 후보자 목록에서 내렸습니다.', iv.s)
    return { ok: false, reason: 'taken' }
  }

  for (const d of res.dropped) await releaseRow(d)
  // 고른 자리는 진짜 일정으로. 2차는 사람마다 자기 시간대에 하나씩.
  const title = `${cand?.nm ?? '후보자'} ${iv.round}차 면접 — ${pos.title}`
  const guests = [cand?.email].filter(Boolean) as string[]
  const evIds: (string | null)[] = []
  await releaseRow(res.picked)
  for (const p of parts) {
    if (!p.uid) { evIds.push(null); continue }
    evIds.push(await writer.book(
      p.uid, res.picked.date, res.picked.start + p.offMin, res.picked.start + p.offMin + p.dur,
      title, guests))
  }

  const label = slotLabel({ date: res.picked.date, start: res.picked.start, end: res.picked.end })
  _patchIv(iv.id, res.patch)
  _setIvSlots(iv.id, slotsOf(iv.id).map(s =>
    s.ord === ord ? { ...s, st: 'picked' as const } : s.st === 'offered' ? { ...s, st: 'dropped' as const } : s))
  parts.forEach((p, i) => { if (evIds[i]) _patchIvPart(iv.id, p.ord, { evId: evIds[i]! }) })

  const sb = serverClient()
  if (sb) {
    await sb.from('interview_slots').update({ st: 'picked' }).eq('interview_id', iv.id).eq('ord', ord)
    await sb.from('interview_slots').update({ st: 'dropped' })
      .eq('interview_id', iv.id).eq('st', 'offered').neq('ord', ord)
    await sb.from('interviews').update({
      st: 'confirmed', s: 'done', sched_date: res.picked.date,
      sched_start: res.picked.start, sched_end: res.picked.end,
      replied_at: res.patch.repliedAt, hold_until: null, why: res.patch.why,
    }).eq('id', iv.id)
    for (let i = 0; i < parts.length; i++) {
      if (evIds[i]) await sb.from('interview_parts')
        .update({ cal_event_id: evIds[i] }).eq('interview_id', iv.id).eq('ord', parts[i].ord)
    }
    // 옛 보드 화면도 같은 내용을 보게 한다.
    await sb.from('candidates').update({ s: 'done', why: `${label} 확정 (후보자 선택)`, act: null })
      .eq('id', iv.cid)
  }
  await log(iv.id, '후보자 선택', `${label} 확정 · 나머지 가예약 ${res.dropped.length}건 해제`, 'done', cand?.nm)

  // 확정 안내. 후보자에게 1통, 면접관에게 각자 자기 구간으로 1통씩.
  // 이어서 보는 2차는 사람마다 시작 시각이 다르므로 한 통으로 묶으면 안 된다.
  const ctx = await mailCtx(iv)
  await mail(iv, cand?.email, candConfirm(ctx, { when: label }), `후보자 ${cand?.nm ?? ''}`, 'iv-confirm')
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const myStart = res.picked.start + p.offMin
    const myWhen = slotLabel({ date: res.picked.date, start: myStart, end: myStart + p.dur })
    await mail(iv, personById(p.uid || '')?.email,
      partConfirm(ctx, { when: label, myWhen, ord: i, link: `${BASE()}/iv/${iv.cid}/${p.uid ?? ''}` }),
      `면접관 ${p.nm}`, 'iv-confirm-part')
  }

  return { ok: true, label }
}

/* =========================================================
   ⑤ 면접관 응답 — 동시 발송이라 거절을 반드시 받아 적는다
   ========================================================= */
export async function ivRespondPart(
  ivId: string, ord: number, resp: 'accepted' | 'declined',
  code?: DeclineCode, memo?: string,
): Promise<R & { act?: string[] }> {
  await hydrateData()
  const iv = ivById(ivId)
  if (!iv) return { ok: false, reason: 'no-interview' }
  const part = partsOf(iv.id).find(p => p.ord === ord)
  if (!part) return { ok: false, reason: 'no-part' }

  const at = nowIso()
  _patchIvPart(iv.id, ord, { resp, respAt: at, ...(code ? { code } : {}), ...(memo ? { memo } : {}) })
  const sb = serverClient()
  if (sb) {
    await sb.from('interview_parts').update({
      resp, resp_at: at, decline_code: code ?? null, decline_memo: memo ?? null,
    }).eq('interview_id', iv.id).eq('ord', ord)
  }

  if (resp === 'accepted') {
    await log(iv.id, '면접관 수락', `${part.nm} 님이 일정을 확인했습니다.`, 'idle', part.nm)
    return { ok: true }
  }
  const d = declineResult(part, code ?? 'other')
  _patchIv(iv.id, d.patch)
  if (sb) {
    await sb.from('interviews').update({ s: 'esc', why: d.patch.why }).eq('id', iv.id)
    await sb.from('candidates').update({ s: 'esc', why: d.patch.why, act: d.act }).eq('id', iv.cid)
  }
  await log(iv.id, '면접관 불가',
    `${part.nm} — ${DECLINE[code ?? 'other'].nm}${memo ? ` · ${memo}` : ''}`, 'esc', part.nm)

  // 코디네이터에게 신호를 보낸다. 화면을 안 보고 있을 때가 더 많다.
  const alert = declineAlert(await mailCtx(iv), {
    partNm: part.nm, reason: DECLINE[code ?? 'other'].nm, act: d.act,
  })
  await mail(iv, undefined, alert, `코디네이터 ${posById(iv.pid).rec}`, 'iv-decline')
  if ((await mailerStatus()).slack) await sendSlack(`${alert.subject}
${alert.text}`)

  return { ok: true, act: d.act }
}

/* =========================================================
   ⑥ 가예약 정리 — 48시간이 지난 건은 자리를 풀어 준다
   면접관 캘린더를 무한정 잡아 두는 게 조율에서 가장 미움받는 지점이다.
   ========================================================= */
export async function ivSweepHolds(): Promise<{ ok: boolean; released: number; swept: string[] }> {
  await hydrateData()
  const { interviews } = await import('./iv-store')
  const now = nowIso()
  const writer = await resolveWriter()
  const sb = serverClient()
  const swept: string[] = []
  let released = 0

  for (const iv of interviews.filter(v => isExpired(v, now))) {
    const parts = partsOf(iv.id)
    for (const s of slotsOf(iv.id).filter(x => x.st === 'offered')) {
      const ids = s.holdIds || []
      for (let i = 0; i < ids.length; i++) {
        const uid = parts[i]?.uid
        if (uid && ids[i] && await writer.release(uid, ids[i])) released++
      }
    }
    _patchIv(iv.id, EXPIRE_PATCH)
    _setIvSlots(iv.id, slotsOf(iv.id).map(s => s.st === 'offered' ? { ...s, st: 'expired' as const } : s))
    if (sb) {
      await sb.from('interview_slots').update({ st: 'expired' })
        .eq('interview_id', iv.id).eq('st', 'offered')
      await sb.from('interviews').update({
        st: 'searching', s: 'late', hold_until: null, why: EXPIRE_PATCH.why,
      }).eq('id', iv.id)
      await sb.from('candidates').update({
        s: 'late', why: EXPIRE_PATCH.why, act: ['다시 자리 찾기'],
      }).eq('id', iv.cid)
    }
    await log(iv.id, '가예약 만료', '48시간 안에 응답이 없어 잡아 둔 자리를 풀었습니다.', 'late')
    // 후보자가 가장 불안한 순간이다 — 조용히 넘어가면 '떨어졌나' 하고 생각한다.
    await mail(iv, cands.find(c => c.id === iv.cid)?.email,
      expiredNotice(await mailCtx(iv)), `후보자 ${cands.find(c => c.id === iv.cid)?.nm ?? ''}`, 'iv-expired')
    swept.push(iv.id)
  }
  return { ok: true, released, swept }
}

/** 화면에서 쓰는 요약 — 지금 캘린더에 실제로 쓸 수 있는 상태인가. */
export async function ivWriterStatus(): Promise<{ state: WriterState; msg: string; real: boolean }> {
  const w = await resolveWriter()
  return { state: w.state, msg: writerNote(w.state), real: w.state === 'ready' }
}

/** 정책 기본값을 화면에서도 쓴다(설정 화면에 그대로 보여 주기 위해). */
export async function ivPolicyOf(pid: string) {
  await hydrateData()
  return { ...DEFAULT_POLICY, ...policyFor(pid) }
}

/* =========================================================
   ⑦ 벌크(선착순) — 여러 후보자에게 같은 자리를 함께 낸다
   ---------------------------------------------------------
   같은 공고·같은 단계·같은 면접관인 건들을 한 무리로 묶고, 그 무리에게
   **똑같은 자리 목록**을 낸다. 먼저 고른 사람이 가져간다.

   후보자 화면에는 남의 존재를 드러내지 않는다 — 나간 자리는 그냥 목록에 없다.
   그래서 시스템 쪽에서 지켜야 할 게 두 개다.
     ① 자리 수 < 후보자 수 이면 **보내지 않는다**. 몇 명은 반드시 실패한다는
        계산이 이미 끝난 상태라 승인받을 일이 아니다.
     ② '찾은 자리'가 아니라 '동시에 성립하는 자리'를 센다(compatCount).
        16:00 과 16:30 은 자리 두 개처럼 보이지만 하나다.
   ========================================================= */
export interface BulkGroup {
  key: string
  posTitle: string
  stageNm: string
  round: number
  ids: string[]
  cands: string[]
  gate: BulkGate
  labels: string[]        // 무리에게 함께 낼 자리
  scanned: number
  ack: string[]           // 실장(L8)+ — 발송 직전 확인이 필요한 이름
}

/* 무리 짓기 기준에 면접관까지 넣는다. 같은 공고·단계라도 면접관이 다르면
   한쪽에 맞춘 자리가 다른 쪽에는 안 맞아서, 같은 목록을 낼 수 없다. */
function bulkKey(iv: Interview): string {
  return [iv.pid, iv.sid, partsOf(iv.id).map(p => p.uid ?? '?').join(',')].join('|')
}

async function bulkPlans(ids: string[], widen = false) {
  await hydrateData()
  const seen = new Set(ids)
  const list = interviews.filter(v => seen.has(v.id) &&
    v.st !== 'confirmed' && v.st !== 'done' && v.st !== 'canceled')

  const groups = new Map<string, Interview[]>()
  for (const iv of list) {
    const k = bulkKey(iv)
    groups.set(k, [...(groups.get(k) || []), iv])
  }

  const out: {
    key: string; ivs: Interview[]; pol: IvPolicy; plan: IvPlan; pool: SeqSlot[]; seats: number
  }[] = []
  for (const [key, ivs] of groups) {
    const pol = policyFor(ivs[0].pid)
    const days = widen ? Math.min(pol.sendDays * 2, 30) : pol.sendDays
    const uids = partsOf(ivs[0].id).map(p => p.uid).filter(Boolean) as string[]
    const { provider } = uids.length
      ? await resolveProvider(uids, businessDays(TODAY, days))
      : { provider: undefined }
    // 무리 안에서는 서로의 가예약을 피하지 않는다 — 같은 자리를 함께 내는 게 목적이다.
    const plan = planFor(ivs[0], provider ?? ManualProvider, TODAY, days, ivs.map(v => v.id))
    const pool = plan.kind === 'proposed' ? poolFor(plan.slots, pol, ivs.length) : []
    const seats = plan.kind === 'proposed' ? compatCount(plan.slots, pol) : 0
    out.push({ key, ivs, pol, plan, pool, seats })
  }
  return out
}

function groupGate(
  g: { ivs: Interview[]; pol: IvPolicy; plan: IvPlan; seats: number },
): BulkGate {
  const zero = { seats: 0, want: 0, warn: [] as string[] }
  if (g.plan.kind === 'no-interviewer')
    return { ok: false, block: 'blocked', msg: '면접관이 지정되지 않았습니다.', ...zero }
  if (g.plan.kind === 'coordinator')
    return { ok: false, block: 'blocked', ...zero,
             msg: `${(g.plan.eaNames || []).join('·')} 님은 비서를 통해 잡는 분입니다 — 코디네이터가 직접 조율합니다.` }
  if (g.plan.capBlock && g.plan.capWarn.length)
    return { ok: false, block: 'blocked', ...zero,
             msg: `${g.plan.capWarn.join('·')} 님이 주간 상한(${g.pol.weekCap}건)을 넘습니다.` }

  const gate = bulkGate(g.ivs.length, g.seats)
  if (g.plan.capWarn.length && !g.plan.capBlock)
    gate.warn.push(`${g.plan.capWarn.join('·')} 님은 그 주에 이미 면접이 ${g.pol.weekCap}건 잡혀 있습니다.`)
  return gate
}

/** 화면용 — 고른 후보자들을 무리로 묶고, 무리마다 보낼 수 있는지 판단해 돌려준다. */
export async function ivBulkView(ids: string[], widen = false): Promise<BulkGroup[]> {
  const gs = await bulkPlans(ids, widen)
  return gs.map(g => ({
    key: g.key,
    posTitle: posById(g.ivs[0].pid).title,
    stageNm: stageById(g.ivs[0].pid, g.ivs[0].sid).nm,
    round: g.ivs[0].round,
    ids: g.ivs.map(v => v.id),
    cands: g.ivs.map(v => cands.find(c => c.id === v.cid)?.nm ?? '(삭제된 후보자)'),
    gate: groupGate(g),
    labels: g.pool.map(s => slotLabel(s)),
    scanned: g.plan.scanned,
    ack: g.plan.seniorNames,
  }))
}

/** 실제 발송. 한 무리라도 막혀 있으면 아무것도 보내지 않는다 —
    일부만 나가면 남은 사람들 몫의 자리 계산이 그 순간 틀어진다. */
export async function ivSendBulk(
  ids: string[], ack = false, widen = false,
): Promise<R & { sent?: number; names?: string[] }> {
  const gs = await bulkPlans(ids, widen)
  if (!gs.length) return { ok: false, reason: 'empty' }

  const gates = gs.map(g => ({ g, gate: groupGate(g) }))
  const bad = gates.find(x => !x.gate.ok)
  if (bad) return { ok: false, reason: bad.gate.block ?? 'blocked' }

  // 실장급 확인은 무리 전체를 한 번에 묻는다. 사람마다 모달을 띄우면 벌크가 아니다.
  const seniors = [...new Set(gs.flatMap(g => g.plan.seniorNames))]
  const needAck = seniors.length && gs.some(g => g.ivs.some(v => !v.seniorAck))
  if (needAck && !ack) return { ok: false, reason: 'senior-ack', names: seniors }

  let sent = 0
  for (const { g } of gates) {
    for (const iv of g.ivs) {
      if (ack && !iv.seniorAck) {
        _patchIv(iv.id, { seniorAck: true })
        const sb0 = serverClient()
        if (sb0) await sb0.from('interviews').update({ senior_ack: true }).eq('id', iv.id)
      }
      const r = await commitSend(iv, g.pool, g.pol)
      if (r.ok) sent++
    }
    await Promise.all(g.ivs.map(iv => log(iv.id, '벌크 발송',
      `같은 자리 ${g.pool.length}개를 후보자 ${g.ivs.length}명에게 함께 보냈습니다 — 먼저 고른 분이 가져갑니다.`,
      'idle')))
  }
  return { ok: true, sent }
}

/* =========================================================
   ⑧ 자리가 다 나갔을 때 — 후보자가 직접 가능한 시간을 알려준다
   ---------------------------------------------------------
   선착순의 유일한 막다른 골목이 '열었더니 아무것도 없음'이다.
   여기서 후보자를 세워 두면 안 된다. 시간을 받아 적고 RC 를 부른다.
   ========================================================= */
export async function ivAskTimes(token: string, text: string): Promise<R> {
  await hydrateData()
  const iv = interviews.find(v => v.token === token)
  if (!iv) return { ok: false, reason: 'bad-token' }
  const body = (text || '').trim().slice(0, 500)
  if (!body) return { ok: false, reason: 'empty' }

  const cand = cands.find(c => c.id === iv.cid)
  const why = '후보자가 가능한 시간을 알려왔습니다 — 직접 조율이 필요합니다.'
  _patchIv(iv.id, { s: 'esc', why })
  await log(iv.id, '후보자 회신', body, 'esc', cand?.nm)

  const sb = serverClient()
  if (sb) {
    await sb.from('interviews').update({ s: 'esc', why }).eq('id', iv.id)
    await sb.from('candidates').update({ s: 'esc', why }).eq('id', iv.cid)
  }
  if ((await mailerStatus()).slack)
    await sendSlack(`[조율] ${cand?.nm ?? '후보자'} — 자리가 모두 마감돼 직접 회신했습니다.\n${body}`)
  return { ok: true }
}
