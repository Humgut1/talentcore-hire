import type { Metadata } from 'next'
import { Suspense } from 'react'
import '../globals.css'
import IconSprite from '../components/IconSprite'
import Sidebar, { type SidePos } from '../components/Sidebar'
import NavProgress from '../components/NavProgress'
import { hydrateData } from '../lib/db'
import { positions, cands, stageById } from '../lib/data'

export const metadata: Metadata = {
  title: 'Cadence',
  description: 'TalentCore Hire — 채용 조율 자동화',
}

// 모든 페이지를 요청마다 새로 렌더 (DB 최신값 반영)
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /* 사이드바가 공고 목록이므로, 셸에서 한 번 DB를 읽는다.
     hydrateData 는 요청당 한 번만 도는 캐시라서 페이지에서 또 불러도 공짜다. */
  await hydrateData()
  const posList: SidePos[] = positions.map(p => {
    const act = cands.filter(c => c.p === p.id && !stageById(p.id, c.st).rail)
    return {
      id: p.id, title: p.title, dept: p.dept, team: p.team, st: p.st,
      n: act.length,
      risk: act.filter(c => c.s === 'esc' || c.s === 'late').length,
    }
  })

  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 숫자용 고정폭. 예전 jsdelivr 주소는 404 라 숫자만 대체 글꼴로 떨어져
            한글 옆에서 글꼴이 튀어 보였다 — 살아 있는 주소로 바꾼다. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <IconSprite />
        <Suspense fallback={null}><NavProgress /></Suspense>
        <div className="app">
          <Sidebar posList={posList} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  )
}
