'use client'
/* =========================================================
   Cadence — 면접 조율 패널 (후보자 서랍 안에서만 쓴다)
   ---------------------------------------------------------
   조율은 더 이상 따로 있는 화면이 아니다. 후보자 카드를 열면 그 안에서 끝난다.
   그래서 이 컴포넌트에는 '어느 후보자를 볼까'가 없다 — 그건 이미 정해져 있다.
   남은 일은 하나뿐: **보내기 전에 사람이 한 번 본다**를 성립시키는 것.
   그 '한 번'이 성립하려면 두 가지가 눈에 보여야 한다.
     ① 이 자리가 앞뒤 일정에 얼마나 붙어 있는가 (여유를 강제로 비우지 않기로 했으므로)
     ② 그 주에 이미 무엇이 잡혀 있는가 (그래서 주간 격자를 그린다)

   여러 후보자에게 한꺼번에 보내는 '함께 보내기'는 보드로 옮겼다 → BulkSend.tsx
   색은 상태에만 쓴다. 버튼은 무채색이고, 인디고는 '내가 고른 것'을 나타낼 때만.
   ========================================================= */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import { ivSend, ivRespondPart } from '../lib/iv-actions'
import { pickRequest } from '../lib/iv-mail'
import type { IvPlanView } from '../lib/iv-actions'
import { DECLINE_LIST } from '../lib/iv-flow'
import type { DeclineCode } from '../lib/iv-flow'
import type { CoordRow } from '../lib/iv-view'
import type { IvEvent } from '../lib/iv-store'

const ROW_H = 20            // 격자 30분 한 칸의 높이(px)

/* 같은 날 시간이 겹치는 블록은 그냥 겹쳐 그리면 서로를 덮어써서 아무것도 못 읽는다.
   달력처럼 겹치는 덩어리끼리 묶어 옆으로 나눠 준다 — lane 은 몇 번째 칸,
   span 은 그 덩어리가 몇 칸으로 쪼개졌는지. */
function lanes(items: { start: number; end: number }[]) {
  const lane: number[] = [], span: number[] = []
  const order = items.map((_, i) => i)
    .sort((a, b) => items[a].start - items[b].start || items[a].end - items[b].end)
  let group: number[] = [], ends: number[] = [], groupEnd = -1
  const close = () => { group.forEach(i => { span[i] = ends.length }); group = []; ends = []; groupEnd = -1 }
  for (const i of order) {
    if (items[i].start >= groupEnd) close()
    let L = ends.findIndex(e => e <= items[i].start)
    if (L < 0) { L = ends.length; ends.push(0) }
    ends[L] = items[i].end
    lane[i] = L; group.push(i); groupEnd = Math.max(groupEnd, items[i].end)
  }
  close()
  return items.map((_, i) => ({ lane: lane[i], span: span[i] || 1 }))
}

