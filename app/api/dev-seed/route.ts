/* =========================================================
   개발 전용 — 시드 생성기 (`npm run dev` 에서만 열린다)
   ---------------------------------------------------------
   · GET /api/dev-seed            → data.ts 로 만든 seed SQL (supabase/seed.sql 로 저장)
   · GET /api/dev-seed?apply=1    → 같은 데이터를 실제 DB에 upsert
   data.ts 를 고친 뒤 seed.sql 이 어긋나지 않게 하는 용도.
   프로덕션에서는 404 — DB를 통째로 덮어쓰는 엔드포인트이기 때문.
   ========================================================= */
import { NextResponse } from 'next/server'
import { serverClient } from '../../lib/supabase'
import { people, positions, stages, meetings, cands, auto, evals, offers } from '../../lib/data'

const q = (v: unknown) =>
  v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`
const arr = (a?: string[]) =>
  !a ? 'null' : a.length ? `array[${a.map(q).join(',')}]` : `'{}'`

function sql(): string {
  const L: string[] = []
  L.push('-- =========================================================')
  L.push('-- Cadence — 초기(샘플) 데이터')
  L.push('-- schema.sql 을 먼저 실행한 뒤, 이 파일을 붙여넣고 [Run] 하세요.')
  L.push('-- 자동 생성됨 (app/api/dev-seed) — 손으로 수정하지 마세요.')
  L.push('-- =========================================================\n')
  L.push('truncate stage_events, offers, evaluations, automation, candidates, meetings, stages, positions, people restart identity cascade;\n')

  L.push('-- 사람')
  L.push('insert into people (id, nm, tt, dept, roles, ea, ch, sla, resp, ea_nm) values')
  L.push(people.map(p =>
    `  (${q(p.id)}, ${q(p.nm)}, ${q(p.tt)}, ${q(p.dept)}, ${arr(p.roles)}, ${p.ea}, ${q(p.ch)}, ${p.sla}, ${q(p.resp)}, ${q(p.eaNm ?? null)})`,
  ).join(',\n') + ';\n')

  L.push('-- 공고')
  L.push('insert into positions (id, title, dept, team, emp, st, rec, hm, opened, ttf, jd, band_lo, band_hi) values')
  L.push(positions.map(p =>
    `  (${q(p.id)}, ${q(p.title)}, ${q(p.dept)}, ${q(p.team)}, ${q(p.emp)}, ${q(p.st)}, ${q(p.rec)}, ${q(p.hm)}, ${q(p.opened)}, ${p.ttf}, ${q(p.jd)}, ${p.band?.[0] ?? 'null'}, ${p.band?.[1] ?? 'null'})`,
  ).join(',\n') + ';\n')

  for (const pid of Object.keys(stages)) {
    L.push(`-- 단계 (${pid})`)
    L.push('insert into stages (position_id, id, ord, nm, kind, sla, dur, mode, ivs, color, auto, rail) values')
    L.push(stages[pid].map((s, i) =>
      `  (${q(pid)}, ${q(s.id)}, ${i}, ${q(s.nm)}, ${q(s.kind)}, ${s.sla}, ${s.dur}, ${q(s.mode)}, ${arr(s.ivs)}, ${q(s.color)}, ${s.auto}, ${!!s.rail})`,
    ).join(',\n') + ';\n')
  }

  L.push('-- 미팅')
  L.push('insert into meetings (id, position_id, nm, s, v, ag, dur, who, act) values')
  L.push(Object.keys(meetings).flatMap(pid => meetings[pid].map(m =>
    `  (${q(m.id)}, ${q(pid)}, ${q(m.nm)}, ${q(m.s)}, ${q(m.v)}, ${q(m.ag)}, ${m.dur}, ${arr(m.who)}, ${arr(m.act)})`,
  )).join(',\n') + ';\n')

  L.push('-- 후보자')
  L.push('insert into candidates (id, position_id, nm, st, s, d, ap, en, why, src, yr, role, act,' +
    ' exit_stage, reject_code, reject_memo, decided_at) values')
  L.push(cands.map(c =>
    `  (${q(c.id)}, ${q(c.p)}, ${q(c.nm)}, ${q(c.st)}, ${q(c.s)}, ${c.d}, ${q(c.ap)}, ${q(c.en)}, ${q(c.why)}, ${q(c.src)}, ${c.yr}, ${q(c.role)}, ${arr(c.act)}, ` +
    /* 종료 사유는 종료된 사람에게만 — 진행 중인 사람에게 사유가 달리면 안 된다.
       판정일은 따로 들고 있지 않으므로 '현 단계 진입일(en)'을 종료일로 본다. */
    `${q(c.ex ?? null)}, ${q(c.rj ?? null)}, ${q(c.rjMemo ?? null)}, ${q(c.rj ? (c.decided ?? c.en) : null)})`,
  ).join(',\n') + ';\n')

  L.push('-- 자동화 설정')
  L.push('insert into automation (position_id, win, hours, buffer, cand_sla, iv_sla, remind, tz, rules) values')
  L.push(Object.keys(auto).map(pid => {
    const a = auto[pid]
    return `  (${q(pid)}, ${a.window}, ${q(a.hours)}, ${a.buffer}, ${a.candSla}, ${a.ivSla}, ${q(a.remind)}, ${q(a.tz)}, ${q(JSON.stringify(a.rules))}::jsonb)`
  }).join(',\n') + ';\n')

  L.push('-- 평가(스코어카드)')
  L.push('insert into evaluations (candidate_id, interviewer_id, iv, role, st, items, overall, memo, at) values')
  L.push(Object.keys(evals).flatMap(cid => evals[cid].map(e =>
    `  (${q(cid)}, ${q(e.uid)}, ${q(e.iv)}, ${q(e.role)}, ${q(e.st)}, ${q(JSON.stringify(e.items))}::jsonb, ${q(e.overall)}, ${q(e.memo)}, ${q(e.at)})`,
  )).join(',\n') + ';\n')

  L.push('-- 오퍼')
  L.push('insert into offers (candidate_id, st, level, base, sign, band_lo, band_hi,' +
    ' start_date, chain, created_at, sent_at, resp_at, decline_code, decline_memo) values')
  L.push(Object.keys(offers).map(cid => {
    const o = offers[cid]
    return `  (${q(cid)}, ${q(o.st)}, ${q(o.level)}, ${o.base}, ${o.sign}, ${o.band[0]}, ${o.band[1]}, ` +
      `${q(o.start ?? null)}, ${q(JSON.stringify(o.chain))}::jsonb, ${q(o.createdAt)}, ` +
      `${q(o.sentAt ?? null)}, ${q(o.respAt ?? null)}, ${q(o.declineCode ?? null)}, ${q(o.declineMemo ?? null)})`
  }).join(',\n') + ';')

  return L.join('\n') + '\n'
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('not found', { status: 404 })
  }
  const url = new URL(req.url)
  if (!url.searchParams.get('apply')) {
    return new NextResponse(sql(), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }
  const sb = serverClient()
  if (!sb) return NextResponse.json({ ok: false, reason: 'not-configured' })

  const out: Record<string, string> = {}
  const step = async (nm: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await fn()
    out[nm] = error ? `ERR ${error.message}` : 'ok'
  }
  await step('people', () => sb.from('people').upsert(people.map(p => ({
    id: p.id, nm: p.nm, tt: p.tt, dept: p.dept, roles: p.roles,
    ea: p.ea, ch: p.ch, sla: p.sla, resp: p.resp, ea_nm: p.eaNm ?? null,
  }))))
  /* band 는 [하한,상한] 배열이라 그대로 넣으면 없는 칸이 된다 → 두 칸으로 편다. */
  await step('positions', () => sb.from('positions').upsert(positions.map(({ band, ...p }) => ({
    ...p, band_lo: band?.[0] ?? null, band_hi: band?.[1] ?? null,
  }))))
  await step('stages', () => sb.from('stages').upsert(
    Object.keys(stages).flatMap(pid => stages[pid].map((s, i) => ({
      position_id: pid, id: s.id, ord: i, nm: s.nm, kind: s.kind, sla: s.sla,
      dur: s.dur, mode: s.mode, ivs: s.ivs, color: s.color, auto: s.auto, rail: !!s.rail,
    }))),
  ))
  await step('meetings', () => sb.from('meetings').upsert(
    Object.keys(meetings).flatMap(pid => meetings[pid].map(m => ({
      id: m.id, position_id: pid, nm: m.nm, s: m.s, v: m.v, ag: m.ag,
      dur: m.dur, who: m.who, act: m.act ?? null,
    }))),
  ))
  await step('candidates', () => sb.from('candidates').upsert(cands.map(c => ({
    id: c.id, position_id: c.p, nm: c.nm, st: c.st, s: c.s, d: c.d,
    ap: c.ap, en: c.en, why: c.why, src: c.src, yr: c.yr, role: c.role, act: c.act ?? null,
    exit_stage: c.ex ?? null, reject_code: c.rj ?? null, reject_memo: c.rjMemo ?? null,
    decided_at: c.rj ? (c.decided ?? c.en) : null,
  }))))
  await step('evaluations', () => sb.from('evaluations').upsert(
    Object.keys(evals).flatMap(cid => evals[cid].map(e => ({
      candidate_id: cid, interviewer_id: e.uid, iv: e.iv, role: e.role,
      st: e.st, items: e.items, overall: e.overall, memo: e.memo, at: e.at,
    }))),
  ))
  await step('offers', () => sb.from('offers').upsert(Object.keys(offers).map(cid => {
    const o = offers[cid]
    return {
      candidate_id: cid, st: o.st, level: o.level, base: o.base, sign: o.sign,
      band_lo: o.band[0], band_hi: o.band[1], start_date: o.start ?? null,
      chain: o.chain, created_at: o.createdAt, sent_at: o.sentAt ?? null,
      resp_at: o.respAt ?? null, decline_code: o.declineCode ?? null,
      decline_memo: o.declineMemo ?? null,
    }
  })))
  await step('automation', () => sb.from('automation').upsert(Object.keys(auto).map(pid => ({
    position_id: pid, win: auto[pid].window, hours: auto[pid].hours, buffer: auto[pid].buffer,
    cand_sla: auto[pid].candSla, iv_sla: auto[pid].ivSla, remind: auto[pid].remind,
    tz: auto[pid].tz, rules: auto[pid].rules,
  }))))
  return NextResponse.json({ ok: true, out })
}
