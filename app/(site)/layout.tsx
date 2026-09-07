import type { Metadata } from 'next'
import Link from 'next/link'
import './site.css'
import { orgName } from '../lib/core'

/* =========================================================
   채용 사이트의 뿌리

   내부 앱((app) 그룹)과는 완전히 다른 뿌리다. 주소만 다른 게 아니라
   HTML 자체가 갈린다. 그래서 사이드바가 들고 있던 '공고 전체 목록
   (보류·종료 공고, 후보자 수, 위험 건수)'이 바깥 사람 브라우저로
   내려가는 일이 구조적으로 불가능하다.
   화면을 덮어 가리는 방식과 다른 점이 이것이다.
   ========================================================= */

export const metadata: Metadata = {
  title: '채용',
  description: '함께 일할 분을 찾고 있습니다.',
}

export const dynamic = 'force-dynamic'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  /* 회사명은 TalentCore 에서 가져온다. 연동이 없으면 환경변수, 그것도 없으면
     빈 문자열 — 그때는 머리글에 회사명 대신 '채용' 만 남는다. */
  const co = (await orgName()) || 'TalentCore'

  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="site">
        <header className="s-top">
          <div className="s-wrap">
            <Link href="/careers" className="s-logo">
              <span className="s-mark" aria-hidden>{co.slice(0, 1)}</span>
              {co}
            </Link>
            <nav className="s-topnav">
              <Link href="/careers">채용 공고</Link>
            </nav>
          </div>
        </header>

        {children}

        <footer className="s-foot">
          <div className="s-wrap">
            <span><strong>{co}</strong> 채용</span>
            <span>지원 과정에서 받은 개인정보는 채용 목적으로만 쓰이며, 채용 종료 후 파기합니다.</span>
          </div>
        </footer>
      </body>
    </html>
  )
}
