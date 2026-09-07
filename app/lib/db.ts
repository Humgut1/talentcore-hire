/* =========================================================
   Supabase → 앱 데이터 하이드레이션
   서버 컴포넌트(페이지)가 렌더 전에 hydrateData()를 호출하면
   data.ts 의 기본 샘플값이 DB 값으로 교체된다.
   DB 미설정/오류 시에는 샘플값을 그대로 유지한다.
   ========================================================= */
import { cache } from 'react'
import { serverClient } from './supabase'
import {
  _setData, auto as staticAuto, SEED_BAND, SEED_RJ, SEED_EX, SEED_EMAIL, SEED_CANDS,
  DEFAULT_POLICY,
  type Person, type Position, type Stage, type Meeting, type Candidate,
  type AutoConfig, type EvalItem, type TrailItem, type IvPolicy,
} from './data'
import {
  _setIv, type Interview, type IvPart, type IvSlot, type IvEvent,
} from './iv-store'
import type { Offer } from './offer'
import type { RejectCode } from './decision'

/* ---- DB row → 앱 타입 매핑 ---- */
/* eslint-disable @typescript-eslint/no-explicit-any */
function mapPerson(r: any): Person {
  return {
    id: r.id, nm: r.nm, tt: r.tt, dept: r.dept,
    roles: r.roles ?? [], ea: !!r.ea, ch: r.ch, sla: r.sla, resp: r.resp,
    ...(r.ea_nm ? { eaNm: r.ea_nm } : {}),
    ...(r.email ? { email: r.email } : {}),
    /* 마이그레이션 008 전 DB 에는 이 칸들이 아예 없다 → 빠진 채로 남고,
       화면은 '전부 재직 중인 Hire 사람'으로 읽는다(지금까지와 같은 동작). */
    ...(r.emp_no ? { empNo: r.emp_no } : {}),
    ...(r.src ? { src: r.src } : {}),
    ...(r.active === false ? { active: false } : { active: true }),
    ...(r.core_role ? { coreRole: r.core_role } : {}),
    /* 마이그레이션 010 이 추가한 칸. 없으면 '고위 확인'을 띄우지 않는다(지금까지와 같음). */
    ...(r.core_level != null ? { coreLevel: r.core_level } : {}),
  }
}
function mapPosition(r: any): Position {
  /* 밴드 칸이 아직 없는 DB에서는 정적 샘플의 밴드를 그대로 쓴다.
     밴드가 0,0 이 되면 오퍼 초안이 만들어지자마자 '밴드 초과'로 보인다. */
  const band: [number, number] | undefined =
    (r.band_lo && r.band_hi) ? [r.band_lo, r.band_hi] : SEED_BAND[r.id]
  return {
    id: r.id, title: r.title, dept: r.dept, team: r.team, emp: r.emp,
    st: r.st, rec: r.rec, hm: r.hm, opened: r.opened, ttf: r.ttf, jd: r.jd,
    ...(band ? { band } : {}),
    /* 마이그레이션 007 전 DB 에는 이 칸들이 아예 없다 → 그냥 빠진 채로 남는다. */
    ...(r.req_ref ? { reqRef: r.req_ref } : {}),
    ...(r.openings ? { openings: r.openings } : {}),
    ...(r.opening_codes?.length ? { openingCodes: r.opening_codes } : {}),
  }
}
function mapStage(r: any): Stage {
  return {
    id: r.id, nm: r.nm, kind: r.kind, sla: r.sla, dur: r.dur,
    mode: r.mode, ivs: r.ivs ?? [], color: r.color, auto: !!r.auto,
    ...(r.rail ? { rail: true } : {}),
  }
}
function mapMeeting(r: any): Meeting {
  return {
    id: r.id, nm: r.nm, s: r.s, v: r.v, ag: r.ag, dur: r.dur,
    who: r.who ?? [], ...(r.act ? { act: r.act } : {}),
  }
}
function mapAuto(r: any): AutoConfig {
  return {
    window: r.win ?? 10, hours: r.hours ?? '10:00–18:00', buffer: r.buffer ?? 15,
    candSla: r.cand_sla ?? 48, ivSla: r.iv_sla ?? 24,
    remind: r.remind ?? '12h / 4h 전', tz: r.tz ?? '자동 감지',
    rules: Array.isArray(r.rules) ? r.rules : [],
    pol: mapPolicy(r),
  }
}
/* 면접 조율 정책 — 마이그레이션 010 전 DB 에는 칸이 없다.
   그때는 전부 확정 기본값으로 떨어져 지금까지와 같은 동작이 된다. */
