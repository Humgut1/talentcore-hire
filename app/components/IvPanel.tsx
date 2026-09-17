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
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import { ivSend, ivRespondPart, ivBookRoom, ivReleaseRoom, ivSendPlace, ivSetTime } from '../lib/iv-actions'
import { pickRequest } from '../lib/iv-mail'
import type { IvPlanView, IvRoomView } from '../lib/iv-actions'
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
  const [retime, setRetime] = useState(false)                 // 확정된 면접 시간 바꾸기 펼침

  const cur = rows.find(r => r.id === sel) || null
  const plan = detail?.plan
  const gate = detail?.gate
  const slots = plan?.slots || []
  // 기본 체크는 서버가 계산해 준 추천 자리 — 아무것도 안 고르고 보내도 같은 게 나간다.
  const chosen = picks ?? detail?.recommend ?? []

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
          <span className="cq-h-sub">{cur.manual ? '직접 지정한 시간' : '후보자가 고른 시간'}</span>
          <span className="cq-spacer" />
          {cur.reply?.kind === 'attend'
            ? <span className="pill ok">후보자 참석 확인 · {cur.reply.at}</span>
            : cur.reply?.kind === 'change'
              ? <span className="pill bad">후보자 일정 변경 요청 · {cur.reply.at}</span>
              : <span className="pill">후보자 회신 대기</span>}
          <button className="btn quiet" onClick={() => setRetime(v => !v)} aria-expanded={retime}>
            <Icon id="i-clock" className="ic-sm" />{retime ? '닫기' : '시간 바꾸기'}
          </button>
          {cur.reply?.kind === 'change' && cur.reply.memo
            ? <div className="cq-reply">{cur.reply.memo}</div> : null}
        </div>
      ) : null}

      {cur.st !== 'done' && (cur.st !== 'confirmed' || retime) ? (
        <ManualTime key={'mt' + cur.id + cur.st} ivId={cur.id} totalMin={cur.totalMin}
          confirmed={cur.st === 'confirmed'}
          onDone={label => { setRetime(false); setMsg(`${label} 로 확정했습니다 — 후보자·면접관에게 확정 메일을 보냈습니다.`); router.refresh() }} />
      ) : null}

      {cur.st === 'confirmed' ? <IvRoom ivId={cur.id} key={'room' + cur.id} /> : null}

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
            <b>{gate.ack.join(' · ')} 님은 실장(L8)급 이상입니다</b>
            <p>
              실장급 이상 면접관은 보내기 전에 한 번 확인받습니다. 보내는 순간
              그분들 캘린더에 자리 {chosen.length}개가 모두 가예약으로 잡히고,
              후보자가 하나를 고를 때까지 48시간 동안 묶여 있습니다.
            </p>
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

/* =========================================================
   직접 시간 지정 — 후보자에게 고르게 하지 않고 바로 확정
   ---------------------------------------------------------
   전화로 맞춘 시간, 임원이 먼저 정한 시간처럼 사람이 이미 정한 경우.
   끝 시각은 시작을 바꾸면 면접 길이만큼 따라 움직인다(직접 고칠 수도 있다).
   같은 면접관의 다른 확정 면접과 겹치면 한 번 묻고, 그래도 진행할 수 있다.
   ========================================================= */
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

