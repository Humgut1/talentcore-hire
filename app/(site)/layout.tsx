import type { Metadata } from 'next'
import Link from 'next/link'
import './site.css'
import { hydrateData } from '../lib/db'
import { openPosts } from '../lib/careers'
import { orgName } from '../lib/core'
import SiteNav from '../components/SiteNav'

/* =========================================================
   채용 사이트의 뿌리

   내부 앱((app) 그룹)과는 완전히 다른 뿌리다. 주소만 다른 게 아니라
   HTML 자체가 갈린다. 그래서 사이드바가 들고 있던 '공고 전체 목록
   (보류·종료 공고, 후보자 수, 위험 건수)'이 바깥 사람 브라우저로
   내려가는 일이 구조적으로 불가능하다.
   화면을 덮어 가리는 방식과 다른 점이 이것이다.

   글꼴이 세 벌인 이유
     · Noto Sans KR 900 — 큰 제목. 굵어져도 글자 속(ㅇ·ㅁ의 빈 공간)이
       막히지 않는 몇 안 되는 한글 글꼴이다
     · IBM Plex Sans KR — 본문. 길게 읽어도 눈이 덜 피로하다
     · IBM Plex Mono   — 근무지·마감일·소요 시간처럼 줄 맞춰 읽는 값.
       글자 폭이 다 같아서 목록에서 세로줄이 맞는다
   내부 앱의 Pretendard 는 여기서 안 쓴다. 두 화면은 CSS 도 글꼴도 안 겹친다.
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

  /* 열려 있는 자리 수는 머리글 버튼이 쓴다. 어느 페이지에 있든 같은 값이라
     페이지마다 세지 않고 여기서 한 번만 센다. */
  await hydrateData()
  const open = openPosts().length

  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@700;900&display=swap"
        />
      </head>
      <body className="site">
        <header className="s-top">
          <div className="s-wrap">
            <Link href="/careers" className="s-mark">{co}</Link>
            <SiteNav open={open} />
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
