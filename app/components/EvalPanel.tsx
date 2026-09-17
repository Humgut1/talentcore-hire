'use client'

/* =========================================================
   면접 평가 입력 (H5)
   ---------------------------------------------------------
   후보자 상세·서랍에서 이력서를 옆에 둔 채 바로 쓴다.
   · 이 단계에 배정된 면접관만 쓸 수 있다(작성자 선택).
   · 전원이 제출하기 전에는 누구의 내용도 보이지 않는다 — 이미 낸 사람을
     골라도 빈 양식이 뜨고, 다시 내면 덮어쓴다는 안내만 나온다.
     (로그인이 붙으면 작성자는 로그인한 사람으로 고정된다.)
   ========================================================= */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitEval } from '../lib/actions'
import { RATINGS, isPositive, type Rating } from '../lib/scorecard'
import type { EvalGate } from '../lib/evalgate'

export default function EvalPanel({ gate, wrap = false }: { gate: EvalGate; wrap?: boolean }) {
  const router = useRouter()
  const locked = gate.me !== undefined
  const mine = locked ? gate.roster.find(r => r.uid === gate.me) : undefined
  const firstLeft = locked ? mine : (gate.roster.find(r => !r.done) ?? gate.roster[0])
  const [uid, setUid] = useState(firstLeft?.uid ?? '')
  const [scores, setScores] = useState<Record<string, Rating>>({})
  const [overall, setOverall] = useState<Rating | null>(null)
  const [memo, setMemo] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  if (!gate.gradable || gate.closed) return null

  const who = gate.roster.find(r => r.uid === uid)
  const allRated = gate.attrs.every(a => scores[a]) && !!overall

  const clear = () => { setScores({}); setOverall(null); setMemo(''); setErr('') }

  async function send() {
    if (!who || !allRated || busy) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const items = gate.attrs.map(a => [a, scores[a]] as [string, Rating])
      const r = await submitEval(gate.cid, who.uid, items, overall as Rating, memo.trim())
      if (!r.ok && r.reason !== 'not-configured') {
        setErr(r.reason === 'not-assigned' || r.reason === 'not-you'
          ? '이 단계에 배정된 면접관 본인만 제출할 수 있습니다.'
          : '제출하지 못했습니다 (' + (r.reason ?? '알 수 없는 오류') + ')')
        return
      }
      setMsg(who.nm + ' 님 평가를 제출했습니다')
      clear(); setOpen(false)
      router.refresh()
    } catch {
      setErr('제출하지 못했습니다. 잠시 뒤 다시 눌러주세요.')
    } finally {
      setBusy(false)
    }
  }

  const rateRow = (val: Rating | null, set: (v: Rating) => void) => (
    <div className="ev-scale">
      {RATINGS.map(r => (
        <button key={r.v} type="button" disabled={busy}
          className={'ev-rate' + (val === r.v ? (isPositive(r.v) ? ' on pos' : ' on neg') : '')}
          aria-pressed={val === r.v} onClick={() => set(r.v)}>{r.l}</button>
      ))}
    </div>
  )

  const sheet = (
    <div className="sheet ev-p">
      <div className="sec-h" style={{ padding: '16px 18px 0' }}>
        <h3>면접 평가</h3>
        <small style={{ color: 'var(--t4)' }}>{gate.stageNm} · {gate.submitted}/{gate.expected} 제출</small>
      </div>
      <div style={{ padding: '10px 18px 16px' }}>
        {!gate.roster.length ? (
          <div className="ev-note">이 단계에 배정된 면접관이 없습니다. 공고 설정의 전형 단계에서 면접관을 지정해 주세요.</div>
        ) : (
          <>
            <div className="ev-roster">
              {gate.roster.map(r => (
                <span key={r.uid} className="ev-who">
                  {r.nm}
                  <span className={'pill ' + (r.done ? 'ok' : 'warn')}>{r.done ? '제출' : '미제출'}</span>
                </span>
              ))}
            </div>
            <div className="ev-note">
              {gate.sealed
                ? '모두 제출하기 전까지 평가 내용은 누구에게도 보이지 않습니다. 먼저 낸 점수에 끌려가지 않게 하기 위해서입니다.'
                : '모두 제출했습니다. 아래 평가 목록과 나란히 비교에서 내용을 볼 수 있습니다.'}
            </div>

            {locked && !mine ? (
              <div className="ev-note">
                {gate.me === null
                  ? '로그인한 계정이 Hire 면접관 명부와 연결돼 있지 않아 평가를 쓸 수 없습니다. HR Admin 에게 연결을 요청해 주세요.'
                  : '이 단계에 배정된 면접관만 평가를 쓸 수 있습니다.'}
              </div>
            ) : !open ? (
              <button className="btn solid" style={{ marginTop: 10 }} onClick={() => { setOpen(true); setMsg('') }}>
                평가 작성
              </button>
            ) : (
              <div className="ev-form">
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>작성자</label>
                  {locked && mine ? (
                    <div style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>{mine.nm}</div>
                  ) : (
                  <select className="ev-sel" value={uid} disabled={busy}
                    onChange={e => { setUid(e.target.value); clear() }}>
                    {gate.roster.map(r => (
                      <option key={r.uid} value={r.uid}>{r.nm}{r.done ? ' · 제출함' : ''}</option>
                    ))}
                  </select>
                  )}
                  {who?.done ? (
                    <div className="ev-hint">이미 제출했습니다. 다시 제출하면 이전 평가를 덮어씁니다.</div>
                  ) : null}
                </div>
                <div className="ev-hint" style={{ marginBottom: 8 }}>보통(가운데)이 없는 4단계입니다. 애매하면 이유를 메모에 적어 주세요.</div>
                {gate.attrs.map(a => (
                  <div className="ev-f" key={a}>
                    <div className="ev-k">{a}</div>
                    {rateRow(scores[a] ?? null, v => setScores(s => ({ ...s, [a]: v })))}
                  </div>
                ))}
                <div className="ev-f total">
                  <div className="ev-k">종합 의견 — 이 사람을 뽑아야 하나요?</div>
                  {rateRow(overall, setOverall)}
                </div>
                <textarea className="ta" value={memo} maxLength={500} disabled={busy}
                  placeholder="판단 근거를 한두 문장으로. 나중에 이 메모만 남습니다."
                  onChange={e => setMemo(e.target.value)} />
                <div className="ev-acts">
                  <button className="btn solid" disabled={!who || !allRated || busy} onClick={send}>
                    {busy ? '제출 중' : allRated ? '평가 제출' : '모든 항목을 골라 주세요'}
                  </button>
                  <button className="btn quiet" disabled={busy} onClick={() => { setOpen(false); clear() }}>취소</button>
                </div>
              </div>
            )}
          </>
        )}
        {err ? <div className="sc-err">{err}</div> : msg ? <div className="sc-ok">{msg}</div> : null}
      </div>
    </div>
  )

  return wrap ? <div className="stage" style={{ padding: '16px 26px 0' }}>{sheet}</div> : sheet
}