function ManualTime({ ivId, totalMin, confirmed, onDone }: {
  ivId: string; totalMin: number; confirmed: boolean; onDone: (label: string) => void
}) {
  const [date, setDate] = useState('')
  const [st, setSt] = useState('14:00')
  const [en, setEn] = useState(fmt(14 * 60 + totalMin))
  const [clash, setClash] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  const bad = !date || !st || !en || toMin(en) <= toMin(st)

  const save = (force: boolean) => start(async () => {
    setErr('')
    const r = await ivSetTime(ivId, date, toMin(st), toMin(en), force)
    if (r.ok) { setClash(''); onDone(r.label ?? ''); return }
    if (r.reason === 'clash') { setClash(r.clash ?? '면접관'); return }
    setErr(r.reason === 'bad-time' ? '날짜와 시간을 확인하세요.' : `저장하지 못했습니다 (${r.reason ?? '알 수 없음'})`)
  })

  return (
    <div className="sheet cq-box">
      <div className="cq-sec">
        {confirmed ? '시간 바꾸기' : '직접 시간 지정'}
        <span className="cq-src">{confirmed
          ? '바꾸면 후보자·면접관에게 새 확정 메일이 나가고, 후보자 참석 확인을 다시 받습니다'
          : '이미 맞춘 시간이 있으면 자리 보내기 없이 바로 확정합니다'}</span>
      </div>
      <div className="cq-mt">
        <label><span>날짜</span><input type="date" className="in sm mono" value={date} onChange={e => { setDate(e.target.value); setClash('') }} /></label>
        <label><span>시작</span><input type="time" className="in sm mono" step={600} value={st}
          onChange={e => { const v = e.target.value; setSt(v); setClash(''); if (v) setEn(fmt(Math.min(1439, toMin(v) + totalMin))) }} /></label>
        <label><span>끝</span><input type="time" className="in sm mono" step={600} value={en} onChange={e => { setEn(e.target.value); setClash('') }} /></label>
        <button className="btn solid" disabled={pending || bad} onClick={() => save(false)}>
          <Icon id="i-check-circle" className="ic-sm" />이 시간으로 확정
        </button>
      </div>
      {clash ? (
        <div className="cq-warn">
          <Icon id="i-alert" className="ic-sm" />{clash} 님이 이 시간에 다른 확정 면접이 있습니다.
          <span className="cq-spacer" />
          <button className="btn" disabled={pending} onClick={() => save(true)}>그래도 확정</button>
        </div>
      ) : null}
      {err ? <div className="cq-block"><Icon id="i-alert" className="ic-sm" />{err}</div> : null}
    </div>
  )
}

/* =========================================================
   면접실 — 확정된 면접에만 붙는다 (회의실·온보딩 V1 W5)
   ---------------------------------------------------------
   방은 TalentCore 것이다. 여기서는 추천 3개를 보여 주고 채용 담당이 눌러서 잡는다.
   자동으로 잡지 않는다. 읽기는 GET(/api/iv/rooms)이라 데모에서도 보이고,
   잡기·놓기·안내는 서버 함수라 데모에서는 막힌다.
   ========================================================= */
/** '1면접실으로'가 아니라 '1면접실로'. 받침이 없거나 ㄹ이면 '로'. */
function ro(word: string): string {
  const ch = word.trim().slice(-1)
  const code = ch.charCodeAt(0)
  const jong = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0
  return `${word}${jong === 0 || jong === 8 ? '로' : '으로'}`
}

const ROOM_FAIL: Record<string, string> = {
  'not-configured': 'TalentCore 연결 설정이 없어 면접실을 불러오지 못했습니다.',
  'unauthorized': 'TalentCore 연결 토큰이 맞지 않습니다.',
  'unreachable': 'TalentCore 에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요.',
  'bad-response': 'TalentCore 응답을 읽지 못했습니다.',
  'rejected': 'TalentCore 가 요청을 받지 않았습니다.',
  'not-confirmed': '면접 시간이 확정된 뒤에 면접실을 잡을 수 있습니다.',
  'no-interview': '면접 기록을 찾지 못했습니다.',
  'no-room': '잡은 면접실이 없어 장소 안내를 보낼 수 없습니다.',
  'taken': '그 사이 다른 예약이 먼저 들어왔습니다. 목록을 새로 불러왔습니다.',
  'demo': '데모에서는 면접실을 잡거나 놓을 수 없습니다.',
}

