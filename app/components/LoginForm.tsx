'use client'

/* =========================================================
   문 앞 화면

   이 화면은 바깥 사람이 보는 유일한 내부 화면이다.
   그래도 내부 규칙을 그대로 쓴다 — 색은 상태에만, 버튼은 무채색.
   보라색은 로고 한 곳뿐이다.

   비밀번호가 틀렸을 때 "그런 계정 없음/비밀번호 틀림"을 나눠 말하지 않는다.
   나눠 말하면 무엇이 맞았는지 알려 주는 셈이 된다.
   ========================================================= */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { enterDemo, signIn } from '../(gate)/actions'

const CSS = `
/* 디자인 시스템 토큰 그대로 쓴다.
   경계는 선이 아니라 톤 차이 — 가라앉은 바닥(--sunken) 위에 흰 카드(--canvas)가 뜬다. */
.gate { position: fixed; inset: 0; display: grid; place-items: center;
        background: var(--sunken); padding: 24px; overflow: auto; }
.gate-box { width: 100%; max-width: 344px; }

.gate-mark { display: flex; align-items: center; gap: 9px; margin-bottom: 22px; }
.gate-mark i { width: 26px; height: 26px; border-radius: 7px; background: var(--brand);
               display: grid; place-items: center; color: #fff; font-style: normal;
               font-size: 14px; font-weight: 700; letter-spacing: -.03em; }
.gate-mark b { font-size: 15px; font-weight: 700; letter-spacing: -.03em; color: var(--t1); }
.gate-mark span { font-size: 11.5px; color: var(--t3); margin-left: 1px; }

.gate-card { background: var(--canvas); border-radius: var(--r-xl);
             box-shadow: var(--sh-1); padding: 22px 20px 20px; }
.gate-card h1 { margin: 0 0 3px; font-size: 15px; font-weight: 700; letter-spacing: -.03em; color: var(--t1); }
.gate-card p.sub { margin: 0 0 18px; font-size: 12px; color: var(--t3); line-height: 1.6; }

.gate-lbl { display: block; font-size: 11.5px; font-weight: 600; color: var(--t2); margin-bottom: 5px; }

.gate-go { width: 100%; justify-content: center; margin-top: 14px; padding: 8px 12px; font-size: 13px; }
.gate-go:disabled { opacity: .45; cursor: default; }

.gate-err { margin: 12px 0 0; font-size: 12px; color: var(--esc); line-height: 1.6; }

.gate-or { display: flex; align-items: center; gap: 10px; margin: 18px 0 13px;
           font-size: 11px; color: var(--t4); }
.gate-or::before, .gate-or::after { content: ''; flex: 1; height: 1px; background: var(--line); }

.gate-demo { width: 100%; justify-content: center; padding: 8px 12px; font-size: 13px; }
.gate-note { margin: 10px 0 0; font-size: 11.5px; color: var(--t3); line-height: 1.65; text-align: center; }

.gate-foot { margin-top: 16px; text-align: center; font-size: 11.5px; }
.gate-foot a { color: var(--t3); border-bottom: 1px solid var(--line-firm); }
.gate-foot a:hover { color: var(--t1); }
`

export default function LoginForm({ back, configured }: { back: string; configured: boolean }) {
  const router = useRouter()
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    try {
      const r = await signIn(pw)
      if (!r.ok) {
        setErr(r.reason === 'not-configured'
          ? '이 배포본에는 아직 비밀번호가 설정돼 있지 않습니다. 아래 데모로 둘러보실 수 있습니다.'
          : '비밀번호가 맞지 않습니다.')
        setPw('')
        return
      }
      router.replace(back)
      router.refresh()
    } catch {
      setErr('지금은 확인할 수 없습니다. 잠시 뒤 다시 눌러주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function demo() {
    if (busy) return
    setBusy(true); setErr('')
    try {
      await enterDemo()
      router.replace('/')
      router.refresh()
    } catch {
      setErr('지금은 열 수 없습니다. 잠시 뒤 다시 눌러주세요.')
      setBusy(false)
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="gate">
        <div className="gate-box">
          <div className="gate-mark">
            <i>H</i>
            <b>Hire</b>
            <span>TalentCore 채용</span>
          </div>

          <div className="gate-card">
            <h1>들어가기</h1>
            <p className="sub">이 안에는 지원자의 이름·연락처와 면접 기록이 있습니다.</p>

            <form onSubmit={submit}>
              <label className="gate-lbl" htmlFor="pw">비밀번호</label>
              <input
                id="pw" className="in" type="password" value={pw}
                autoComplete="current-password" autoFocus disabled={busy}
                onChange={e => setPw(e.target.value)}
              />
              <button className="btn solid gate-go" disabled={busy || !pw}>
                {busy ? '확인하는 중…' : '들어가기'}
              </button>
            </form>

            {err && <p className="gate-err">{err}</p>}

            <div className="gate-or">또는</div>

            <button className="btn gate-demo" onClick={demo} disabled={busy}>
              데모로 둘러보기
            </button>
            <p className="gate-note">
              전부 보이고, 저장·수정은 잠겨 있습니다.<br />
              안에 있는 사람과 회사는 만들어 낸 예시입니다.
            </p>
          </div>

          <p className="gate-foot">
            <a href="/careers">채용 사이트 보기</a>
          </p>
          {!configured && (
            <p className="gate-note" style={{ marginTop: 12 }}>
              비밀번호 미설정 상태입니다 — 데모만 열립니다.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
