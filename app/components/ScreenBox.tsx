'use client'
/* =========================================================
   후보자 상세 · 평가 탭 — AI 1차 면접(Screen) 칸 (SC4 · SC4.5)
   Screen 이 미연결이면 한 줄만. 질문 묶음이 없으면 만들 곳으로.
   보냈으면 상태·마감, 제출됐으면 점수(채점 전이면 '채점 대기')와 리포트.
   후보자가 남긴 요청(담당자 면접·설명·삭제)은 여기서 처리한다.
   AI 가 판정하지 않는다 — 판정은 여기 Hire 에서 사람이 한다.
   ========================================================= */
import { useEffect, useRef, useState, useTransition } from 'react'
import { handleScreenRequest, sendScreen } from '../lib/screen-actions'
import type { ScreenView } from '../lib/screen-actions'
import { SCREEN_REQ_LABEL, type ScreenIv, type ScreenReq } from '../lib/screen'

const FAIL: Record<string, string> = {
  off: 'Screen 이 아직 연결되지 않았습니다.',
  unreachable: 'Screen 에 연결하지 못했습니다. 잠시 뒤 다시 불러오세요.',
  token: 'Screen 연결 열쇠가 맞지 않습니다. 관리자에게 알려 주세요.',
  error: 'Screen 이 요청을 처리하지 못했습니다.',
  closed: '이 공고의 AI 면접 질문 묶음이 마감되어 보낼 수 없습니다.',
  'opted-out': '후보자가 AI 대신 담당자 면접을 요청해서 AI 면접을 보내지 않습니다.',
  forbidden: '이 후보자에게 AI 면접을 보낼 권한이 없습니다.',
  demo: '데모에서는 할 수 없습니다.',
  'no-candidate': '후보자를 찾지 못했습니다.',
}

const md = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function state(iv: ScreenIv): { l: string; c: string } {
  if (iv.purgedAt) return { l: '기록 삭제됨', c: '' }
  if (iv.optedOutAt) return { l: '담당자 면접 요청', c: 'warn' }
  if (iv.stage === '제출완료') return iv.reviewStatus === '검토완료' ? { l: '검토 완료', c: 'ok' } : { l: '제출', c: 'ok' }
  if (iv.expired) return { l: '마감 지남', c: 'bad' }
  return iv.stage === '진행중' ? { l: '진행 중', c: 'warn' } : { l: '보냄 · 시작 전', c: '' }
}

const openReqs = (v: ScreenView | null) =>
  v && v.ok ? v.interviews.flatMap(iv => (iv.requests ?? []).filter(r => r.status === 'open')) : []

/** 판정 버튼 위 경고 — 검토 안 된 AI 면접이나 처리 안 된 후보자 요청이 있을 때만 */
export function ScreenWarn({ view }: { view: ScreenView | null }) {
  if (!view || !view.ok) return null
  const unread = view.interviews.some(iv => iv.stage === '제출완료' && !iv.purgedAt && iv.reviewStatus !== '검토완료')
  const reqs = openReqs(view)
  if (!unread && !reqs.length) return null
  const bits = [
    unread ? '제출된 AI 면접을 아직 아무도 검토하지 않았습니다' : '',
    reqs.length ? `후보자 요청 ${reqs.length}건이 처리되지 않았습니다(${[...new Set(reqs.map(r => SCREEN_REQ_LABEL[r.kind]))].join(' · ')})` : '',
  ].filter(Boolean)
  return (
    <div className="sb-warn" role="status">
      <style>{CSS}</style>
      <b>판정 전에 확인</b>
      <span>{bits.join(' · ')}. 아래 AI 1차 면접 칸에서 확인하세요.</span>
    </div>
  )
}

