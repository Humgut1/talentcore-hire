'use client'
/* =========================================================
   외부 면접관 링크 — 면접 요청 확인 화면 (전체화면)
   ---------------------------------------------------------
   면접관은 ATS 계정 없이 링크로 들어와 두 가지 중 하나를 한다:
   · 시간 하나를 골라 확정      → 이 클릭이 제품 규칙의 "사람의 확정"
   · 모두 불가 → 사유 남기고 거절 → 조율 처리함으로 올라감
   확정 뒤에는 면접 준비 카드(후보자 맥락 + 이 단계에서 볼 것)를 보여준다.
   외부 화면이므로 파이프라인·다른 후보자·내부 사유는 노출하지 않는다.
   디자인 규칙: 색은 상태에만(확정 녹색·불가 버밀리온), 버튼 무채색,
   인디고(--brand)는 로고·선택 강조 전용.
   ========================================================= */
import { useState } from 'react'
import { ivConfirm, ivDecline, submitEval } from '../lib/actions'
import { RATINGS, type Rating } from '../lib/scorecard'
import { EXT_CSS } from '../lib/extshell'

export interface IvSlot {
  key: string; day: string; label: string
}
export interface IvEval {
  items: [string, Rating][]; overall: Rating; memo: string; at: string
}
export interface IvData {
  status: 'request' | 'confirmed' | 'declined' | 'pending' | 'invalid'
  cid?: string
  uid?: string
  ivName?: string          // 면접관 이름
  candName?: string
  candYears?: number
  candRole?: string        // 현재 이력 (직무 · 회사)
  positionTitle?: string
  team?: string
  stageName?: string
  dur?: number
  mode?: string
  slots?: IvSlot[]
  focus?: string[]         // 이 단계에서 확인할 것
  confirmedLabel?: string  // 이미 확정된 경우의 표기
  declinedReason?: string
  pendingMsg?: string
  recruiter?: string
  /* 메일이 실제로 나갈 수 있는 상태인가(Gmail 연결됨) — 연결 전에는
     "보내드렸어요"가 거짓이 되므로 문구를 사실에 맞춘다. */
  mailOn?: boolean
  /* ---- 평가지(스코어카드) ---- */
  gradable?: boolean       // 이 단계가 평가 대상인가
  attrs?: string[]         // 이 단계에서 매길 항목
  myEval?: IvEval          // 내가 이미 낸 평가(있으면 수정 가능)
  othersCount?: number     // 다른 면접관 제출 수 — '내용'은 넘기지 않는다(앵커링 방지)
}

/* 거절 사유 — 코디네이터가 다음 수를 바로 정할 수 있는 것들로 */
const REASONS = [
  '제시된 시간이 모두 어렵습니다',
  '다른 일정과 겹칩니다',
  '제 직무 영역이 아닙니다',
  '이 후보자와 이해관계가 있습니다',
]