/* 레인 번호를 실제 좌우 위치로 — 칸 안에서 3px 씩 띄운다. */
const box = (lane: number, span: number) => ({
  left: `calc(3px + ${(lane * 100) / span}%)`,
  width: `calc(${100 / span}% - 6px)`,
})
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]})`
}

const ST_NM: Record<string, string> = {
  draft: '준비', searching: '자리 찾는 중', proposed: '응답 대기',
  confirmed: '확정', done: '완료', canceled: '취소',
}
const PILL: Record<string, string> = { idle: '', esc: 'bad', late: 'warn', done: 'ok' }
const FAIL: Record<string, string> = {
  'no-interview': '면접 기록을 찾지 못했습니다.',
  'no-interviewer': '면접관이 지정되지 않았습니다 — 공고 단계 설정에서 먼저 지정하세요.',
  'coordinator': '비서를 통해 잡는 분이 포함돼 있어 자동 발송을 막았습니다.',
  'empty': '가능한 자리를 찾지 못했습니다.',
  'week-cap': '주간 상한을 넘어 막혔습니다.',
  'senior-ack': '고위 면접관 확인이 먼저 필요합니다.',
  'no-slot': '보낼 자리를 고르지 않았습니다.',
}

export default function IvPanel({
  rows, sel, detail, log, nav,
}: {
  /* 이 후보자의 면접 회차들 — 회차 고르개를 서랍이 그리므로 여기선 현재 회차만 쓴다. */
  rows: CoordRow[]
  sel?: string
  detail: IvPlanView | null
  log: IvEvent[]
  /* 회차를 바꾸거나 범위를 넓힐 때 서랍이 주소를 바꿔 준다. */
  nav: (ivId: string, wide?: boolean) => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [picks, setPicks] = useState<number[] | null>(null)  // null = 시스템 추천 그대로
  const [ack, setAck] = useState(false)                      // 고위 면접관 확인 모달
  const [decl, setDecl] = useState<number | null>(null)       // 불가 처리 중인 면접관 ord
  const [msg, setMsg] = useState('')
  const [mailOpen, setMailOpen] = useState(false)

  const cur = rows.find(r => r.id === sel) || null
  const plan = detail?.plan
  const gate = detail?.gate
  const slots = plan?.slots || []
  // 기본 체크는 서버가 계산해 준 추천 자리 — 아무것도 안 고르고 보내도 같은 게 나간다.
  const chosen = picks ?? detail?.recommend ?? []

  const go = (id: string) => { setPicks(null); setMsg(''); nav(id) }
  const toggle = (i: number) => setPicks(() =>
    chosen.includes(i) ? chosen.filter(x => x !== i) : [...chosen, i].sort((a, b) => a - b))

  function run(fn: () => Promise<{ ok: boolean; reason?: string }>, okMsg: string) {
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? okMsg : (FAIL[r.reason ?? ''] ?? `처리하지 못했습니다 (${r.reason ?? '알 수 없음'})`))
      setPicks(null)
      router.refresh()
    })
  }
  const send = (withAck: boolean) => {
    setAck(false)
    run(() => ivSend(cur!.id, chosen, withAck), `자리 ${chosen.length}개를 보냈습니다.`)
  }

  /* ---------- 주간 격자 ----------
     세로축 = 근무시간, 가로축 = 훑어본 영업일.
     회색 = 면접관이 이미 바쁜 시간, 테두리 칸 = 찾아낸 자리(누르면 선택). */
  const grid = (() => {
    if (!detail?.days?.length || !detail.hours) return null
    const [lo, hi] = detail.hours
    const lines = Math.ceil((hi - lo) / 30)
    const top = (m: number) => ((m - lo) / 30) * ROW_H
    const busyOn = (d: string) =>
      (detail.busy || []).flatMap(b => b.blocks.filter(x => x.date === d).map(x => ({ ...x, nm: b.nm })))
    return (
      <div className="cq-grid" style={{ gridTemplateColumns: `46px repeat(${detail.days.length}, minmax(78px, 1fr))` }}>
        <div className="cq-gh" />
        {detail.days.map(d => <div className="cq-gh" key={'h' + d}>{dayLabel(d)}</div>)}
        <div className="cq-gt" style={{ height: lines * ROW_H }}>
          {Array.from({ length: lines + 1 }).map((_, i) => (lo + i * 30) % 60 === 0
            ? <span className="cq-gt-l" style={{ top: i * ROW_H - 5 }} key={i}>{fmt(lo + i * 30)}</span>
            : null)}
        </div>
        {detail.days.map(d => (
          <div className="cq-gc" style={{ height: lines * ROW_H }} key={'c' + d}>
            {Array.from({ length: lines }).map((_, i) => (
              <span className={'cq-gl' + ((lo + i * 30) % 60 === 0 ? ' hr' : '')} style={{ top: i * ROW_H }} key={i} />
            ))}
            {busyOn(d).map((b, i) => (
              <span className="cq-busy" key={'b' + i} title={`${b.nm} ${fmt(b.start)}–${fmt(b.end)}`}
                style={{ top: top(b.start), height: Math.max(9, top(b.end) - top(b.start)) }} />
            ))}
            {(() => {
              const mine = slots.map((s, i) => ({ ...s, i })).filter(s => s.date === d)
              const lay = lanes(mine)
              return mine.map((s, k) => (
                <button className={'cq-slot' + (chosen.includes(s.i) ? ' on' : '')} key={'s' + s.i}
                  onClick={() => toggle(s.i)} title={`${fmt(s.start)}–${fmt(s.end)}`}
                  style={{ top: top(s.start), height: Math.max(ROW_H, top(s.end) - top(s.start)),
                           ...box(lay[k].lane, lay[k].span) }}>
                  {fmt(s.start)}
                </button>
              ))
            })()}
            {(() => {
              const sent = (cur?.slots || []).filter(x => x.date === d)
              const lay = lanes(sent)
              return sent.map((x, k) => (
                <span className={'cq-sent' + (x.st === 'picked' ? ' fixed' : '')} key={'o' + x.ord}
                  title={`${fmt(x.start)}–${fmt(x.end)}`}
                  style={{ top: top(x.start), height: Math.max(ROW_H, top(x.end) - top(x.start)),
                           ...box(lay[k].lane, lay[k].span) }}>
                  {x.st === 'picked' ? '확정' : fmt(x.start)}
                </span>
              ))
            })()}
          </div>
        ))}
      </div>
    )
  })()

  /* ---------- 오른쪽: 상세 ---------- */
  const detailPane = !cur ? (
    <div className="cq-empty">왼쪽에서 면접을 하나 고르세요.</div>
  ) : (
    <>
      <div className="sheet cq-head">
        <div className="cq-h-row">
          <b className="cq-name">{cur.cand}</b>
          <span className="cq-h-sub">{cur.pos} · {cur.stageNm} · {cur.round}차</span>
          <span className={'pill ' + (PILL[cur.s] ?? '')}>{ST_NM[cur.st] ?? cur.st}</span>
        </div>
        <div className="cq-why">{cur.why}</div>
        <div className="cq-who">
          {cur.who.map((w, i) => (
            <span className={'cq-p' + (w.resp === '불가' ? ' bad' : w.resp === '수락' ? ' ok' : '')} key={i}>
              <b>{w.nm}</b>
              <i>{w.role}</i>
              {w.reason ? <em>{w.reason}</em> : null}
            </span>
          ))}
        </div>
        {cur.kind === 'seq'
          ? <div className="cq-note">두 사람을 이어서 봅니다 — 총 {cur.totalMin}분 연속, 사이 휴식 없음.</div>
          : <div className="cq-note">면접관 1명, {cur.totalMin}분.</div>}
      </div>

      {msg ? <div className="sheet cq-msg">{msg}</div> : null}

      {cur.st === 'confirmed' ? (
        <div className="sheet cq-fixed">
          <span className="pill ok"><span className="dot" />확정</span>
          <b>{cur.fixed}</b>
          <span className="cq-h-sub">후보자가 직접 고른 시간입니다.</span>
        </div>
      ) : null}

      {cur.st === 'proposed' ? (
        <div className="sheet cq-box">
          <div className="cq-sec">
            보낸 자리 {cur.slots.length}개
            {cur.slots.some(s => s.taken)
              ? <span className="cq-sec-x">
                  {cur.slots.filter(s => s.taken).length}개는 다른 일정이 먼저 확정돼 후보자 화면에서 내려갔습니다
                </span>
              : null}
          </div>
          <div className="cq-chips">
            {cur.slots.map(s => (
              <span className={'cq-chip' + (s.taken ? ' gone' : '')} key={s.ord}>
                {s.label}{s.taken ? ' · 마감' : ''}
              </span>
            ))}
          </div>
          <div className="cq-foot">
            <span className={'pill' + (cur.holdLeft === '만료' ? ' warn' : '')}>
              <Icon id="i-clock" className="ic-sm" />가예약 {cur.holdLeft ?? '—'}
            </span>
            {cur.token ? (
              <>
                <button className="btn quiet" onClick={() => {
                  navigator.clipboard?.writeText(location.origin + '/pick/' + cur.token)
                  setMsg('후보자 선택 링크를 복사했습니다.')
                }}><Icon id="i-copy" className="ic-sm" />후보자 링크 복사</button>
                <a className="btn quiet" href={'/pick/' + cur.token} target="_blank" rel="noreferrer">
                  <Icon id="i-link" className="ic-sm" />후보자 화면 열기
                </a>
              </>
            ) : null}
            <span className="cq-spacer" />
            {/* 수락했던 사람도 나중에 못 오게 될 수 있다 — 이미 불가로 적힌 사람만 뺀다. */}
            {cur.who.map(w => w.resp === '불가' ? null : (
              <button className="btn" key={w.ord} disabled={pending} onClick={() => setDecl(w.ord)}>
                {w.nm} 불가 처리
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {detail && cur.st !== 'confirmed' ? (
        <div className="sheet cq-box">
          <div className="cq-sec">
            찾은 자리 {slots.length}개
            <span className="cq-src">
              {detail.source === 'google' ? '구글 캘린더 실시간' : '수동 가용시간'} · {plan?.scanned ?? 0}일 훑음
            </span>
            <span className="cq-spacer" />
            <button className="btn quiet" disabled={pending}
              onClick={() => {
                setPicks(null)
                nav(cur.id, true)
              }}>
              <Icon id="i-calendar" className="ic-sm" />범위 넓혀 다시 찾기
            </button>
          </div>

          {(gate?.warn || []).map((w, i) => (
            <div className="cq-warn" key={i}><Icon id="i-alert" className="ic-sm" />{w}</div>
          ))}
          {gate && !gate.ok && gate.block !== 'senior-ack'
            ? <div className="cq-block"><Icon id="i-alert" className="ic-sm" />{gate.msg}</div> : null}

          {grid}

          <div className="cq-slots">
            {slots.map((s, i) => (
              <button className={'cq-row' + (chosen.includes(i) ? ' on' : '')} key={i} onClick={() => toggle(i)}>
                <span className="cq-check" aria-hidden>{chosen.includes(i) ? '✓' : ''}</span>
                <b>{dayLabel(s.date)}</b>
                <span className="cq-time">{fmt(s.start)}–{fmt(s.end)}</span>
                <span className="cq-room">{detail.roomLabels?.[i]}</span>
                <span className="cq-part">{detail.partLabels?.[i]?.join(' · ')}</span>
                {s.note === 'unknown' ? <em className="cq-unk">앞뒤 확인 필요</em> : null}
              </button>
            ))}
            {slots.length === 0 ? <div className="cq-none">가능한 자리가 없습니다.</div> : null}
          </div>

          {/* 나갈 메일을 보내기 전에 그대로 보여 준다 — 발송과 같은 함수(pickRequest)를
              쓰기 때문에 미리보기와 실제 메일이 어긋날 수 없다. */}
          {detail.mail && chosen.length ? (() => {
            const m = pickRequest(detail.mail.ctx, {
              slots: chosen.map(i => detail.labels?.[i] ?? ''),
              link: detail.mail.link,
              deadline: detail.mail.deadline,
            })
            return (
              <div className="cq-mail">
                <button className="cq-mail-h" onClick={() => setMailOpen(v => !v)} aria-expanded={mailOpen}>
                  <Icon id="i-mail" className="ic-sm" />
                  <b>후보자에게 나갈 메일</b>
                  <span className="cq-mail-sub">{m.subject}</span>
                  <span className="cq-spacer" />
                  <span className="cq-mail-tog">{mailOpen ? '접기' : '펼쳐 보기'}</span>
                </button>
                {mailOpen ? (
                  <>
                    <pre className="cq-mail-b">{m.text}</pre>
                    <div className="cq-mail-f">
                      {detail.mail.live
                        ? (detail.mail.testTo
                            ? `안전장치가 켜져 있어 실제 수신자 대신 ${detail.mail.testTo} 로 갑니다.`
                            : '실제 후보자 주소로 발송됩니다.')
                        : '메일 키(RESEND_API_KEY)가 없어 지금은 발송되지 않고 기록만 남습니다.'}
                    </div>
                  </>
                ) : null}
              </div>
            )
          })() : null}

          <div className="cq-foot">
            <span className="cq-h-sub">{detail.writerMsg}</span>
            <span className="cq-spacer" />
            <button className="btn solid" disabled={pending || !chosen.length}
              onClick={() => (gate?.block === 'senior-ack' ? setAck(true) : send(false))}>
              <Icon id="i-mail" className="ic-sm" />
              {cur.st === 'proposed' ? '다시 보내기' : '보내기'} ({chosen.length}개)
            </button>
          </div>
        </div>
      ) : null}

      {log.length ? (
        <div className="sheet cq-box">
          <div className="cq-sec">조율 기록</div>
          {log.map((e, i) => (
            <div className="cq-log" key={i}>
              <span className={'cq-dot ' + e.s} aria-hidden />
              <span className="cq-log-at">{e.at}</span>
              <b>{e.b}</b>
              <span className="cq-log-p">{e.p}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )

  /* 어느 쪽으로 그리든 같이 따라다니는 확인창들. */
  const modals = (
    <>
      {/* 고위 면접관 — 막는 게 아니라 한 번 묻는다 */}
      {ack && gate?.ack?.length ? (
        <div className="cq-modal" onClick={() => setAck(false)}>
          <div className="cq-dlg" onClick={e => e.stopPropagation()}>
            <b>{gate.ack.join(' · ')} 님이 포함돼 있습니다</b>
            <p>이대로 후보자와 면접관에게 자리 {chosen.length}개를 보낼까요?</p>
            <div className="cq-dlg-f">
              <button className="btn quiet" onClick={() => setAck(false)}>취소</button>
              <button className="btn solid" onClick={() => send(true)}>보내기</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 면접관 불가 — 사유마다 다음 수가 다르다 */}
      {decl != null && cur ? (
        <div className="cq-modal" onClick={() => setDecl(null)}>
          <div className="cq-dlg" onClick={e => e.stopPropagation()}>
            <b>{cur.who.find(w => w.ord === decl)?.nm} 님이 어렵다고 했습니다</b>
            <p>사유를 고르면 다음에 할 일이 카드에 붙습니다.</p>
            <div className="cq-reasons">
              {DECLINE_LIST.map(d => (
                <button className="btn" key={d.code} disabled={pending}
                  onClick={() => {
                    const ord = decl
                    const nm = cur.who.find(w => w.ord === ord)?.nm
                    setDecl(null)
                    run(() => ivRespondPart(cur.id, ord, 'declined', d.code as DeclineCode),
                      `${nm} 님 불가로 기록했습니다 — ${d.act.join(', ')}`)
                  }}>
                  {d.nm}
                  <i className="cq-act">{d.act.join(' · ')}</i>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

    </>
  )

  return (
    <>
      <div className="cq-wrap">
        <div className="cq-detail">{detailPane}</div>
      </div>
      {modals}
      <style>{CSS}</style>
    </>
  )
}

const CSS = `
.cq-wrap { display: block; }
.cq-detail { min-width: 0; }
.cq-empty { background: var(--sunken); border-radius: var(--r-xl); padding: 34px; text-align: center;
  font-size: 12.5px; color: var(--t3); }