export default function ScreenBox({ cid, onView }: { cid: string; onView?: (v: ScreenView | null) => void }) {
  const [view, setView] = useState<ScreenView | null>(null)
  const [tick, setTick] = useState(0)
  const [msg, setMsg] = useState('')
  const [ask, setAsk] = useState<{ id: string; action: 'done' | 'delete' } | null>(null)
  const [pending, start] = useTransition()
  const busy = useRef(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/screen?cid=${encodeURIComponent(cid)}`, { cache: 'no-store' })
      .then(r => r.json() as Promise<ScreenView>)
      .then(v => { if (alive) setView(v) })
      .catch(() => { if (alive) setView({ ok: false, reason: 'unreachable' }) })
    return () => { alive = false }
  }, [cid, tick])

  useEffect(() => { onView?.(view) }, [view, onView])
  useEffect(() => { setAsk(null); setMsg('') }, [cid])

  function send() {
    start(async () => {
      let r: Awaited<ReturnType<typeof sendScreen>>
      try { r = await sendScreen(cid) } catch { r = { ok: false, reason: 'demo' } }
      if (!r.ok) setMsg(r.reason === 'no-job' ? '이 공고의 질문 묶음이 없습니다. 먼저 만드세요.' : (FAIL[r.reason ?? ''] ?? '보내지 못했습니다.'))
      else if (r.mailed) setMsg(r.reused ? '열려 있던 링크를 다시 메일로 보냈습니다.' : 'AI 면접 링크를 메일로 보냈습니다.')
      else setMsg(`링크는 만들었지만 메일은 나가지 않았습니다${r.mailReason === 'not-configured' ? '(메일 키 없음)' : ''}. 링크를 복사해 직접 전하세요.`)
      setTick(t => t + 1)
    })
  }

  function handle(id: string, action: 'done' | 'delete') {
    if (busy.current) return
    busy.current = true
    start(async () => {
      let r: Awaited<ReturnType<typeof handleScreenRequest>>
      try { r = await handleScreenRequest(cid, id, action) } catch { r = { ok: false, reason: 'demo' } }
      busy.current = false
      setAsk(null)
      setMsg(r.ok ? (action === 'delete' ? '면접 기록을 지우고 요청을 처리했습니다.' : '처리 완료로 표시했습니다.') : (FAIL[r.reason ?? ''] ?? '처리하지 못했습니다.'))
      setTick(t => t + 1)
    })
  }

  async function copy(link: string) {
    try { await navigator.clipboard.writeText(link); setMsg('링크를 복사했습니다.') }
    catch { setMsg(link) }
  }

  const head = (
    <div className="sec-h dw-sec">
      <h3>AI 1차 면접</h3>
      <div className="right">
        <button className="btn quiet" disabled={pending || !view} onClick={() => { setMsg(''); setTick(t => t + 1) }}>새로 불러오기</button>
      </div>
    </div>
  )

  if (!view) return <>{head}<div className="dw-none">불러오는 중…</div></>
  if (!view.ok) return <>{head}<div className="dw-none">{FAIL[view.reason] ?? 'Screen 요약을 불러오지 못했습니다.'}</div></>

  const cur = view.interviews[0]
  const open = cur && cur.stage !== '제출완료' && !cur.expired && !cur.purgedAt
  const optedOut = view.interviews.some(iv => iv.optedOutAt)

  const reqRow = (iv: ScreenIv, q: ScreenReq) => {
    const confirming = ask?.id === q.id
    return (
      <div className="sb-rq" key={q.id}>
        <span className={'pill ' + (q.status === 'open' ? 'warn' : '')}>{SCREEN_REQ_LABEL[q.kind] ?? '요청'}</span>
        <span className="sb-m">
          {md(q.createdAt)} 접수
          {q.status === 'done' ? ` · ${md(q.handledAt)} 처리${q.handledBy ? ` ${q.handledBy}` : ''}` : ''}
        </span>
        {q.status === 'open' ? (
          <span className="sb-go">
            {confirming ? (
              <>
                <span className="sb-ask">{ask.action === 'delete' ? '면접 기록을 지웁니다. 되돌릴 수 없습니다.' : '처리 완료로 표시합니다.'}</span>
                <button className="btn" disabled={pending} onClick={() => handle(q.id, ask.action)}>{ask.action === 'delete' ? '지우기' : '확인'}</button>
                <button className="btn quiet" disabled={pending} onClick={() => setAsk(null)}>취소</button>
              </>
            ) : (
              <>
                {q.kind !== 'delete' || iv.purgedAt ? <button className="btn quiet" disabled={pending} onClick={() => setAsk({ id: q.id, action: 'done' })}>처리 완료</button> : null}
                {!iv.purgedAt ? <button className="btn quiet" disabled={pending} onClick={() => setAsk({ id: q.id, action: 'delete' })}>기록 삭제</button> : null}
              </>
            )}
          </span>
        ) : null}
        {q.note ? <p className="sb-note-q">{q.note}</p> : null}
        {q.status === 'open' && q.kind === 'human' ? <p className="sb-hint">면접 일정을 직접 잡은 뒤 처리 완료를 누르세요.</p> : null}
        {q.status === 'open' && q.kind === 'delete' ? <p className="sb-hint">처리하지 않으면 요청일로부터 10일 뒤 자동으로 지웁니다.</p> : null}
      </div>
    )
  }

  return (
    <>
      {head}
      <style>{CSS}</style>
      {msg ? <div className="sb-msg">{msg}</div> : null}
      {!view.job ? (
        <div className="dw-none sb-row">
          <span>이 공고에 AI 면접 질문 묶음이 없습니다.</span>
          <a className="btn" href={view.createUrl} target="_blank" rel="noreferrer">Screen 에서 만들기</a>
        </div>
      ) : (
        <div className="sb-job">
          <span>질문 묶음 <b>{view.job.title}</b> · 질문 {view.job.questionCount}개{view.job.status !== '진행중' ? ' · 마감' : ''}</span>
          <a className="btn quiet" href={view.job.url} target="_blank" rel="noreferrer">Screen 에서 보기</a>
        </div>
      )}

      {view.interviews.length ? (
        <div className="sb-list">
          {view.interviews.map(iv => {
            const st = state(iv)
            const score = iv.finalScore ?? iv.aiScore
            return (
              <div className="sb-blk" key={iv.id}>
                <div className="sb-iv">
                  <span className={'pill ' + st.c}>{st.l}</span>
                  <span className="sb-m">
                    보냄 {md(iv.invitedAt)}
                    {iv.purgedAt ? ` · 삭제 ${md(iv.purgedAt)}`
                      : iv.stage === '제출완료' ? ` · 제출 ${md(iv.completedAt)}` : ` · 마감 ${md(iv.expiresAt)}`}
                    {iv.reviewer && !iv.purgedAt ? ` · 검토 ${iv.reviewer}` : ''}
                  </span>
                  {iv.stage === '제출완료' && !iv.purgedAt ? (
                    <b className="sb-score">{score != null ? `${score}점` : '채점 대기'}</b>
                  ) : null}
                  <span className="sb-go">
                    {iv.reportUrl ? <a className="btn quiet" href={iv.reportUrl} target="_blank" rel="noreferrer">리포트</a>
                      : !iv.expired && iv.link ? <button className="btn quiet" onClick={() => copy(iv.link as string)}>링크 복사</button> : null}
                  </span>
                </div>
                {(iv.requests ?? []).map(q => reqRow(iv, q))}
              </div>
            )
          })}
        </div>
      ) : null}

      {optedOut ? (
        <div className="sb-act">
          <span className="sb-note">후보자가 AI 대신 담당자 면접을 요청했습니다. 이 공고에서는 AI 면접을 다시 보내지 않습니다.</span>
        </div>
      ) : view.job && view.job.status === '진행중' && (!cur || !open || cur.stage === '링크발급') ? (
        <div className="sb-act">
          <button className="btn" disabled={pending} onClick={send}>
            {pending ? '보내는 중…' : open ? '링크 다시 보내기' : cur ? 'AI 면접 다시 보내기' : 'AI 면접 보내기'}
          </button>
          <span className="sb-note">답변은 담당자가 읽고 판단합니다. AI 가 합격·불합격을 정하지 않습니다.</span>
        </div>
      ) : null}
    </>
  )
}

const CSS = `
.sb-msg { font-size: 12px; color: var(--t2); background: var(--sunken); border-radius: var(--r-sm);
  padding: 8px 11px; margin-bottom: 8px; overflow-wrap: anywhere; }
.sb-warn { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 12.5px; color: var(--t2);
  border: 1px solid var(--late-rim); background: var(--late-bg);
  border-radius: var(--r-sm); padding: 9px 12px; margin: 0 0 12px; overflow-wrap: anywhere; }
.sb-warn b { color: var(--t1); font-weight: 650; }
.sb-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sb-row .btn { margin-left: auto; }
.sb-job { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--t3);
  margin-bottom: 6px; }
.sb-job b { color: var(--t1); font-weight: 600; }
.sb-job .btn { margin-left: auto; }
.sb-list { display: flex; flex-direction: column; gap: 1px; }
.sb-blk { border-radius: var(--r-sm); }
.sb-blk:hover { background: var(--hover); }
.sb-iv, .sb-rq { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 10px; font-size: 12.5px; }
.sb-rq { padding-top: 2px; padding-left: 22px; }
.sb-m { color: var(--t3); font-size: 11.5px; min-width: 0; }
.sb-score { font-weight: 650; font-variant-numeric: tabular-nums; }
.sb-go { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sb-ask { font-size: 11.5px; color: var(--t2); }
.sb-note-q { flex-basis: 100%; margin: 0; font-size: 12px; color: var(--t2); white-space: pre-wrap; overflow-wrap: anywhere; }
.sb-hint { flex-basis: 100%; margin: 0; font-size: 11.5px; color: var(--t4); }
.sb-act { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
.sb-note { font-size: 11.5px; color: var(--t4); min-width: 0; flex: 1 1 200px; }
`