export default function IvClient({ data }: { data: IvData }) {
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'slots' | 'decline'>('slots')
  const [reason, setReason] = useState<string>(REASONS[0])
  const [etc, setEtc] = useState('')
  const [done, setDone] = useState<'confirmed' | 'declined' | null>(null)
  const [failed, setFailed] = useState(false)

  /* ---- 평가지 상태 ----
     open = 폼이 펼쳐져 있는가 / saved = 방금 제출했는가.
     이미 제출한 평가가 있으면 그 값으로 시작한다(수정 = 재제출). */
  const attrs = data.attrs || []
  const [evOpen, setEvOpen] = useState(false)
  const [scores, setScores] = useState<Record<string, Rating>>(() =>
    Object.fromEntries(data.myEval?.items ?? []) as Record<string, Rating>)
  const [overall, setOverall] = useState<Rating | null>(data.myEval?.overall ?? null)
  const [memo, setMemo] = useState(data.myEval?.memo ?? '')
  const [evBusy, setEvBusy] = useState(false)
  const [evFail, setEvFail] = useState(false)
  const [saved, setSaved] = useState<IvEval | null>(data.myEval ?? null)

  const allRated = attrs.length > 0 && attrs.every(a => scores[a]) && !!overall

  async function sendEval() {
    if (!allRated || !data.cid || !data.uid || evBusy) return
    setEvFail(false); setEvBusy(true)
    try {
      const items = attrs.map(a => [a, scores[a]] as [string, Rating])
      const r = await submitEval(data.cid, data.uid, items, overall!, memo.trim())
      if (!r.ok && r.reason !== 'not-configured') { setEvFail(true); setEvBusy(false); return }
      setSaved({ items, overall: overall!, memo: memo.trim(), at: '방금' })
      setEvOpen(false)
    } catch { setEvFail(true) }
    setEvBusy(false)
  }

  /* 서버 저장을 실제로 기다린다 — 실패를 성공 화면으로 덮지 않기 위해.
     DB 미설정(데모)은 실패가 아니라 정상 경로로 본다. */
  async function run(op: () => Promise<{ ok: boolean; reason?: string }>, next: 'confirmed' | 'declined') {
    setFailed(false)
    setBusy(true)
    try {
      const r = await op()
      if (!r.ok && r.reason !== 'not-configured') { setFailed(true); setBusy(false); return }
      setDone(next)
    } catch {
      setFailed(true)
    }
    setBusy(false)
  }

  const slots = data.slots || []
  const chosen = slots.find(s => s.key === picked) || null

  const groups: { day: string; items: IvSlot[] }[] = []
  slots.forEach(s => {
    const g = groups.find(x => x.day === s.day)
    if (g) g.items.push(s)
    else groups.push({ day: s.day, items: [s] })
  })

  function confirm() {
    if (!chosen || !data.cid || !data.uid || busy) return
    void run(() => ivConfirm(data.cid!, data.uid!, `${chosen.day} ${chosen.label}`), 'confirmed')
  }
  function decline() {
    if (!data.cid || !data.uid || busy) return
    const r = reason === '기타' ? (etc.trim() || '사유 미기재') : reason
    void run(() => ivDecline(data.cid!, data.uid!, r), 'declined')
  }

  /* 면접 준비 카드 — 확정된 뒤에만 보여준다 */
  const kit = (
    <div className="ivp-kit">
      <div className="ivp-kit-h">면접 준비</div>
      <div className="ivp-kv">
        <span className="ivp-k">후보자</span>
        <span className="ivp-v">
          {data.candName}
          {data.candYears ? <span className="ivp-sub"> · {data.candYears}년차</span> : null}
        </span>
      </div>
      {data.candRole && (
        <div className="ivp-kv"><span className="ivp-k">현재</span><span className="ivp-v">{data.candRole}</span></div>
      )}
      <div className="ivp-kv">
        <span className="ivp-k">단계</span>
        <span className="ivp-v">{data.stageName} · {data.dur}분 · {data.mode}</span>
      </div>
      {data.focus && data.focus.length > 0 && (
        <>
          <div className="ivp-kit-h2">이 단계에서 확인할 것</div>
          <ul className="ivp-focus">{data.focus.map(f => <li key={f}>{f}</li>)}</ul>
        </>
      )}
      <p className="ivp-fine">
        평가지는 면접 직후 이 링크에서 바로 작성할 수 있습니다.
        {data.recruiter ? ` 문의는 ${data.recruiter} 님에게 회신해 주세요.` : ''}
      </p>
    </div>
  )

  const state = done ?? (data.status === 'confirmed' ? 'confirmed' : data.status === 'declined' ? 'declined' : null)

  /* 평가지 — 면접이 확정된 뒤, 또는 이미 제출한 평가를 다시 열 때만 보인다.
     다른 면접관의 점수는 이 화면에 아예 내려오지 않는다(먼저 낸 사람에게 끌려가지 않도록). */
  const rateRow = (key: string, val: Rating | null, set: (v: Rating) => void) => (
    <div className="ivp-scale" role="group" aria-label={key}>
      {RATINGS.map(r => (
        <button
          key={r.v}
          type="button"
          className={`ivp-rate${val === r.v ? ` on ${r.v === 'yes' || r.v === 'syes' ? 'pos' : 'neg'}` : ''}`}
          onClick={() => set(r.v)}
          aria-pressed={val === r.v}
        >{r.l}</button>
      ))}
    </div>
  )

  const evalCard = !data.gradable ? null : (
    <div className="ivp-kit ivp-ev">
      <div className="ivp-kit-h">
        평가지
        {saved && <span className="ivp-ev-done">제출 완료 · {saved.at}</span>}
      </div>

      {saved && !evOpen ? (
        <>
          <div className="ivp-ev-sum">
            {saved.items.map(([l, v]) => (
              <div className="ivp-ev-line" key={l}>
                <span className="ivp-ev-l">{l}</span>
                <span className={`ivp-ev-v ${v === 'yes' || v === 'syes' ? 'pos' : 'neg'}`}>
                  {RATINGS.find(r => r.v === v)?.l}
                </span>
              </div>
            ))}
            <div className="ivp-ev-line total">
              <span className="ivp-ev-l">종합 의견</span>
              <span className={`ivp-ev-v ${saved.overall === 'yes' || saved.overall === 'syes' ? 'pos' : 'neg'}`}>
                {RATINGS.find(r => r.v === saved.overall)?.l}
              </span>
            </div>
          </div>
          {saved.memo && <p className="ivp-ev-memo">{saved.memo}</p>}
          <p className="ivp-fine" style={{ textAlign: 'left' }}>
            {data.othersCount ? `다른 면접관 ${data.othersCount}명도 제출했습니다. ` : ''}
            제출한 내용은 담당자와 하이어링 매니저가 봅니다.
          </p>
          <button className="ivp-ghost" onClick={() => setEvOpen(true)}>수정하기</button>
        </>
      ) : evOpen ? (
        <>
          <p className="ivp-ev-guide">
            보통(가운데)이 없는 4단계입니다. 애매하면 그 이유를 메모에 적어 주세요.
          </p>
          {attrs.map(a => (
            <div className="ivp-ev-field" key={a}>
              <div className="ivp-ev-k">{a}</div>
              {rateRow(a, scores[a] ?? null, v => setScores(s => ({ ...s, [a]: v })))}
            </div>
          ))}
          <div className="ivp-ev-field total">
            <div className="ivp-ev-k">종합 의견 — 이 사람을 뽑아야 하나요?</div>
            {rateRow('overall', overall, setOverall)}
          </div>
          <textarea
            className="ivp-ev-memo-in" value={memo} onChange={e => setMemo(e.target.value)}
            placeholder="판단의 근거를 한두 문장으로. 나중에 이 메모만 남습니다." rows={3} maxLength={500}
          />
          {evFail && <div className="ivp-err" style={{ marginTop: 9 }}>제출하지 못했습니다. 잠시 뒤 다시 눌러주세요.</div>}
          <button className="ivp-cta" style={{ marginTop: 10 }} disabled={!allRated || evBusy} onClick={sendEval}>
            {evBusy ? '제출 중…' : allRated ? '평가 제출하기' : '모든 항목을 골라주세요'}
          </button>
          {saved && (
            <button className="ivp-ghost" onClick={() => setEvOpen(false)} disabled={evBusy}>취소</button>
          )}
        </>
      ) : (
        <>
          <p className="ivp-ev-guide">
            면접이 끝나면 여기서 바로 작성해 주세요. 항목 {attrs.length}개 · 1분이면 됩니다.
          </p>
          <button className="ivp-cta" onClick={() => setEvOpen(true)}>평가지 작성하기</button>
          <p className="ivp-fine" style={{ textAlign: 'left' }}>
            내가 제출하기 전에는 다른 면접관 평가가 보이지 않습니다.
          </p>
        </>
      )}
    </div>
  )

  return (
    <div className="ivp-root">
      <style>{EXT_CSS}</style>
      <div className="ivp-card">
        <div className="ivp-brand">
          <span className="ivp-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h4l2-6 4 12 2-6h4" />
            </svg>
          </span>
          <span className="ivp-wm">Cadence</span>
          <span className="ivp-wm-sub">면접 요청</span>
        </div>

        {state === 'confirmed' ? (
          /* ---- 확정됨 ---- */
          <div className="ivp-body">
            <div className="ivp-badge ok" aria-hidden>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
                stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="ivp-h1">면접이 확정되었습니다</h1>
            <p className="ivp-lead">
              {data.ivName} 님, 아래 시간으로 확정했습니다.{data.mailOn
                ? ' 캘린더 초대를 보내드렸어요.'
                : ' 캘린더 초대는 담당자가 따로 보내드립니다.'}
            </p>
            <div className="ivp-confirm">
              <div className="ivp-confirm-day">
                {done === 'confirmed' && chosen ? chosen.day : data.confirmedLabel}
              </div>
              {done === 'confirmed' && chosen && <div className="ivp-confirm-time mono">{chosen.label}</div>}
              <div className="ivp-confirm-meta">{data.positionTitle} · {data.stageName}</div>
            </div>
            {kit}
            {evalCard}
          </div>
        ) : state === 'declined' ? (
          /* ---- 거절 완료 ---- */
          <div className="ivp-body">
            <div className="ivp-badge esc" aria-hidden>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <h1 className="ivp-h1">불가로 전달했습니다</h1>
            <p className="ivp-lead">
              {data.ivName} 님, 담당자에게 바로 전달했습니다. 대체 면접관 지정이나 시간 재조정은
              담당자가 처리하며, {data.ivName} 님이 더 하실 일은 없습니다.
            </p>
            {(data.declinedReason || reason) && (
              <div className="ivp-confirm">
                <div className="ivp-confirm-day">{data.declinedReason || (reason === '기타' ? etc.trim() || '사유 미기재' : reason)}</div>
                <div className="ivp-confirm-meta">{data.positionTitle} · {data.stageName}</div>
              </div>
            )}
          </div>
        ) : data.status === 'pending' ? (
          /* ---- 아직 제안할 시간이 없음 ---- */
          <div className="ivp-body">
            <div className="ivp-badge idle" aria-hidden>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
            </div>
            <h1 className="ivp-h1">아직 확정할 시간이 없습니다</h1>
            <p className="ivp-lead">{data.pendingMsg}</p>
            <p className="ivp-note">{data.positionTitle} · {data.stageName}</p>
            {/* 이 링크로 이미 평가를 낸 적이 있으면, 일정과 무관하게 다시 열 수 있다. */}
            {saved && evalCard}
          </div>
        ) : data.status === 'invalid' ? (
          /* ---- 잘못된 링크 ---- */
          <div className="ivp-body">
            <div className="ivp-badge idle" aria-hidden>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
              </svg>
            </div>
            <h1 className="ivp-h1">링크를 확인할 수 없어요</h1>
            <p className="ivp-lead">유효하지 않거나 만료된 요청 링크입니다. 담당자에게 다시 요청해 주세요.</p>
          </div>
        ) : view === 'decline' ? (
          /* ---- 거절 사유 ---- */
          <div className="ivp-body ivp-body-l">
            <h1 className="ivp-h1">어려우신 이유를 알려주세요</h1>
            <p className="ivp-lead">담당자가 다음 수를 바로 정할 수 있게, 한 줄이면 충분합니다.</p>
            <div className="ivp-reasons">
              {[...REASONS, '기타'].map(r => (
                <button
                  key={r}
                  className={`ivp-reason${reason === r ? ' on' : ''}`}
                  onClick={() => setReason(r)}
                  aria-pressed={reason === r}
                >{r}</button>
              ))}
            </div>
            {reason === '기타' && (
              <input
                className="ivp-etc" value={etc} onChange={e => setEtc(e.target.value)}
                placeholder="사유를 적어주세요" maxLength={80} autoFocus
              />
            )}
            <div className="ivp-foot">
              {failed && <div className="ivp-err">전달하지 못했습니다. 잠시 뒤 다시 눌러주세요.</div>}
              <button className="ivp-cta esc" disabled={busy} onClick={decline}>
                {busy ? '전달 중…' : '불가로 전달하기'}
              </button>
              <button className="ivp-ghost" onClick={() => setView('slots')} disabled={busy}>
                돌아가서 시간 고르기
              </button>
            </div>
          </div>
        ) : (
          /* ---- 요청: 시간 선택 ---- */
          <div className="ivp-body ivp-body-l">
            <h1 className="ivp-h1">{data.ivName} 님, 면접 하나만 확인해 주세요</h1>
            <div className="ivp-metarow">
              <span className="ivp-chip">{data.stageName}</span>
              <span className="ivp-dot">·</span>
              <span>{data.dur}분</span>
              <span className="ivp-dot">·</span>
              <span>{data.mode}</span>
            </div>
            <div className="ivp-who">
              <div className="ivp-kv">
                <span className="ivp-k">후보자</span>
                <span className="ivp-v">
                  {data.candName}
                  {data.candYears ? <span className="ivp-sub"> · {data.candYears}년차</span> : null}
                </span>
              </div>
              {data.candRole && (
                <div className="ivp-kv"><span className="ivp-k">현재</span><span className="ivp-v">{data.candRole}</span></div>
              )}
              <div className="ivp-kv">
                <span className="ivp-k">공고</span>
                <span className="ivp-v">{data.positionTitle}{data.team ? ` · ${data.team}` : ''}</span>
              </div>
            </div>

            <p className="ivp-lead">비어 있는 시간에 맞춰 찾았습니다. 되는 시간을 하나 골라주세요.</p>
            <div className="ivp-groups">
              {groups.map(g => (
                <div className="ivp-group" key={g.day}>
                  <div className="ivp-day">{g.day}</div>
                  <div className="ivp-slots">
                    {g.items.map(s => (
                      <button
                        key={s.key}
                        className={`ivp-slot${picked === s.key ? ' on' : ''}`}
                        onClick={() => setPicked(s.key)}
                        aria-pressed={picked === s.key}
                      >
                        <span className="mono">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="ivp-foot">
              {failed && <div className="ivp-err">확정하지 못했습니다. 잠시 뒤 다시 눌러주세요.</div>}
              <button className="ivp-cta" disabled={!chosen || busy} onClick={confirm}>
                {busy ? '확정 중…' : chosen ? `${chosen.day} ${chosen.label} 확정하기` : '시간을 선택해 주세요'}
              </button>
              <button className="ivp-ghost" onClick={() => setView('decline')} disabled={busy}>
                이 시간들은 모두 어렵습니다
              </button>
              <p className="ivp-fine">확정하면 후보자에게도 같은 시간으로 안내가 나갑니다.</p>
            </div>
          </div>
        )}
      </div>

      <div className="ivp-brandline">
        <span className="ivp-mark-sm" aria-hidden />
        Cadence · TalentCore Hire
      </div>
    </div>
  )
}