.cq-head, .cq-box { padding: 14px 16px; }
.cq-h-row { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.cq-name { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
.cq-h-sub { font-size: 12px; color: var(--t3); }
.cq-why { font-size: 12.5px; color: var(--t2); margin-top: 6px; }
.cq-who { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.cq-p { display: inline-flex; align-items: baseline; gap: 6px; font-size: 11.5px;
  padding: 4px 10px; border-radius: 999px; background: var(--idle-bg); }
.cq-p b { font-weight: 600; color: var(--t1); }
.cq-p i, .cq-p em { font-style: normal; font-size: 10.5px; color: var(--t3); }
.cq-p.ok { background: var(--done-bg); }
.cq-p.bad { background: var(--esc-bg); }
.cq-p.bad em { color: var(--esc); font-weight: 600; }
.cq-note { margin-top: 9px; font-size: 11.5px; color: var(--t3); }
.cq-msg { padding: 11px 16px; font-size: 12.5px; color: var(--t2); }
.cq-fixed { padding: 13px 16px; display: flex; align-items: center; gap: 10px; font-size: 13px; }
.cq-sec { display: flex; align-items: center; gap: 8px; font-size: 11.5px; font-weight: 700;
  color: var(--t2); margin-bottom: 10px; }
.cq-src { font-weight: 500; color: var(--t4); }
.cq-spacer { margin-left: auto; }
.cq-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.cq-chip { font-size: 11.5px; padding: 4px 10px; border-radius: 999px;
  background: var(--idle-bg); color: var(--t2); }
.cq-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.cq-mail { margin-top: 12px; border-radius: var(--r-md); background: var(--sunken);
  box-shadow: inset 0 0 0 1px var(--line); overflow: hidden; }
.cq-mail-h { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px;
  border: 0; background: none; font: inherit; font-size: 12.5px; color: var(--t1);
  cursor: pointer; text-align: left; }
.cq-mail-h:hover { background: var(--hover); }
.cq-mail-sub { color: var(--t3); font-size: 12px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; min-width: 0; }
.cq-mail-tog { color: var(--t3); font-size: 12px; flex: none; }
.cq-mail-b { margin: 0; padding: 12px 14px; background: var(--canvas); font-size: 12px;
  line-height: 1.65; color: var(--t2); white-space: pre-wrap; word-break: break-word;
  font-family: inherit; border-top: 1px solid var(--line); max-height: 340px; overflow: auto; }
.cq-mail-f { padding: 8px 12px; font-size: 11.5px; color: var(--t3); border-top: 1px solid var(--line); }
.cq-warn, .cq-block { display: flex; align-items: flex-start; gap: 6px; font-size: 12px;
  padding: 8px 10px; border-radius: var(--r-sm); margin-bottom: 8px; }
.cq-warn  { background: var(--late-bg); color: var(--late); }
.cq-block { background: var(--esc-bg); color: var(--esc); font-weight: 600; }
.cq-grid { display: grid; margin: 6px 0 14px; overflow-x: auto; }
.cq-gh { font-size: 11px; font-weight: 600; color: var(--t3); text-align: center; padding-bottom: 6px; }
.cq-gt { position: relative; }
.cq-gt-l { position: absolute; right: 7px; font-size: 9.5px; color: var(--t4); font-variant-numeric: tabular-nums; }
.cq-gc { position: relative; border-left: 1px solid var(--line); }
.cq-gc:last-child { border-right: 1px solid var(--line); }
.cq-gl { position: absolute; left: 0; right: 0; height: 1px; background: var(--line); opacity: .5; }
.cq-gl.hr { opacity: 1; }
/* 바쁜 시간은 배경이라 항상 맨 아래(z 0), 자리는 그 위, 고른 자리는 맨 위에 그린다.
   left/width 는 겹침 레인에 따라 인라인으로 붙는다. */
.cq-busy { position: absolute; left: 2px; right: 2px; z-index: 0; border-radius: 3px; background: var(--idle-bg);
  box-shadow: inset 0 0 0 1px var(--idle-rim); }
.cq-slot { position: absolute; z-index: 1; border: 0; cursor: pointer; border-radius: 4px;
  display: grid; place-items: center; overflow: hidden; white-space: nowrap;
  font-size: 9.5px; font-weight: 600; font-variant-numeric: tabular-nums;
  color: var(--t2); background: var(--canvas);
  box-shadow: inset 0 0 0 1px var(--line-firm); font-family: inherit; padding: 0; }
.cq-slot:hover { background: var(--hover); z-index: 3; }
.cq-slot.on { background: var(--brand); color: #fff; box-shadow: none; z-index: 2; }
.cq-sent { position: absolute; z-index: 1; border-radius: 4px; font-size: 9.5px; font-weight: 600;
  display: grid; place-items: center; overflow: hidden; white-space: nowrap;
  font-variant-numeric: tabular-nums; color: var(--t2); background: var(--idle-bg);
  box-shadow: inset 0 0 0 1px var(--idle-rim); pointer-events: none; }
.cq-sent.fixed { background: var(--done-bg); color: var(--done); box-shadow: inset 0 0 0 1px var(--done-rim); }
.cq-slots { display: flex; flex-direction: column; gap: 1px; }
.cq-row { display: flex; align-items: baseline; gap: 10px; width: 100%; text-align: left; cursor: pointer;
  padding: 7px 10px; border: 0; border-radius: var(--r-sm); background: none; font: inherit; font-size: 12.5px; }
.cq-row:hover { background: var(--hover); }
.cq-row.on { background: var(--brand-soft); }
.cq-check { width: 13px; font-size: 11px; color: var(--brand-deep); }
.cq-row b { font-weight: 600; min-width: 64px; }
.cq-time { font-variant-numeric: tabular-nums; color: var(--t2); min-width: 98px; }
.cq-room { font-size: 11.5px; color: var(--t3); min-width: 138px; }
.cq-part { font-size: 11px; color: var(--t4); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cq-unk { font-style: normal; font-size: 10.5px; font-weight: 600; color: var(--late); margin-left: auto; }
.cq-none { font-size: 12.5px; color: var(--t3); padding: 10px; }
.cq-log { display: flex; align-items: baseline; gap: 8px; font-size: 12px; padding: 3px 0; }
.cq-log-at { font-size: 10.5px; color: var(--t4); font-variant-numeric: tabular-nums; min-width: 64px; }
.cq-log b { font-weight: 600; }
.cq-log-p { color: var(--t3); }
.cq-modal { position: fixed; inset: 0; background: rgba(23,23,28,.34); display: grid;
  place-items: center; z-index: 60; padding: 20px; }
.cq-dlg { background: var(--canvas); border-radius: var(--r-lg); padding: 18px 20px;
  width: min(460px, 100%); box-shadow: var(--sh-4); }
.cq-dlg b { font-size: 14px; }
.cq-dlg p { font-size: 12.5px; color: var(--t3); margin: 6px 0 14px; }
.cq-dlg-f { display: flex; justify-content: flex-end; gap: 8px; }
.cq-reasons { display: flex; flex-direction: column; gap: 6px; }
.cq-reasons .btn { justify-content: space-between; width: 100%; padding: 9px 12px; }
.cq-act { font-style: normal; font-size: 10.5px; color: var(--t4); font-weight: 500; }
.cq-sec-x { margin-left: 8px; font-weight: 400; color: var(--t3); }
.cq-chip.gone { color: var(--t4); text-decoration: line-through; text-decoration-color: var(--line-firm); }
`
