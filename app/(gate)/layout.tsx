/* 문 앞 화면(로그인)만 쓰는 셸.
   사이드바가 있는 (app) 셸을 쓸 수 없다 — 아직 들어오지 않은 사람이라
   공고 목록을 그리려고 DB 를 읽는 순간 그게 곧 유출이다. */
import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Hire',
  description: 'TalentCore Hire',
}

export default function GateLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
