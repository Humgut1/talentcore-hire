'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import BrandMark from './BrandMark'
import { FlipWord } from './CareersMotion'
import './careers-home.css'

/* =========================================================
   채용 사이트의 머리글·바닥글 (.ch 디자인)

   첫 화면과 공고 상세가 같은 띠를 쓴다. 공고를 눌러 들어갔을 때 위쪽
   띠가 바뀌면 다른 사이트로 넘어온 것처럼 읽힌다.

   첫 화면에서는 위쪽 빛 번짐 위에 투명하게 떠 있다가 내려가면 흰
   유리로 바뀌고(solid), 상세처럼 빛이 없는 페이지에서는 처음부터
   흰 유리다(always).

   메뉴는 첫 화면 안의 구역으로 간다. 상세에서는 같은 구역이 없으므로
   base 를 붙여 첫 화면으로 돌려보낸다.
   ========================================================= */

const MENU = [
  ['#jobs', '공고'],
  ['#steps', '전형 절차'],
  ['#stories', '팀 이야기'],
  ['#ways', '일하는 방식'],
  ['#faq', '자주 묻는 질문'],
] as const

export function CareersTop({ co, count, base = '', always = false }: {
  co: string
  count: number
  /** 첫 화면이 아니면 '/careers' — 메뉴가 첫 화면의 구역으로 간다 */
  base?: string
  /** 처음부터 흰 유리로 둘지 */
  always?: boolean
}) {
  const [solid, setSolid] = useState(always)

  useEffect(() => {
    if (always) return
    const on = () => setSolid(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [always])

  return (
    <header className={`ch-top${solid ? ' solid' : ''}${always ? ' fixed' : ''}`}>
      <div className="ch-in">
        <Link href="/careers" className="ch-mark"><BrandMark />{co} <span>채용</span></Link>
        <nav>
          {MENU.map(([h, t]) => <a key={h} href={`${base}${h}`}>{t}</a>)}
        </nav>
        <a className="ch-cta" href={`${base}#jobs`}>공고 {count}건 보기</a>
      </div>
    </header>
  )
}

export function CareersFoot({ co }: { co: string }) {
  return (
    <footer className="ch-foot">
      <div className="ch-in">
        <span>© {new Date().getFullYear()} {co}</span>
        <a className="ch-by" href="https://talentcore-hire.vercel.app/careers" aria-label="talentcore 로 만든 채용 사이트">
          <span className="tc-lock"><BrandMark /><FlipWord text="talentcore" /></span>
        </a>
        <p>지원 과정에서 받은 개인정보는 채용 목적으로만 쓰이며, 채용 종료 후 파기합니다.</p>
      </div>
    </footer>
  )
}
