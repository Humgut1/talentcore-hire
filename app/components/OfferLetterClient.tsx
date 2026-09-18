'use client'
/* =========================================================
   오퍼레터 — 후보자가 여는 화면 (외부 링크 /offer/{token})
   ---------------------------------------------------------
   후보자가 오퍼를 받는 순간은 전형에서 가장 중요한 한 장면이다.
   메일 본문에 숫자를 적어 보내면 그 메일이 곧 약속처럼 남는데, 메일은
   고칠 수도 취소할 수도 없다. 그래서 메일은 안내장이고, 진짜 내용은
   이 화면에 둔다 — 여기서 읽고 여기서 답한다.

   겉모습은 /book · /pick 과 한 벌(BOOK_CSS). 후보자 입장에서는 같은
   회사의 같은 화면으로 보여야 한다. 색은 상태에만, 버튼은 무채색.

   거절 사유는 고정 항목으로 받는다(덧붙일 말은 따로). 무엇 때문에
   졌는지는 다음 채용을 고칠 수 있는 유일한 자산인데, 비워 둘 수 있게
   하면 아무도 채우지 않는다.
   ========================================================= */
import { useState } from 'react'
import { respondOfferByToken } from '../lib/actions'
import { DECLINE_REASONS, won, type DeclineCode } from '../lib/offer'
import { BOOK_CSS } from './BookClient'

export interface LetterData {
  /* read = 읽고 답할 수 있다 / answered = 이미 답했다
     pending = 아직 발송 전 / invalid = 주소가 틀렸거나 기한이 지났다 */
  status: 'read' | 'answered' | 'pending' | 'invalid'
  token?: string
  company?: string
  address?: string
  candName?: string
  posTitle?: string
  dept?: string
  level?: string
  base?: number
  sign?: number
  equity?: { units: number; strike: number; vestYears: number; cliffMonths: number; note: string } | null
  startLabel?: string
  orientation?: string
  greeting?: string
  benefits?: string[]
  signer?: string
  signerTitle?: string
  replyByLabel?: string
  answer?: 'accepted' | 'declined'
}

