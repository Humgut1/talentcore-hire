'use client'
/* =========================================================
   후보자 셀프 예약 — 외부 링크 화면 (전체화면)
   ---------------------------------------------------------
   리크루터 셸(사이드바)을 덮는 fixed 오버레이. 후보자가 슬롯을
   하나 고르고 확정하면 bookSlot 서버액션으로 DB 에 기록한다.
   디자인 규칙: 색은 상태(done 녹색)에만, 버튼은 무채색,
   인디고(--brand)는 로고·선택 강조 전용.
   ========================================================= */
import { useState } from 'react'
import { bookSlot } from '../lib/actions'

export interface BookSlot {
  key: string; date: string; start: number; end: number; day: string; label: string
}
export interface BookData {
  status: 'choose' | 'booked' | 'pending' | 'invalid'
  cid?: string
  name?: string
  company?: string
  positionTitle?: string
  stageName?: string
  dur?: number
  mode?: string
  slots?: BookSlot[]
  bookedLabel?: string
  pendingMsg?: string
}

export default function BookClient({ data }: { data: BookData }) {
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ day: string; label: string } | null>(null)

  const slots = data.slots || []
  const chosen = slots.find(s => s.key === picked) || null

  // 날짜별로 슬롯을 묶는다(같은 날은 한 그룹).
  const groups: { day: string; items: BookSlot[] }[] = []
  slots.forEach(s => {
    const g = groups.find(x => x.day === s.day)
    if (g) g.items.push(s)
    else groups.push({ day: s.day, items: [s] })
  })

  async function confirm() {
    if (!chosen || !data.cid || busy) return
    setBusy(true)
    const label = `${chosen.day.split(' ')[0]}(${chosen.day.match(/\((.)\)/)?.[1] ?? ''}) ${chosen.label}`
    void bookSlot(data.cid, label)
    // 후보자 경험상 즉시 확정 화면으로(쓰기는 백그라운드).
    setTimeout(() => { setDone({ day: chosen.day, label: chosen.label }); setBusy(false) }, 420)
  }

  return (
    <div className="bk-root">
      <style>{BOOK_CSS}</style>
      <div className="bk-card">
        {/* 헤더 — 브랜드 마크 + Cadence */}
        <div className="bk-brand">
          <span className="bk-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h4l2-6 4 12 2-6h4" />
            </svg>
          </span>
          <span className="bk-wm">Cadence</span>
          <span className="bk-wm-sub">면접 일정 예약</span>
        </div>

        {done ? (
          /* ---- 확정 완료 ---- */
          <div className="bk-body">
            <div className="bk-ok" aria-hidden>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none"
                stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="bk-h1">예약이 확정되었어요</h1>
            <p className="bk-lead">{data.name} 님, 아래 시간으로 {data.stageName} 일정을 확정했습니다.</p>
            <div className="bk-confirm">
              <div className="bk-confirm-day">{done.day}</div>
              <div className="bk-confirm-time mono">{done.label}</div>
              <div className="bk-confirm-meta">{data.company} · {data.positionTitle} · {data.mode}</div>
            </div>
            <p className="bk-note">캘린더 초대와 접속 정보를 이메일로 보내드렸어요. 변경이 필요하면 회신해 주세요.</p>
          </div>
        ) : data.status === 'booked' ? (
          /* ---- 이미 확정됨(재방문) ---- */
          <div className="bk-body">
            <div className="bk-ok" aria-hidden>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none"
                stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 className="bk-h1">이미 예약이 확정되었어요</h1>
            <p className="bk-lead">{data.name} 님의 {data.stageName} 일정이 확정된 상태입니다.</p>
            {data.bookedLabel && <div className="bk-confirm"><div className="bk-confirm-day">{data.bookedLabel}</div></div>}
            <p className="bk-note">변경이 필요하시면 담당자에게 회신해 주세요.</p>
          </div>
        ) : data.status === 'pending' ? (
          /* ---- 슬롯 없음/코디네이터/면접관 미지정 ---- */
          <div className="bk-body">
            <div className="bk-wait" aria-hidden>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
            </div>
            <h1 className="bk-h1">일정 안내를 준비 중입니다</h1>
            <p className="bk-lead">{data.name ? `${data.name} 님, ` : ''}{data.pendingMsg}</p>
            <p className="bk-note">{data.company} · {data.positionTitle}</p>
          </div>
        ) : data.status === 'invalid' ? (
          /* ---- 잘못된 링크 ---- */
          <div className="bk-body">
            <div className="bk-wait" aria-hidden>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
              </svg>
            </div>
            <h1 className="bk-h1">링크를 확인할 수 없어요</h1>
            <p className="bk-lead">유효하지 않거나 만료된 예약 링크입니다. 담당자에게 다시 요청해 주세요.</p>
          </div>
        ) : (
          /* ---- 슬롯 선택 ---- */
          <div className="bk-body bk-body-choose">
            <h1 className="bk-h1">{data.company} · {data.positionTitle}</h1>
            <div className="bk-metarow">
              <span className="bk-chip">{data.stageName}</span>
              <span className="bk-dot">·</span>
              <span>{data.dur}분</span>
              <span className="bk-dot">·</span>
              <span>{data.mode}</span>
            </div>
            <p className="bk-lead">{data.name} 님, 편한 시간을 하나 선택해 주세요.</p>

            <div className="bk-groups">
              {groups.map(g => (
                <div className="bk-group" key={g.day}>
                  <div className="bk-day">{g.day}</div>
                  <div className="bk-slots">
                    {g.items.map(s => (
                      <button
                        key={s.key}
                        className={`bk-slot${picked === s.key ? ' on' : ''}`}
                        onClick={() => setPicked(s.key)}
                        aria-pressed={picked === s.key}
                      >
                        <span className="bk-slot-t mono">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bk-foot">
              <button className="bk-cta" disabled={!chosen || busy} onClick={confirm}>
                {busy ? '확정 중…' : chosen ? `${chosen.day.split(' ')[0]} ${chosen.label} 확정하기` : '시간을 선택해 주세요'}
              </button>
              <p className="bk-fine">선택한 시간으로 면접이 확정되며, 캘린더 초대가 이메일로 발송됩니다.</p>
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

/* 후보자 화면의 겉모습은 한 벌만 둔다 — /pick(면접 시간 고르기)도 이걸 그대로 쓴다. */
export const BOOK_CSS = `
.bk-root{
  position:fixed; inset:0; z-index:2000; overflow-y:auto;
  background:
    radial-gradient(1100px 520px at 50% -8%, #efeefc 0%, rgba(239,238,252,0) 60%),
    var(--chrome, #fbfbfc);
  color:var(--t1, #17171c);
  font-family:var(--sans, 'Pretendard Variable','Pretendard',system-ui,sans-serif);
  display:flex; flex-direction:column; align-items:center;
  padding:56px 20px 28px;
}
.bk-card{
  width:100%; max-width:520px; background:var(--canvas, #fff);
  border-radius:var(--r-2xl, 18px);
  box-shadow:var(--sh-3, 0 12px 28px -6px rgba(23,23,28,.12), 0 0 0 1px rgba(23,23,28,.07));
  overflow:hidden;
}
.bk-brand{
  display:flex; align-items:center; gap:9px;
  padding:16px 22px; border-bottom:1px solid var(--line, #ececf0);
}
.bk-mark{
  width:24px; height:24px; border-radius:7px; flex:none; display:grid; place-items:center;
  background:linear-gradient(150deg, var(--brand, #5b53d6) 0%, var(--brand-deep, #4a43bd) 100%);
  box-shadow:0 1px 2px rgba(91,83,214,.35), inset 0 1px 0 rgba(255,255,255,.22);
}
.bk-wm{ font-weight:680; font-size:14px; letter-spacing:-.02em; }
.bk-wm-sub{ margin-left:auto; font-size:11.5px; color:var(--t3, #84848f); }

.bk-body{ padding:34px 30px 30px; text-align:center; }
.bk-body-choose{ text-align:left; padding:26px 24px 24px; }

.bk-h1{ font-size:19px; font-weight:700; letter-spacing:-.02em; line-height:1.35; text-wrap:balance; }
.bk-body-choose .bk-h1{ font-size:18px; }
.bk-lead{ margin-top:8px; color:var(--t2, #55555f); font-size:13.5px; line-height:1.6; }
.bk-note{ margin-top:16px; color:var(--t3, #84848f); font-size:12px; line-height:1.6; }

.bk-metarow{
  display:flex; align-items:center; gap:7px; margin-top:11px;
  color:var(--t2, #55555f); font-size:12.5px;
}
.bk-dot{ color:var(--t4, #a8a8b2); }
.bk-chip{
  display:inline-flex; align-items:center; padding:2px 9px; border-radius:999px;
  background:var(--brand-soft, #efeefc); color:var(--brand-deep, #4a43bd);
  font-size:11.5px; font-weight:620;
}

/* 날짜 그룹 + 슬롯 */
.bk-groups{ margin-top:18px; display:flex; flex-direction:column; gap:16px; }
.bk-day{ font-size:12px; font-weight:640; color:var(--t3, #84848f); margin-bottom:8px; }
.bk-slots{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.bk-slot{
  display:flex; align-items:center; justify-content:center; gap:6px;
  padding:11px 10px; border-radius:var(--r-md, 8px);
  background:var(--canvas, #fff); box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
  color:var(--t1, #17171c); font-size:13.5px; transition:box-shadow .12s, background .12s;
}
.bk-slot:hover{ box-shadow:inset 0 0 0 1px var(--t4, #a8a8b2); background:var(--sunken, #f6f6f8); }
.bk-slot-t{ font-size:13px; letter-spacing:-.01em; }
.bk-slot.on{
  background:var(--brand-soft, #efeefc); color:var(--brand-deep, #4a43bd);
  box-shadow:inset 0 0 0 1.5px var(--brand, #5b53d6);
  font-weight:640;
}

/* 확정 버튼(무채색 solid) */
.bk-foot{ margin-top:22px; }
.bk-cta{
  width:100%; padding:13px 16px; border-radius:var(--r-lg, 10px);
  background:var(--t1, #17171c); color:#fff; font-size:13.5px; font-weight:640;
  box-shadow:var(--sh-1, 0 1px 2px rgba(23,23,28,.05)); transition:opacity .12s, transform .06s;
}
.bk-cta:hover:not(:disabled){ opacity:.9; }
.bk-cta:active:not(:disabled){ transform:translateY(1px); }
.bk-cta:disabled{ background:var(--sunken, #f6f6f8); color:var(--t4, #a8a8b2); cursor:default; box-shadow:inset 0 0 0 1px var(--line, #ececf0); }
.bk-fine{ margin-top:10px; text-align:center; color:var(--t3, #84848f); font-size:11.5px; line-height:1.55; }

/* 확정 완료 */
.bk-ok{
  width:52px; height:52px; margin:0 auto 6px; border-radius:50%;
  display:grid; place-items:center;
  background:var(--done-bg, #f0faf5); color:var(--done, #0a9459);
  box-shadow:inset 0 0 0 1px var(--done-rim, rgba(10,148,89,.22));
}
.bk-wait{
  width:48px; height:48px; margin:0 auto 8px; border-radius:50%;
  display:grid; place-items:center;
  background:var(--sunken, #f6f6f8); color:var(--t3, #84848f);
  box-shadow:inset 0 0 0 1px var(--line, #ececf0);
}
.bk-confirm{
  margin:16px auto 0; max-width:300px; padding:16px;
  border-radius:var(--r-lg, 10px); background:var(--sunken, #f6f6f8);
  box-shadow:inset 0 0 0 1px var(--line, #ececf0);
}
.bk-confirm-day{ font-size:14px; font-weight:680; letter-spacing:-.01em; }
.bk-confirm-time{ margin-top:3px; font-size:15px; color:var(--brand-deep, #4a43bd); font-weight:600; }
.bk-confirm-meta{ margin-top:7px; color:var(--t2, #55555f); font-size:12px; }

.bk-brandline{
  display:flex; align-items:center; gap:7px; margin-top:20px;
  color:var(--t4, #a8a8b2); font-size:11.5px;
}
.bk-mark-sm{
  width:11px; height:11px; border-radius:3px; display:inline-block;
  background:linear-gradient(150deg, var(--brand, #5b53d6), var(--brand-deep, #4a43bd));
}

@media (max-width:420px){
  .bk-root{ padding:32px 14px 22px; }
  .bk-slots{ grid-template-columns:1fr; }
}
`
