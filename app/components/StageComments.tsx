'use client'

/* =========================================================
   단계 판정 코멘트 (H4)
   ---------------------------------------------------------
   후보자 상세·서랍 맨 위. 이 단계에서 합격/보류/불합격 중 무엇으로 보는지와 그 이유.
   · 코멘트가 없으면 다음 단계·보류·불합격을 누를 수 없다(판정 패널이 막는다).
   · HM·리크루터가 고칠 수 있다. 고치면 새 줄이 쌓이고 이전 내용은 이력으로 남는다.
   · 대행자가 쓰면 '서민재 (최영수 대신)'으로 보인다 — 서버가 이름을 붙여 내려준다.
   ========================================================= */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveStageComment } from '../lib/actions'
import type { CommentView, CommentVerdict } from '../lib/data'

const VERDICTS: [CommentVerdict, string][] = [['pass', '합격'], ['hold', '보류'], ['fail', '불합격']]
const PILL: Record<CommentVerdict, string> = { pass: 'ok', hold: 'warn', fail: 'bad' }

const REASON: Record<string, string> = {
  'no-candidate': '후보자를 찾지 못했습니다.',
  'bad-verdict': '합격·보류·불합격 중 하나를 골라 주세요.',
  'need-comment': '코멘트를 적어야 저장됩니다.',
  'too-long': '2,000자 안으로 줄여 주세요.',
  'no-permission': '이 공고의 HM·리크루터·검토자만 쓸 수 있습니다.',
}

export default function StageComments({
  cid, actor, stageNm, cur, prior, wrap = false, closed = false,
}: {
  cid: string; actor: string; stageNm: string
  cur: CommentView[]; prior: { st: string; c: CommentView }[]
  /** 후보자 상세 페이지처럼 바깥 여백이 없는 곳이면 true */
  wrap?: boolean
  /** 종료된 전형 — 읽기만 한다 */
  closed?: boolean
}) {
  const router = useRouter()
  const last = cur[0]
  const [edit, setEdit] = useState(false)
  const [hist, setHist] = useState(false)
  const [v, setV] = useState<CommentVerdict | ''>(last?.verdict ?? '')
  const [body, setBody] = useState(last?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  const writing = !closed && (edit || !last)

  async function save() {
    if (busy || !v || !body.trim()) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await saveStageComment(cid, v, body, actor)
      if (!r.ok && r.reason !== 'not-configured' && r.reason !== 'needs-migration') {
        setErr(REASON[r.reason ?? ''] ?? `저장하지 못했습니다 (${r.reason ?? '알 수 없는 오류'})`)
        return
      }
      setMsg(r.reason === 'needs-migration'
        ? 'DB 에 코멘트 표가 아직 없어 화면에만 반영됐습니다 (마이그레이션 015 필요)'
        : '코멘트를 저장했습니다')
      setEdit(false)
      router.refresh()
    } catch {
      setErr('저장하지 못했습니다. 잠시 뒤 다시 눌러주세요.')
    } finally {
      setBusy(false)
    }
  }

  const sheet = (
    <div className="sheet sc" style={{ maxWidth: 900 }}>
      <div className="sec-h" style={{ padding: '16px 18px 0' }}>
        <h3>판정 코멘트</h3>
        <small style={{ color: 'var(--t4)' }}>{stageNm}</small>
      </div>
      <div style={{ padding: '10px 18px 16px' }}>
        {last && !writing ? (
          <div className="sc-cur">
            <div className="sc-top">
              <span className={'pill ' + PILL[last.verdict]}>{last.l}</span>
              <span className="sc-by">{last.by} · {last.at}{cur.length > 1 ? ' · 수정됨' : ''}</span>
            </div>
            <p className="sc-body">{last.body}</p>
            <div className="sc-acts">
              {!closed ? (
                <button className="btn sm" onClick={() => { setV(last.verdict); setBody(last.body); setEdit(true); setMsg('') }}>
                  고치기
                </button>
              ) : null}
              {cur.length > 1 ? (
                <button className="btn sm quiet" onClick={() => setHist(!hist)}>
                  수정 이력 {cur.length - 1}건{hist ? ' 접기' : ''}
                </button>
              ) : null}
            </div>
            {hist ? (
              <ol className="sc-hist">
                {cur.slice(1).map((h, i) => (
                  <li key={i}>
                    <span className={'pill ' + PILL[h.verdict]}>{h.l}</span>
                    <span className="sc-by">{h.by} · {h.at}</span>
                    <p className="sc-body">{h.body}</p>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}

        {!last && closed ? (
          <div style={{ fontSize: 12, color: 'var(--t4)' }}>이 단계에 남은 코멘트가 없습니다.</div>
        ) : null}

        {writing ? (
          <div className="sc-form">
            {!last ? (
              <div className="sc-need">
                아직 코멘트가 없습니다. 합격·보류·불합격 중 하나와 이유를 남겨야 전형을 넘길 수 있습니다.
              </div>
            ) : null}
            <div className="sc-vs">
              {VERDICTS.map(([k, l]) => (
                <button key={k} type="button" disabled={busy}
                  className={'chip' + (v === k ? ' on' : '')} onClick={() => setV(k)}>{l}</button>
              ))}
            </div>
            <textarea className="ta" value={body} disabled={busy} maxLength={2000}
              placeholder="판단 근거 — 무엇이 기준에 맞고 무엇이 모자랐는지. 다음 단계 면접관도 읽습니다."
              onChange={e => setBody(e.target.value)} />
            <div className="sc-acts">
              <button className="btn solid" disabled={busy || !v || !body.trim()} onClick={save}>
                {last ? '고쳐서 저장' : '코멘트 저장'}
              </button>
              {last ? (
                <button className="btn quiet" disabled={busy} onClick={() => { setEdit(false); setErr('') }}>취소</button>
              ) : null}
              <span className="sc-hint">{actor} 님 이름으로 남습니다{last ? ' · 이전 내용은 이력에 남습니다' : ''}</span>
            </div>
          </div>
        ) : null}

        {err ? <div className="sc-err">{err}</div> : msg ? <div className="sc-ok">{msg}</div> : null}

        {prior.length ? (
          <div className="sc-prior">
            <b>앞 단계</b>
            {prior.map((p, i) => (
              <div key={i} className="sc-prow">
                <span className="sc-st">{p.st}</span>
                <span className={'pill ' + PILL[p.c.verdict]}>{p.c.l}</span>
                <span className="sc-pb">{p.c.body}</span>
                <span className="sc-by">{p.c.by}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )

  return wrap ? <div className="stage" style={{ padding: '16px 26px 0' }}>{sheet}</div> : sheet
}
