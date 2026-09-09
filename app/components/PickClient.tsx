'use client'
/* =========================================================
   후보자 면접 시간 선택 — 외부 링크 화면(전체화면)
   ---------------------------------------------------------
   /book 은 '단계 하나짜리 간이 예약'이고, 여기는 조율 엔진이 잡아 둔
   **가예약된 자리** 중 하나를 고르는 화면이다. 고르는 순간 나머지 가예약이
   풀리고 면접관 캘린더에 확정 일정이 잡힌다(권한이 없으면 Cadence 안에서만).

   겉모습은 BookClient 와 한 벌을 쓴다(BOOK_CSS) — 후보자 입장에서 같은 회사의
   같은 화면으로 보여야 하기 때문이다.
   ========================================================= */
import { useState } from 'react'
import { ivPickSlot, ivAskTimes } from '../lib/iv-actions'
import { BOOK_CSS } from './BookClient'

export interface PickSlot { ord: number; day: string; label: string }
export interface PickData {
  /* full = 기한은 남았지만 자리가 다 나간 상태.
     'expired'(기한 만료)와 반드시 구분해야 한다 — 이틀이나 남았는데
     "기한이 지났습니다"가 뜨면 후보자는 화면이 고장난 줄 안다. */
  status: 'choose' | 'booked' | 'expired' | 'invalid' | 'full'
  token?: string
  name?: string
  company?: string
  positionTitle?: string
  stageName?: string
  totalMin?: number
  mode?: string
  who?: string[]           // '최영수 차상위 리더 60분' 처럼 이미 만들어서 넘긴다
  seq?: boolean            // 이어서 보는 면접인가
  slots?: PickSlot[]
  bookedLabel?: string
  /* 메일이 실제로 나갈 수 있는 상태인가(Gmail 연결됨).
     연결 전에는 "보내드렸어요"가 거짓말이 된다 — 후보자는 오지 않는 메일을
     기다리다 면접을 놓친다. 그래서 안내 문구를 사실에 맞춰 바꾼다. */
  mailOn?: boolean
}