export default function OfferLetterClient({ data }: { data: LetterData }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'read' | 'decline'>('read')
  const [code, setCode] = useState<DeclineCode | ''>('')
  const [memo, setMemo] = useState('')
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null)

  const answered = done ?? (data.status === 'answered' ? data.answer ?? null : null)

  async function send(accept: boolean) {
    if (busy || !data.token) return
    if (!accept && !code) { setErr('사유를 하나 골라 주세요.'); return }
    setBusy(true); setErr('')
    const r = await respondOfferByToken(data.token, accept, accept ? undefined : code, memo)
    setBusy(false)
    if (r.ok) { setDone(accept ? 'accepted' : 'declined'); return }
    setErr(
      r.reason === 'already' ? '이미 답을 주신 오퍼입니다. 화면을 새로 고쳐 주세요.'
        : r.reason === 'bad-token' ? '주소의 기한이 지났습니다. 채용 담당자에게 문의해 주세요.'
          : r.reason === 'not-sent' ? '아직 확정되지 않은 오퍼입니다. 채용 담당자에게 문의해 주세요.'
            : '처리하지 못했습니다. 잠시 뒤 다시 눌러 주세요.',
    )
  }

  return (
    <div className="bk-root">
      <style>{BOOK_CSS}{OFFER_CSS}</style>
      <div className="bk-card of-card">
        <div className="bk-brand">
          <span className="bk-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h4l2-6 4 12 2-6h4" />
            </svg>
          </span>
          <span className="bk-wm">Cadence</span>
          <span className="bk-wm-sub">오퍼레터</span>
        </div>

        {data.status === 'invalid' ? (
          <div className="bk-body">
            <h1 className="bk-h1">열 수 없는 주소입니다</h1>
            <p className="bk-lead">주소가 잘못됐거나 기한이 지났습니다. 채용 담당자에게 문의해 주세요.</p>
          </div>
        ) : data.status === 'pending' ? (
          <div className="bk-body">
            <div className="bk-wait" aria-hidden>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
            </div>
            <h1 className="bk-h1">오퍼를 준비하고 있습니다</h1>
            <p className="bk-lead">{data.candName ? data.candName + ' 님, ' : ''}내용이 확정되면 다시 안내드리겠습니다.</p>
          </div>
        ) : (
          <div className="bk-body of-body">
            {answered && (
              <div className={answered === 'accepted' ? 'of-answer done' : 'of-answer esc'}>
                {answered === 'accepted'
                  ? '수락해 주셔서 감사합니다. 입사 절차는 담당자가 따로 안내드립니다.'
                  : '답변 감사합니다. 알려 주신 사유는 담당자에게 전달됩니다.'}
              </div>
            )}

            <h1 className="bk-h1">{data.candName} 님께</h1>
            <p className="bk-lead">{data.greeting}</p>

            <div className="of-terms">
              <div className="of-row"><span>공고</span><b>{data.posTitle}{data.dept ? ' · ' + data.dept : ''}</b></div>
              {data.level && <div className="of-row"><span>직급</span><b>{data.level}</b></div>}
              <div className="of-row"><span>기본 연봉</span><b>{won(data.base ?? 0)}</b></div>
              {!!data.sign && (
                <div className="of-row"><span>사이닝 보너스</span><b>{won(data.sign)}</b><em>입사 후 1회</em></div>
              )}
              {data.equity && (
                <div className="of-row">
                  <span>스톡옵션</span>
                  <b>{data.equity.units.toLocaleString('ko-KR')}주</b>
                  <em>
                    {data.equity.strike ? '행사가 ' + data.equity.strike.toLocaleString('ko-KR') + '원 · ' : ''}
                    {data.equity.vestYears}년 베스팅
                    {data.equity.cliffMonths ? ' · ' + data.equity.cliffMonths + '개월 클리프' : ''}
                  </em>
                </div>
              )}
              {data.startLabel && (
                <div className="of-row"><span>입사 예정일</span><b>{data.startLabel}</b>
                  {data.orientation && <em>{data.orientation}</em>}</div>
              )}
            </div>

            {data.equity?.note && <p className="of-fine">{data.equity.note}</p>}

            {!!data.benefits?.length && (
              <div className="of-sec">
                <div className="of-sec-t">복리후생</div>
                <ul className="of-list">{data.benefits.map((b, i) => <li key={i}>{b}</li>)}</ul>
              </div>
            )}

            <div className="of-sign">
              <div>{data.company}{data.signer ? ' · ' + data.signer + (data.signerTitle ? ' ' + data.signerTitle : '') : ''}</div>
              {data.address && <div className="of-addr">{data.address}</div>}
            </div>

            {!answered && (
              <div className="of-act">
                {data.replyByLabel && <p className="of-by">회신 기한 <b>{data.replyByLabel}</b></p>}
                {mode === 'read' ? (
                  <>
                    <button className="bk-cta" disabled={busy} onClick={() => send(true)}>오퍼 수락하기</button>
                    <button className="of-quiet" disabled={busy} onClick={() => { setMode('decline'); setErr('') }}>
                      정중히 거절하기
                    </button>
                  </>
                ) : (
                  <>
                    <div className="of-sec-t">어떤 점이 맞지 않았는지 알려 주세요</div>
                    <div className="of-reasons">
                      {DECLINE_REASONS.map(r => (
                        <button key={r.v} className={code === r.v ? 'of-reason on' : 'of-reason'}
                          onClick={() => { setCode(r.v); setErr('') }}>{r.l}</button>
                      ))}
                    </div>
                    <textarea className="of-memo" value={memo} maxLength={500}
                      placeholder="덧붙일 말씀이 있으면 적어 주세요 (선택)"
                      onChange={e => setMemo(e.target.value)} />
                    <button className="bk-cta" disabled={busy} onClick={() => send(false)}>거절 보내기</button>
                    <button className="of-quiet" disabled={busy} onClick={() => { setMode('read'); setErr('') }}>
                      돌아가기
                    </button>
                  </>
                )}
                {err && <p className="of-err">{err}</p>}
                <p className="bk-fine">궁금한 점은 안내 메일에 그대로 회신해 주세요.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bk-brandline">
        <span className="bk-mark-sm" aria-hidden />
        Cadence · TalentCore Hire
      </div>
    </div>
  )
}

const OFFER_CSS = `
.of-card{ max-width:560px; }
.of-body{ text-align:left; padding:28px 26px 26px; }

.of-answer{
  margin:0 0 18px; padding:11px 13px; border-radius:var(--r-md, 8px);
  font-size:12.5px; line-height:1.6;
}
.of-answer.done{ background:var(--done-bg, #f0faf5); color:var(--done, #0a9459);
  box-shadow:inset 0 0 0 1px var(--done-rim, rgba(10,148,89,.22)); }
.of-answer.esc{ background:var(--sunken, #f6f6f8); color:var(--t2, #55555f);
  box-shadow:inset 0 0 0 1px var(--line, #ececf0); }

.of-terms{
  margin-top:20px; border-radius:var(--r-lg, 10px);
  box-shadow:inset 0 0 0 1px var(--line, #ececf0); overflow:hidden;
}
.of-row{
  display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
  padding:11px 14px; border-bottom:1px solid var(--line, #ececf0);
}
.of-row:last-child{ border-bottom:0; }
.of-row > span{ width:84px; flex:none; color:var(--t3, #84848f); font-size:12px; }
.of-row > b{ font-size:13.5px; font-weight:660; letter-spacing:-.01em; }
.of-row > em{ font-style:normal; color:var(--t3, #84848f); font-size:11.5px; }

.of-fine{ margin-top:10px; color:var(--t3, #84848f); font-size:11.5px; line-height:1.6; }

.of-sec{ margin-top:22px; }
.of-sec-t{ font-size:12px; font-weight:640; color:var(--t3, #84848f); margin-bottom:8px; }
.of-list{ margin:0; padding-left:17px; color:var(--t2, #55555f); font-size:13px; line-height:1.9; }

.of-sign{
  margin-top:24px; padding-top:16px; border-top:1px solid var(--line, #ececf0);
  font-size:13px; color:var(--t1, #17171c);
}
.of-addr{ margin-top:3px; color:var(--t3, #84848f); font-size:11.5px; }

.of-act{ margin-top:24px; }
.of-by{ margin-bottom:12px; color:var(--t2, #55555f); font-size:12.5px; }
.of-quiet{
  width:100%; margin-top:8px; padding:11px 16px; border-radius:var(--r-lg, 10px);
  background:var(--canvas, #fff); color:var(--t2, #55555f); font-size:13px;
  box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
}
.of-quiet:hover:not(:disabled){ background:var(--sunken, #f6f6f8); }

.of-reasons{ display:grid; grid-template-columns:1fr 1fr; gap:7px; margin-bottom:10px; }
.of-reason{
  padding:10px 9px; border-radius:var(--r-md, 8px); font-size:12.5px; text-align:left;
  background:var(--canvas, #fff); color:var(--t1, #17171c);
  box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
}
.of-reason:hover{ background:var(--sunken, #f6f6f8); }
.of-reason.on{
  background:var(--brand-soft, #efeefc); color:var(--brand-deep, #4a43bd);
  box-shadow:inset 0 0 0 1.5px var(--brand, #5b53d6); font-weight:640;
}
.of-memo{
  width:100%; min-height:74px; resize:vertical; padding:10px 12px; margin-bottom:12px;
  border-radius:var(--r-md, 8px); background:var(--canvas, #fff); color:var(--t1, #17171c);
  font-size:13px; line-height:1.6; box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
  font-family:inherit;
}
.of-err{ margin-top:10px; color:var(--esc, #d1493f); font-size:12px; line-height:1.6; }

@media (max-width:420px){
  .of-body{ padding:22px 18px 22px; }
  .of-row > span{ width:100%; }
  .of-reasons{ grid-template-columns:1fr; }
}
`
