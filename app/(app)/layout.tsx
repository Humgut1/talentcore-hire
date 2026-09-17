import type { Metadata } from 'next'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import '../globals.css'
import IconSprite from '../components/IconSprite'
import Sidebar, { type SidePos } from '../components/Sidebar'
import NavProgress from '../components/NavProgress'
import { hydrateData } from '../lib/db'
import { positions, cands, stageById } from '../lib/data'
import { redirect } from 'next/navigation'
import { GATE_COOKIE, readSession } from '../lib/gate'
import { viewerLabel } from '../lib/session'
import { getUser } from '../lib/users'

export const metadata: Metadata = {
  title: 'Hire',
  description: 'TalentCore Hire — 채용 조율 자동화',
}

// 모든 페이지를 요청마다 새로 렌더 (DB 최신값 반영)
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /* 사이드바가 공고 목록이므로, 셸에서 한 번 DB를 읽는다.
     hydrateData 는 요청당 한 번만 도는 캐시라서 페이지에서 또 불러도 공짜다. */
  await hydrateData()

  /* 데모로 들어온 사람은 저장이 안 된다. 눌러 보고 나서 알게 하면
     "고장 났나" 로 읽힌다 — 누르기 전에 말해 준다. */
  const sess = await readSession((await cookies()).get(GATE_COOKIE)?.value)
  const role = sess?.role ?? null

  /* 계정으로 들어온 사람은 표가 살아 있어도 매번 명단을 다시 본다(H2).
     HR Admin 이 막거나 승인을 거두면 다음 화면 이동부터 바로 나가게 된다.
     명단을 못 읽는 경우(DB 미설정)는 표를 믿는다. */
  if (sess?.uid) {
    const u = await getUser(sess.uid)
    if (u === null || (u && 'st' in u && (u.st !== 'active' || u.role !== sess.urole))) {
      redirect('/logout?why=changed')
    }
  }

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
        <div className={role === 'demo' ? 'app has-demobar' : 'app'}>
          {role === 'demo' && (
            <div className="demobar">
              <b>데모입니다</b>
              <span>전부 둘러보실 수 있고, 저장·수정·삭제는 잠겨 있습니다. 안에 있는 사람과 회사는 만들어 낸 예시입니다.</span>
              <a href="/login">비밀번호로 들어가기</a>
            </div>
          )}
          <Sidebar posList={posList} who={viewerLabel(sess)} />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  )
}