function mapPolicy(r: any): IvPolicy {
  const d = DEFAULT_POLICY
  return {
    holdH: r.hold_h ?? d.holdH,
    weekCap: r.week_cap ?? d.weekCap,
    weekBlock: r.week_block ?? d.weekBlock,
    bufIn: r.buf_in ?? d.bufIn,
    bufOut: r.buf_out ?? d.bufOut,
    bufUnknown: r.buf_unknown ?? d.bufUnknown,
    slotMin: r.slot_min ?? d.slotMin,
    slotMax: r.slot_max ?? d.slotMax,
    sendDays: r.send_days ?? d.sendDays,
    sendMode: r.send_mode ?? d.sendMode,
    notifyCh: r.notify_ch ?? d.notifyCh,
    seniorLv: r.senior_lv ?? d.seniorLv,
    r1Min: r.r1_min ?? d.r1Min,
    r2Min: r.r2_min ?? d.r2Min,
    r2Gap: r.r2_gap ?? d.r2Gap,
  }
}
/* ---- 면접 4개 표 매핑(마이그레이션 010) ---- */
function mapIv(r: any): Interview {
  return {
    id: r.id, cid: r.candidate_id, pid: r.position_id, sid: r.stage_id,
    round: r.round, kind: r.kind, totalMin: r.total_min,
    st: r.st, s: r.s, why: r.why ?? '',
    ...(r.sched_date ? { date: r.sched_date } : {}),
    ...(r.sched_start != null ? { start: r.sched_start } : {}),
    ...(r.sched_end != null ? { end: r.sched_end } : {}),
    ...(r.mode ? { mode: r.mode } : {}),
    ...(r.loc ? { loc: r.loc } : {}),
    ...(r.sent_at ? { sentAt: r.sent_at } : {}),
    ...(r.replied_at ? { repliedAt: r.replied_at } : {}),
    ...(r.hold_until ? { holdUntil: r.hold_until } : {}),
    ...(r.senior_ack ? { seniorAck: true } : {}),
    ...(r.pick_token ? { token: r.pick_token } : {}),
    ...(r.cal_event_id ? { evId: r.cal_event_id } : {}),
  }
}
function mapIvPart(r: any): IvPart {
  return {
    iid: r.interview_id, ord: r.ord,
    ...(r.interviewer_id ? { uid: r.interviewer_id } : {}),
    nm: r.iv_nm ?? '', role: r.iv_role ?? '', src: r.src,
    ...(r.core_level != null ? { level: r.core_level } : {}),
    offMin: r.off_min ?? 0, dur: r.dur ?? 60, resp: r.resp ?? 'none',
    ...(r.resp_at ? { respAt: r.resp_at } : {}),
    ...(r.decline_code ? { code: r.decline_code } : {}),
    ...(r.decline_memo ? { memo: r.decline_memo } : {}),
    ...(r.cal_event_id ? { evId: r.cal_event_id } : {}),
  }
}
function mapIvSlot(r: any): IvSlot {
  return {
    id: r.id, iid: r.interview_id, ord: r.ord,
    date: r.d, start: r.st_min, end: r.en_min, st: r.st,
    ...(r.buf_note ? { note: r.buf_note } : {}),
    ...(r.hold_ids?.length ? { holdIds: r.hold_ids } : {}),
    ...(r.hold_until ? { holdUntil: r.hold_until } : {}),
  }
}
function mapIvEvent(r: any): IvEvent {
  return {
    id: r.id, iid: r.interview_id, at: r.at, b: r.b, p: r.p, s: r.s,
    ...(r.actor ? { who: r.actor } : {}),
  }
}
function mapCandidate(r: any): Candidate {
  /* DB에 사유가 저장돼 있으면 그게 우선, 없으면 샘플 사유로 채운다.
     단 '종료된 후보자'에만 붙인다 — 진행 중인 사람에게 사유가 달리면 안 된다. */
  const seedRj = (r.st === 's0' && !r.reject_code) ? SEED_RJ[r.id] : undefined
  return {
    id: r.id, nm: r.nm, p: r.position_id, st: r.st, s: r.s, d: r.d,
    ap: r.ap, en: r.en, why: r.why ?? '', src: r.src, yr: r.yr, role: r.role,
    ...(r.act ? { act: r.act } : {}),
    ...(r.email ? { email: r.email } : SEED_EMAIL[r.id] ? { email: SEED_EMAIL[r.id] } : {}),
    ...(r.exit_stage ? { ex: r.exit_stage } : (r.st === 's0' && SEED_EX[r.id]) ? { ex: SEED_EX[r.id] } : {}),
    ...(r.reject_code ? { rj: r.reject_code as RejectCode } : seedRj ? { rj: seedRj.rj } : {}),
    ...(r.reject_memo ? { rjMemo: r.reject_memo } : seedRj?.rjMemo ? { rjMemo: seedRj.rjMemo } : {}),
    ...(r.decided_at ? { decided: r.decided_at } : {}),
    ...(r.person_key ? { pk: r.person_key } : {}),
  }
}
/* DB 행이 언제나 이긴다. 다만 DB에 아직 넣지 않은 씨앗 지원건은 그대로 얹는다 —
   조회 자체가 실패했을 때는 undefined 를 돌려 '건드리지 않는다'(빈 배열로 덮으면
   마이그레이션 전에는 후보자가 통째로 사라진다). */