function IvRoom({ ivId }: { ivId: string }) {
  const router = useRouter()
  const [view, setView] = useState<IvRoomView | null>(null)
  const [tick, setTick] = useState(0)
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState('')
  const [others, setOthers] = useState(false)   // 잡은 방이 있을 때 다른 추천 펼치기
  const [busyOpen, setBusyOpen] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/iv/rooms?id=${encodeURIComponent(ivId)}`, { cache: 'no-store' })
      .then(r => r.json() as Promise<IvRoomView>)
      .then(v => { if (alive) setView(v) })
      .catch(() => { if (alive) setView({ ok: false, reason: 'unreachable', mode: '대면', people: 0 }) })
    return () => { alive = false }
  }, [ivId, tick])

  type ActR = { ok: boolean; reason?: string; detail?: string; sent?: number; total?: number }

  function act(fn: () => Promise<ActR>, okMsg: string | ((r: ActR) => string)) {
    start(async () => {
      let r: ActR
      try { r = await fn() } catch { r = { ok: false, reason: 'demo' } }
      setMsg(r.ok ? (typeof okMsg === 'function' ? okMsg(r) : okMsg)
        : r.reason === 'rejected' && r.detail ? r.detail
        : (ROOM_FAIL[r.reason ?? ''] ?? `처리하지 못했습니다 (${r.reason ?? '알 수 없음'})`))
      if (r.ok) setOthers(false)
      setTick(t => t + 1)
      router.refresh()
    })
  }

  const head = (
    <div className="cq-sec">
      면접실
      {view ? <span className="cq-src">{view.mode} · {view.people}명{view.when ? ` · ${view.when}` : ''}</span> : null}
      <span className="cq-spacer" />
      <button className="btn quiet" disabled={pending || !view} onClick={() => { setMsg(''); setTick(t => t + 1) }}>
        새로 불러오기
      </button>
    </div>
  )

  if (!view) return <div className="sheet cq-box">{head}<div className="cq-none">불러오는 중…</div></div>

  if (!view.ok || !view.recs) {
    return (
      <div className="sheet cq-box">
        {head}
        <div className="cq-none">
          {view.reason === 'rejected' && view.detail ? view.detail : (ROOM_FAIL[view.reason ?? ''] ?? '면접실을 불러오지 못했습니다.')}
        </div>
      </div>
    )
  }

  const { recs } = view
  if (!recs.configured) {
    return (
      <div className="sheet cq-box">
        {head}
        <div className="cq-none">TalentCore 에 건물·회의실이 아직 등록되지 않았습니다. 등록하면 추천이 나옵니다.</div>
      </div>
    )
  }

  const bk = recs.booked
  const hm = (s?: string) => (s ?? '').slice(11, 16)
  // 면접 시간이 바뀌면 잡아 둔 방의 시간과 어긋난다 — 같은 방이라도 다시 잡아야 한다.
  const moved = !!bk && (bk.start !== recs.start || bk.end !== recs.end)
  const widened = recs.start && view.when && !view.when.includes(`${hm(recs.start)}–${hm(recs.end)}`)
  // 지난 면접은 TalentCore 가 예약을 받지 않는다 — 누를 수 없는 버튼을 늘어놓지 않는다.
  const now = new Date()
  const nowStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  const past = !!recs.start && recs.start < nowStr
  const showRecs = !past && (!bk || others || moved)

  return (
    <div className="sheet cq-box">
      {head}
      {msg ? <div className="cq-rm-msg">{msg}</div> : null}

      {bk ? (
        <div className="cq-rm-bk">
          <span className={'pill ' + (moved ? 'warn' : 'ok')}><span className="dot" />{moved ? '시간 어긋남' : '잡음'}</span>
          <b>{recs.site.building ? recs.site.building + ' ' : ''}{bk.label}</b>
          <span className="cq-time">{hm(bk.start)}–{hm(bk.end)}</span>
          <span className="cq-spacer" />
          {view.mode === '대면' && !moved && !past ? (
            <button className="btn" disabled={pending}
              onClick={() => act(() => ivSendPlace(ivId), r =>
                r.sent ? `후보자와 면접관에게 장소 안내를 보냈습니다 (${r.sent}통).`
                  : '메일 키가 없어 한 통도 나가지 않았습니다 — 아래 조율 기록에 내용만 남았습니다.')}>
              <Icon id="i-mail" className="ic-sm" />후보자에게 장소 안내
            </button>
          ) : null}
          {!moved && !past ? (
            <button className="btn quiet" disabled={pending} onClick={() => setOthers(v => !v)}>
              {others ? '다른 방 접기' : '다른 방으로'}
            </button>
          ) : null}
          <button className="btn quiet" disabled={pending}
            onClick={() => act(() => ivReleaseRoom(ivId), '면접실 예약을 풀었습니다.')}>
            놓기
          </button>
        </div>
      ) : null}
      {past && !bk ? <div className="cq-none">지난 면접이라 면접실을 잡을 수 없습니다.</div> : null}
      {moved && !past ? <div className="cq-warn"><Icon id="i-alert" className="ic-sm" />면접 시간이 바뀌었습니다 — 아래에서 새 시간으로 다시 잡으세요.</div> : null}
      {view.mode === '화상' ? <div className="cq-note">화상 면접 — 면접관이 들어갈 방입니다. 후보자에게는 장소를 안내하지 않습니다.</div> : null}
      {widened && !past ? <div className="cq-note">회의실은 30분 단위라 {hm(recs.start)}–{hm(recs.end)} 으로 잡힙니다.</div> : null}

      {showRecs ? (
        <div className="cq-rm-list">
          {recs.rooms.map(rm => {
            const mine = !!bk && !moved && bk.room === rm.code
            return (
              <div className="cq-rm" key={rm.code}>
                <div className="cq-rm-main">
                  <b>{rm.name}</b>
                  <span className="cq-rm-meta">{rm.floor}층 · {rm.type_label} · {rm.capacity}인</span>
                  <span className="cq-rm-why">{rm.reasons.join(' · ')}</span>
                </div>
                {mine
                  ? <span className="pill ok"><span className="dot" />잡음</span>
                  : <button className="btn" disabled={pending}
                      onClick={() => act(() => ivBookRoom(ivId, rm.code), `${ro(rm.name)} 잡았습니다.`)}>
                      이 방으로 잡기
                    </button>}
              </div>
            )
          })}
          {recs.rooms.length === 0 ? <div className="cq-none">이 시간에 비어 있는 맞는 방이 없습니다.</div> : null}
        </div>
      ) : null}

      {showRecs && recs.busy.length ? (
        <>
          <button className="cq-rm-tog" onClick={() => setBusyOpen(v => !v)} aria-expanded={busyOpen}>
            사용 중 {recs.busy.length}곳 {busyOpen ? '접기' : '보기'}
          </button>
          {busyOpen ? recs.busy.map(rm => (
            <div className="cq-rm gone" key={'b' + rm.code}>
              <div className="cq-rm-main">
                <b>{rm.name}</b>
                <span className="cq-rm-meta">{rm.floor}층 · {rm.capacity}인</span>
                <span className="cq-rm-why">{rm.busy}</span>
              </div>
            </div>
          )) : null}
        </>
      ) : null}
    </div>
  )
}

const CSS = `
.cq-rm-msg { font-size: 12.5px; color: var(--t2); padding: 8px 10px; margin-bottom: 8px;
  border-radius: var(--r-sm); background: var(--sunken); }
.cq-rm-bk { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; margin-bottom: 8px; }
.cq-rm-list { display: flex; flex-direction: column; gap: 1px; margin-top: 6px; }
.cq-rm { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--r-sm); }
.cq-rm:hover { background: var(--hover); }
.cq-rm-main { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; min-width: 0; flex: 1; font-size: 12.5px; }
.cq-rm-main b { font-weight: 600; }
.cq-rm-meta { font-size: 11.5px; color: var(--t3); }
.cq-rm-why { font-size: 11px; color: var(--t4); }
.cq-rm.gone b { color: var(--t3); font-weight: 500; }
.cq-rm-tog { border: 0; background: none; font: inherit; font-size: 11.5px; color: var(--t3);
  cursor: pointer; padding: 6px 10px; margin-top: 4px; }
.cq-rm-tog:hover { color: var(--t1); }
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
.cq-fixed { padding: 13px 16px; display: flex; align-items: center; gap: 10px; font-size: 13px; flex-wrap: wrap; }
.cq-reply { flex-basis: 100%; padding: 9px 11px; border-radius: 8px; background: var(--sunken); font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; }
.cq-mt { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.cq-mt label { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--t3); }
.cq-mt .in { height: 32px; min-width: 0; }
.cq-mt label:first-child .in { width: 150px; }
.cq-mt label .in[type=time] { width: 104px; }
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
