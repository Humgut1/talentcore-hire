'use client'
/* =========================================================
   후보자 상세 · AI 1차 면접 [영상 보기] (SC8)
   문항마다 질문 → 영상 → 받아 적은 글. 글의 시각을 누르면 영상이 그 자리로 간다.
   영상 주소는 Screen 이 잠깐만(15분) 열리게 만든다 — 지나면 [다시 불러오기].
   평가 기준·점수는 여기 없다(Screen 리포트에서).
   ========================================================= */
import { useEffect, useRef, useState } from 'react'
import type { ScreenAnswersView } from '../lib/screen-actions'
import type { ScreenAnswerItem } from '../lib/screen'

const FAIL: Record<string, string> = {
  off: 'Screen 이 아직 연결되지 않았습니다.',
  unreachable: 'Screen 에 연결하지 못했습니다.',
  token: 'Screen 연결 열쇠가 맞지 않습니다.',
  missing: '볼 수 있는 답변이 없습니다. 기록이 지워졌을 수 있습니다.',
  forbidden: '이 후보자의 면접을 볼 권한이 없습니다.',
}

const clock = (n: number) => {
  const s = Math.max(0, Math.round(n))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const sttNote = (it: ScreenAnswerItem) =>
  it.stt === 'done' ? '받아 적음' : it.stt === 'failed' ? '받아 적기 실패 · 영상을 직접 확인하세요' : '받아 적는 중'

function Video({ it, onExpired }: { it: ScreenAnswerItem; onExpired: () => void }) {
  const v = useRef<HTMLVideoElement>(null)
  const [now, setNow] = useState(-1)
  const segs = it.segments ?? []
  const m = it.media!
  const seek = (s: number) => {
    const el = v.current
    if (!el) return
    el.currentTime = s
    void el.play().catch(() => {})
  }
  return (
    <div className="sv-ans">
      <div className="sv-vid">
        {m.url ? (
          <video ref={v} src={m.url} controls playsInline preload="metadata"
            onTimeUpdate={e => setNow(e.currentTarget.currentTime)} onError={onExpired} />
        ) : <div className="sv-none">영상을 불러오지 못했습니다.</div>}
        <span className={'sv-m' + (it.stt === 'failed' ? ' warn' : '')}>
          영상 {clock(m.seconds)}{m.take > 1 ? ` · ${m.take}번째 녹화` : ''} · {sttNote(it)}
        </span>
      </div>
      <div className="sv-txt">
        {segs.length ? segs.map((sg, i) => {
          const on = now >= sg.s && now < (segs[i + 1]?.s ?? Infinity)
          return (
            <p key={i} className={on ? 'on' : ''}>
              <button type="button" onClick={() => seek(sg.s)} aria-label={`${clock(sg.s)} 부터 재생`}>{clock(sg.s)}</button>
              <span>{sg.t}</span>
            </p>
          )
        }) : it.text ? <p><span>{it.text}</span></p> : <p className="sv-empty">받아 적은 글이 아직 없습니다.</p>}
      </div>
    </div>
  )
}

export default function ScreenVideos({ cid, iv }: { cid: string; iv: string }) {
  const [view, setView] = useState<ScreenAnswersView | null>(null)
  const [tick, setTick] = useState(0)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    let alive = true
    setView(null)
    setExpired(false)
    fetch(`/api/screen/answers?cid=${encodeURIComponent(cid)}&iv=${encodeURIComponent(iv)}`, { cache: 'no-store' })
      .then(r => r.json() as Promise<ScreenAnswersView>)
      .then(v => { if (alive) setView(v) })
      .catch(() => { if (alive) setView({ ok: false, reason: 'unreachable' }) })
    return () => { alive = false }
  }, [cid, iv, tick])

  const shell = (body: React.ReactNode) => <div className="sv"><style>{CSS}</style>{body}</div>
  if (!view) return shell(<div className="sv-none">불러오는 중</div>)
  if (!view.ok) return shell(<div className="sv-none">{FAIL[view.reason] ?? '답변을 불러오지 못했습니다.'}</div>)

  return shell(<>
    <div className="sv-bar">
      <span>{expired ? '영상 주소가 만료되었습니다.' : `영상 주소는 ${Math.round(view.expiresInSec / 60)}분 동안 열립니다.`}</span>
      <button className="btn quiet" onClick={() => setTick(t => t + 1)}>다시 불러오기</button>
    </div>
    {view.questions.map((q, i) => {
      const answered = q.items.some(it => it.role === 'candidate')
      return (
        <section className="sv-q" key={q.id}>
          <h4><span>문항 {i + 1}</span>{q.text}</h4>
          {!answered ? <p className="sv-empty">답변이 없습니다.</p> : q.items.map(it =>
            it.role === 'ai'
              ? (it.kind === 'followUp' ? <p className="sv-fu" key={it.id}><span>후속 질문</span>{it.text}</p> : null)
              : it.media ? <Video key={it.id} it={it} onExpired={() => setExpired(true)} />
                : <p className="sv-plain" key={it.id}>{it.text}</p>
          )}
        </section>
      )
    })}
    <p className="sv-foot">판단은 사람이 합니다. AI 가 합격·불합격을 정하지 않습니다.</p>
  </>)
}

const CSS = `
.sv { border-top: 1px solid var(--line); margin: 4px 0 8px; padding-top: 10px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.sv-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11.5px; color: var(--t3); }
.sv-bar .btn { margin-left: auto; }
.sv-q { min-width: 0; }
.sv-q h4 { margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--t1); line-height: 1.5; overflow-wrap: anywhere; }
.sv-q h4 span { display: block; font-size: 11px; font-weight: 600; color: var(--t3); margin-bottom: 2px; }
.sv-ans { display: grid; grid-template-columns: minmax(0, 240px) minmax(0, 1fr); gap: 10px; margin-bottom: 10px; }
@media (max-width: 640px) { .sv-ans { grid-template-columns: minmax(0, 1fr); } }
.sv-vid { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.sv-vid video { width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: var(--r-sm); display: block; }
.sv-m { font-size: 11px; color: var(--t3); }
.sv-m.warn { color: #b45309; font-weight: 600; }
.sv-none { font-size: 12px; color: var(--t3); background: var(--sunken); border-radius: var(--r-sm); padding: 10px 12px; }
.sv-txt { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.sv-txt p { margin: 0; display: flex; gap: 8px; font-size: 12.5px; line-height: 1.6; color: var(--t1); overflow-wrap: anywhere; }
.sv-txt p.on span { font-weight: 650; }
.sv-txt button { flex: none; border: 0; background: none; padding: 0; font: inherit; font-size: 11px; color: var(--t3);
  font-variant-numeric: tabular-nums; cursor: pointer; height: fit-content; margin-top: 2px; }
.sv-txt button:hover { color: var(--t1); text-decoration: underline; }
.sv-fu { margin: 0 0 8px; font-size: 12px; color: var(--t3); overflow-wrap: anywhere; }
.sv-fu span { font-size: 11px; font-weight: 600; color: var(--t2); background: var(--sunken); border-radius: 3px; padding: 1px 5px; margin-right: 6px; }
.sv-plain { margin: 0 0 8px; font-size: 12.5px; line-height: 1.6; color: var(--t1); white-space: pre-wrap; overflow-wrap: anywhere;
  border-left: 2px solid var(--line); padding-left: 10px; }
.sv-empty { margin: 0; font-size: 12px; color: var(--t4); }
.sv-foot { margin: 0; font-size: 11.5px; color: var(--t4); }
`
