'use client'
import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { submitApplication, type ApplyState } from '../lib/apply'

/* =========================================================
   지원 폼

   칸을 늘리면 지원자가 줄어든다. 그래서 여기 있는 칸은 전부
   "이게 없으면 담당자가 다음 행동을 못 한다"는 기준을 통과한 것만 남겼다.
     · 이름·메일·연락처 — 연락할 수 없으면 아무것도 못 한다
     · 경력 연차        — 서류 검토의 첫 갈림길
     · 이력서 파일      — 검토할 것 자체
   나머지(한 줄 이력·지원 경로·지원 동기)는 선택이다.
   ========================================================= */

const EMPTY: ApplyState = { ok: false }

/* 지원 경로는 담당자가 '어디에 광고비를 쓸지' 판단하는 값이라 자유 입력보다
   고정 목록이 낫다. '기타'는 넣지 않는다 — 기타가 1등이 되면 쓸모가 없다. */
const SOURCES = ['채용 사이트', '검색', '지인 추천', '링크드인', '원티드', '잡코리아·사람인', 'SNS']

interface Props {
  pid: string
  title: string
  steps: string[]
  company: string
}

export default function ApplyForm({ pid, title, steps, company }: Props) {
  const [state, action, pending] = useActionState(submitApplication, EMPTY)
  const [fileName, setFileName] = useState('')

  /* 폼은 길어서 제출 버튼이 화면 맨 아래에 있다. 접수 완료 화면으로 바뀌어도
     스크롤은 그대로라, 올려 주지 않으면 지원자는 빈 여백만 보고 '된 건가?' 한다.
     오류일 때도 같다 — 오류 문구는 폼 맨 위에 뜬다. */
  useEffect(() => {
    if (state.ok || state.error) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [state])

  if (state.ok) {
    return (
      <div className="s-done">
        <div className="s-tick" aria-hidden>
          <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1>지원이 접수되었습니다</h1>
        <p>
          {title} 포지션 지원이 정상적으로 접수되었습니다.
          입력하신 메일 주소로 접수 확인 메일을 보내드렸습니다.
        </p>
        <p>
          서류 검토 결과는 접수일로부터 영업일 기준 7일 이내에 같은 주소로 안내드립니다.
        </p>
        <div className="s-next">
          <Link href="/careers" className="s-clear">다른 공고 보기</Link>
          <Link href={`/careers/${pid}`} className="s-clear">이 공고 다시 보기</Link>
        </div>
      </div>
    )
  }

  const bad = (f: string) => (state.field === f ? 'true' : undefined)

  return (
    <form className="s-form" action={action} noValidate>
      <input type="hidden" name="pid" value={pid} />

      <Link href={`/careers/${pid}`} className="s-back">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
        공고로 돌아가기
      </Link>

      <span className="s-eyebrow">지원하기</span>
      <h1>{title}</h1>
      <p className="s-sub">
        {steps.length > 0
          ? `접수 후 ${steps.slice(1).join(' → ') || steps[0]} 순으로 진행됩니다.`
          : '접수 후 검토 결과를 메일로 안내드립니다.'}
      </p>

      {state.error && <div className="s-err" role="alert" style={{ marginTop: 22 }}>{state.error}</div>}

      <div className="s-fields">
        <div className="s-two">
          <div className="s-f">
            <label htmlFor="a-nm">이름<span className="req">*</span></label>
            <input id="a-nm" name="nm" type="text" required autoComplete="name"
                   aria-invalid={bad('nm')} placeholder="홍길동" />
          </div>
          <div className="s-f">
            <label htmlFor="a-phone">연락처<span className="req">*</span></label>
            <input id="a-phone" name="phone" type="tel" required autoComplete="tel"
                   aria-invalid={bad('phone')} placeholder="010-1234-5678" />
          </div>
        </div>

        <div className="s-f">
          <label htmlFor="a-email">메일 주소<span className="req">*</span></label>
          <input id="a-email" name="email" type="email" required autoComplete="email"
                 aria-invalid={bad('email')} placeholder="name@example.com" />
          <span className="s-hint">전형 결과와 면접 일정을 모두 이 주소로 보내드립니다.</span>
        </div>

        <div className="s-two">
          <div className="s-f">
            <label htmlFor="a-yr">경력 연차<span className="req">*</span></label>
            <input id="a-yr" name="yr" type="number" min={0} max={50} step={1} required
                   aria-invalid={bad('yr')} placeholder="0" />
            <span className="s-hint">신입이면 0을 적어 주세요.</span>
          </div>
          <div className="s-f">
            <label htmlFor="a-src">어떻게 알고 오셨나요</label>
            <select id="a-src" name="src" defaultValue="채용 사이트">
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="s-f">
          <label htmlFor="a-role">한 줄 이력</label>
          <input id="a-role" name="role" type="text" maxLength={60}
                 placeholder="예) 커머스 백엔드 6년 · 결제 시스템" />
          <span className="s-hint">비워 두시면 지원하신 포지션명으로 남습니다.</span>
        </div>

        <div className="s-f">
          <label htmlFor="a-resume">이력서 파일<span className="req">*</span></label>
          <div className="s-file">
            <input id="a-resume" name="resume" type="file" required
                   accept=".pdf,.doc,.docx,.hwp,.hwpx,application/pdf"
                   onChange={e => setFileName(e.target.files?.[0]?.name ?? '')} />
          </div>
          <span className="s-hint">
            {fileName ? `선택됨 · ${fileName}` : 'PDF 를 권장합니다. 포트폴리오는 이력서에 링크로 넣어 주세요.'}
          </span>
        </div>

        <div className="s-f">
          <label htmlFor="a-note">지원 동기 · 하고 싶은 말</label>
          <textarea id="a-note" name="note" maxLength={1000}
                    placeholder="이 포지션에 지원하신 이유나, 이력서에 담기 어려웠던 이야기를 자유롭게 적어 주세요." />
        </div>

        <div className="s-consent">
          <label className="s-check" htmlFor="a-agree">
            <input id="a-agree" name="agree" type="checkbox" required aria-invalid={bad('agree')} />
            <span>개인정보 수집·이용에 동의합니다<span className="req">*</span></span>
          </label>
          <div className="s-terms">
            <p>
              <b>수집 항목</b> — 이름, 메일 주소, 연락처, 경력 연차, 이력서 파일에 담긴 정보,
              그 밖에 지원자가 직접 입력한 내용
            </p>
            <p>
              <b>수집·이용 목적</b> — {company} 채용 전형 진행(서류 검토, 면접 일정 안내, 결과 통보),
              합격 시 입사 절차 안내
            </p>
            <p>
              <b>보유·이용 기간</b> — 채용 전형 종료 후 <b>1년</b>. 기간이 지나면 지체 없이 파기합니다.
              지원자가 그전에 파기를 요청하면 즉시 파기합니다.
            </p>
            <p>
              <b>동의를 거부할 권리</b> — 동의를 거부하실 수 있으나, 이 경우 지원서 접수와
              전형 진행이 불가능합니다.
            </p>
          </div>
        </div>
      </div>

      <div className="s-actions">
        <button type="submit" className="s-cta" disabled={pending}>
          {pending ? '접수 중…' : '지원서 제출'}
        </button>
        <span className="s-cta-note">제출 후에는 메일 회신으로 수정·취소하실 수 있습니다.</span>
      </div>
    </form>
  )
}