export default function PickClient({ data }: { data: PickData }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<PickSlot | null>(null)
  /* 누르는 순간 남이 먼저 가져간 자리. 목록에서 조용히 빼기만 한다 —
     '다른 지원자'라는 말은 후보자 화면에 절대 올리지 않는다. */
  const [gone, setGone] = useState<number[]>([])
  const [ask, setAsk] = useState('')
  const [asked, setAsked] = useState(false)

  const slots = (data.slots || []).filter(s => !gone.includes(s.ord))
  const chosen = slots.find(s => s.ord === picked) || null

  // 같은 날 자리는 한 묶음으로 보여 준다.
  const groups: { day: string; items: PickSlot[] }[] = []
  slots.forEach(s => {
    const g = groups.find(x => x.day === s.day)
    if (g) g.items.push(s)
    else groups.push({ day: s.day, items: [s] })
  })

  async function confirm() {
    if (!chosen || !data.token || busy) return
    setBusy(true); setErr('')
    const r = await ivPickSlot(data.token, chosen.ord)
    setBusy(false)
    if (r.ok) { setDone(chosen); return }
    // 이 자리는 방금 사라졌다. 조용히 지우기만 하면 '눌렀는데 아무 일도 안 일어났다'가
    // 되어 화면이 고장난 것처럼 보인다. 그래서 한 줄은 말하되, 주어는 사람이 아니라 일정이다.
    if (r.reason === 'taken' || r.reason === 'no-slot') {
      setGone(g => [...g, chosen.ord])
      setPicked(null)
      setErr('이 시간은 방금 마감되었습니다. 다른 시간을 선택해 주세요.')
      return
    }
    setErr(r.reason === 'already-confirmed'
      ? '이미 확정된 면접입니다. 담당자에게 문의해 주세요.'
      : r.reason === 'expired'
        ? '선택 기한이 지났습니다. 담당자가 새 시간을 안내드릴 예정입니다.'
        : '확정에 실패했습니다. 잠시 뒤 다시 시도해 주세요.')
  }

  async function sendAsk() {
    if (!data.token || !ask.trim() || busy) return
    setBusy(true)
    const r = await ivAskTimes(data.token, ask)
    setBusy(false)
    if (r.ok) setAsked(true)
    else setErr('보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
  }

  /* 고르는 사이에 자리가 다 나간 경우도 '마감' 화면으로 넘긴다.
     빈 목록만 남겨 두는 건 후보자를 막다른 골목에 세우는 것과 같다. */
  const full = data.status === 'full' || (data.status === 'choose' && slots.length === 0)

  const okMark = (
    <div className="bk-ok" aria-hidden>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none"
        stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </div>
  )
  const waitMark = (
    <div className="bk-wait" aria-hidden>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
      </svg>
    </div>
  )

  return (
    <div className="bk-root">
      <style>{BOOK_CSS}</style>
      <style>{EXTRA}</style>
      <div className="bk-card">
        <div className="bk-brand">
          <span className="bk-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h4l2-6 4 12 2-6h4" />
            </svg>
          </span>
          <span className="bk-wm">Cadence</span>
          <span className="bk-wm-sub">면접 시간 선택</span>
        </div>

        {done ? (
          <div className="bk-body">
            {okMark}
            <h1 className="bk-h1">면접 시간이 확정되었어요</h1>
            <p className="bk-lead">{data.name} 님, 아래 시간으로 {data.stageName} 일정을 확정했습니다.</p>
            <div className="bk-confirm">
              <div className="bk-confirm-day">{done.day}</div>
              <div className="bk-confirm-time mono">{done.label}</div>
              <div className="bk-confirm-meta">{data.company} · {data.positionTitle} · {data.mode ?? '화상'}</div>
            </div>
            <p className="bk-note">{data.mailOn
              ? '캘린더 초대와 접속 정보를 이메일로 보내드렸어요. 변경이 필요하면 회신해 주세요.'
              : '확정된 시간은 담당자에게 전달됐어요. 접속 정보는 담당자가 따로 안내드립니다.'}</p>
          </div>
        ) : data.status === 'booked' ? (
          <div className="bk-body">
            {okMark}
            <h1 className="bk-h1">이미 시간이 확정되었어요</h1>
            <p className="bk-lead">{data.name} 님의 {data.stageName} 일정이 확정된 상태입니다.</p>
            {data.bookedLabel ? (
              <div className="bk-confirm"><div className="bk-confirm-day">{data.bookedLabel}</div></div>
            ) : null}
            <p className="bk-note">변경이 필요하시면 담당자에게 회신해 주세요.</p>
          </div>
        ) : data.status === 'expired' ? (
          <div className="bk-body">
            {waitMark}
            <h1 className="bk-h1">선택 기한이 지났어요</h1>
            <p className="bk-lead">
              {data.name ? `${data.name} 님, ` : ''}잡아 두었던 시간이 풀렸습니다.
              담당자가 새 시간을 다시 안내드릴 예정입니다.
            </p>
            <p className="bk-note">{data.company} · {data.positionTitle}</p>
          </div>
        ) : full ? (
          <div className="bk-body">
            {asked ? okMark : waitMark}
            {asked ? (
              <>
                <h1 className="bk-h1">알려주셔서 고맙습니다</h1>
                <p className="bk-lead">
                  담당자가 확인한 뒤 가능한 시간으로 다시 안내드릴게요.
                </p>
                <p className="bk-note">{data.company} · {data.positionTitle}</p>
              </>
            ) : (
              <>
                <h1 className="bk-h1">가능한 시간이 모두 마감되었어요</h1>
                <p className="bk-lead">
                  {data.name ? `${data.name} 님, ` : ''}안내드린 기간의 면접 시간이 모두 찼습니다.
                  가능하신 시간대를 알려주시면 담당자가 직접 조율해 드릴게요.
                </p>
                <textarea
                  className="pk-ask" rows={3} value={ask} maxLength={500}
                  onChange={e => setAsk(e.target.value)}
                  placeholder="예) 다음 주 화·수 오후, 목요일 오전 모두 가능합니다" />
                {err ? <p className="pk-err">{err}</p> : null}
                <div className="bk-foot">
                  <button className="bk-cta" disabled={!ask.trim() || busy} onClick={sendAsk}>
                    {busy ? '보내는 중…' : '담당자에게 보내기'}
                  </button>
                  <p className="bk-fine">{data.company} · {data.positionTitle} · {data.stageName}</p>
                </div>
              </>
            )}
          </div>
        ) : data.status === 'invalid' ? (
          <div className="bk-body">
            {waitMark}
            <h1 className="bk-h1">링크를 확인할 수 없어요</h1>
            <p className="bk-lead">유효하지 않거나 만료된 링크입니다. 담당자에게 다시 요청해 주세요.</p>
          </div>
        ) : (
          <div className="bk-body bk-body-choose">
            <h1 className="bk-h1">{data.company} · {data.positionTitle}</h1>
            <div className="bk-metarow">
              <span className="bk-chip">{data.stageName}</span>
              <span className="bk-dot">·</span>
              <span>{data.totalMin}분</span>
              <span className="bk-dot">·</span>
              <span>{data.mode ?? '화상'}</span>
            </div>
            <p className="bk-lead">{data.name} 님, 편한 시간을 하나 선택해 주세요.</p>

            {data.who?.length ? (
              <div className="pk-who">
                <div className="pk-who-h">{data.seq ? '이어서 두 분을 만나요' : '면접관'}</div>
                {data.who.map((w, i) => (
                  <div className="pk-who-r" key={i}>
                    {data.seq ? <span className="pk-ord">{i + 1}</span> : null}
                    {w}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="bk-groups">
              {groups.map(g => (
                <div className="bk-group" key={g.day}>
                  <div className="bk-day">{g.day}</div>
                  <div className="bk-slots">
                    {g.items.map(s => (
                      <button key={s.ord} className={'bk-slot' + (picked === s.ord ? ' on' : '')}
                        onClick={() => setPicked(s.ord)} aria-pressed={picked === s.ord}>
                        <span className="bk-slot-t mono">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {err ? <p className="pk-err">{err}</p> : null}

            <div className="bk-foot">
              <button className="bk-cta" disabled={!chosen || busy} onClick={confirm}>
                {busy ? '확정 중…' : chosen ? `${chosen.day} ${chosen.label} 확정하기` : '시간을 선택해 주세요'}
              </button>
              <p className="bk-fine">선택한 시간으로 면접이 확정되며, 나머지 시간은 자동으로 풀립니다.</p>
            </div>
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

const EXTRA = `
.pk-ask{
  width:100%; margin-top:16px; padding:11px 13px; border-radius:var(--r-md, 8px);
  border:0; box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
  background:var(--canvas, #fff); color:var(--t1, #17171c);
  font:inherit; font-size:13.5px; line-height:1.6; resize:vertical;
}
.pk-ask:focus{ outline:2px solid var(--brand, #5b53d6); outline-offset:1px; }
.pk-who{
  margin-top:16px; padding:12px 14px; border-radius:var(--r-lg, 10px);
  background:var(--sunken, #f6f6f8); box-shadow:inset 0 0 0 1px var(--line, #ececf0);
}
.pk-who-h{ font-size:11.5px; font-weight:640; color:var(--t3, #84848f); margin-bottom:7px; }
.pk-who-r{ display:flex; align-items:center; gap:8px; font-size:13px; color:var(--t1, #17171c); padding:2px 0; }
.pk-ord{
  width:17px; height:17px; flex:none; border-radius:50%; display:grid; place-items:center;
  font-size:10.5px; font-weight:640; color:var(--t2, #55555f);
  background:var(--canvas, #fff); box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
}
.pk-err{
  margin-top:14px; padding:9px 12px; border-radius:var(--r-md, 8px);
  background:var(--esc-bg, #fef4f3); color:var(--esc, #d92d20);
  font-size:12.5px; font-weight:600; line-height:1.5;
}
`