function mergeCands(err: unknown, data: any[] | null): Candidate[] | undefined {
  if (err || !data) return undefined
  const rows = data.map(mapCandidate)
  const have = new Set(rows.map(c => c.id))
  return [...rows, ...SEED_CANDS.filter(c => !have.has(c.id))]
}
function mapTrail(r: any): TrailItem {
  return { at: r.at ?? '', b: r.b ?? '', p: r.p ?? '', s: r.s ?? 'done' }
}
function mapEval(r: any): EvalItem {
  return {
    uid: r.interviewer_id, iv: r.iv, role: r.role, st: r.st,
    items: Array.isArray(r.items) ? r.items : [],
    overall: r.overall, memo: r.memo ?? '', at: r.at ?? '',
  }
}
function mapOffer(r: any): Offer {
  return {
    cid: r.candidate_id, st: r.st, level: r.level ?? '',
    base: r.base ?? 0, sign: r.sign ?? 0,
    band: [r.band_lo ?? 0, r.band_hi ?? 0],
    chain: Array.isArray(r.chain) ? r.chain : [],
    createdAt: r.created_at ?? '',
    ...(r.start_date ? { start: r.start_date } : {}),
    ...(r.opening_code ? { openingCode: r.opening_code } : {}),
    ...(r.sent_at ? { sentAt: r.sent_at } : {}),
    ...(r.resp_at ? { respAt: r.resp_at } : {}),
    ...(r.decline_code ? { declineCode: r.decline_code } : {}),
    ...(r.decline_memo ? { declineMemo: r.decline_memo } : {}),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function groupBy<T>(rows: T[], key: (r: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const r of rows) { const k = key(r); (out[k] ||= []).push(r) }
  return out
}

/**
 * DB에서 전량을 읽어 data.ts를 교체한다.
 * @returns DB에서 읽었으면 true, 미설정/오류로 샘플 유지면 false
 */
async function hydrateOnce(): Promise<boolean> {
  const sb = serverClient()
  if (!sb) return false
  try {
    const [people, positions, stages, meetings, candidates, automation, evaluations, offerRows, trailRows, availRows,
           ivRows, ivPartRows, ivSlotRows, ivEventRows] = await Promise.all([
      sb.from('people').select('*'),
      sb.from('positions').select('*').order('opened', { ascending: true }),
      sb.from('stages').select('*').order('ord', { ascending: true }),
      sb.from('meetings').select('*'),
      sb.from('candidates').select('*'),
      sb.from('automation').select('*'),
      sb.from('evaluations').select('*'),
      sb.from('offers').select('*'),
      sb.from('stage_events').select('*').order('id', { ascending: true }),
      sb.from('availability').select('*'),
      sb.from('interviews').select('*'),
      sb.from('interview_parts').select('*').order('ord', { ascending: true }),
      sb.from('interview_slots').select('*').order('ord', { ascending: true }),
      sb.from('interview_events').select('*').order('id', { ascending: true }),
    ])
    const err = people.error || positions.error || stages.error || meetings.error || candidates.error
    if (err) { console.error('[db] hydrate 오류:', err.message); return false }
    if (!positions.data?.length) return false // 아직 seed 전 → 샘플 유지

    // 각 stage row 에 position_id 를 유지한 채 매핑용으로 보관
    const stageRows = (stages.data ?? []).map(r => ({ pid: r.position_id, stage: mapStage(r) }))
    const meetingRows = (meetings.data ?? []).map(r => ({ pid: r.position_id, mtg: mapMeeting(r) }))

    _setData({
      people: (people.data ?? []).map(mapPerson),
      positions: (positions.data ?? []).map(mapPosition),
      stages: Object.fromEntries(
        Object.entries(groupBy(stageRows, r => r.pid)).map(([pid, rows]) => [pid, rows.map(r => r.stage)]),
      ),
      meetings: Object.fromEntries(
        Object.entries(groupBy(meetingRows, r => r.pid)).map(([pid, rows]) => [pid, rows.map(r => r.mtg)]),
      ),
      cands: mergeCands(candidates.error, candidates.data),
      // 자동화 설정: DB에 있는 공고만 덮고, 없으면 정적 샘플을 유지한다.
      auto: {
        ...staticAuto,
        ...Object.fromEntries((automation.data ?? []).map(r => [r.position_id, mapAuto(r)])),
      },
      /* 평가: 테이블이 있으면 DB가 유일한 출처다(비어 있으면 '평가 없음'이 맞다).
         테이블 자체가 없어 조회가 실패하면 undefined 를 넘겨 '건드리지 않는다' —
         정적 샘플로 되돌리면 마이그레이션 전에 화면에서 한 조작이 매번 지워진다. */
      evals: evaluations.error
        ? undefined
        : Object.fromEntries(
          Object.entries(groupBy(evaluations.data ?? [], r => r.candidate_id))
            .map(([cid, rows]) => [cid, rows.map(mapEval)]),
        ),
      /* 오퍼: 평가와 같은 규칙 — 테이블이 있으면 DB가 유일한 출처. */
      offers: offerRows.error
        ? undefined
        : Object.fromEntries((offerRows.data ?? []).map(r => [r.candidate_id, mapOffer(r)])),
      /* 전형 기록: 같은 규칙 — 표가 없으면 인메모리 기록을 지우지 않는다. */
      trail: trailRows.error
        ? undefined
        : Object.fromEntries(
          Object.entries(groupBy(trailRows.data ?? [], r => r.candidate_id))
            .map(([cid, rows]) => [cid, rows.map(mapTrail)]),
        ),
      /* 가용시간: 같은 규칙. 표가 없으면 방금 외부 링크에서 저장한 값을 지우지 않는다.
         표는 있는데 비어 있으면 '아직 아무도 안 냈다'가 맞으므로 정적 샘플로 덮는다. */
      avail: availRows.error
        ? undefined
        : Object.fromEntries((availRows.data ?? []).map(r => [
          r.uid,
          { wh: [r.wh_lo, r.wh_hi] as [number, number], busy: r.busy ?? [] },
        ])),
    })

    /* 면접(마이그레이션 010): 표가 있으면 DB 가 유일한 출처.
       표가 없어 조회가 실패하면 undefined 를 넘겨 인메모리 값을 건드리지 않는다. */
    _setIv({
      interviews: ivRows.error ? undefined : (ivRows.data ?? []).map(mapIv),
      parts: ivPartRows.error
        ? undefined
        : groupBy((ivPartRows.data ?? []).map(mapIvPart), r => r.iid),
      slots: ivSlotRows.error
        ? undefined
        : groupBy((ivSlotRows.data ?? []).map(mapIvSlot), r => r.iid),
      events: ivEventRows.error
        ? undefined
        : groupBy((ivEventRows.data ?? []).map(mapIvEvent), r => r.iid),
    })
    return true
  } catch (e) {
    console.error('[db] hydrate 예외:', e)
    return false
  }
}

/* 한 요청 안에서는 한 번만 읽는다.
   페이지 하나가 여러 서버 함수를 부르면 그때마다 14개 질의를 다시 던지게 되는데,
   같은 요청 안에서는 결과가 같다. React 의 cache() 로 첫 호출만 실제로 나가게 묶는다.
   (서버 액션은 각각 별개 요청이라 항상 최신을 읽는다 — 저장 직후 화면이 옛것으로
    되돌아가는 문제는 생기지 않는다.) */
export const hydrateData: () => Promise<boolean> = cache(hydrateOnce)
