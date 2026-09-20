import type { Metadata } from 'next'
import { hydrateData } from '../../lib/db'
import { openPosts, todayISO } from '../../lib/careers'
import { orgName } from '../../lib/core'
import CareersHome from '../../components/CareersHome'
import { STEPS, WAYS, STORIES, FAQ, HERO_PHOTO } from './content'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const co = (await orgName()) || 'TalentCore'
  return {
    title: `채용 | ${co}`,
    description: `${co}에서 함께 일할 분을 찾고 있습니다. 모집 중인 공고를 확인해 보세요.`,
  }
}

/* =========================================================
   채용 첫 화면

   화면은 CareersHome 이 그린다(브라우저에서 검색·거르개가 돌아야 해서).
   여기서는 진짜 값만 챙겨 넘긴다 — 공고는 Hire 안의 실제 데이터,
   절차·일하는 방식·팀 이야기·질문은 회사가 직접 쓰는 글(content.ts).

   이 페이지는 사이트 공통 머리글·바닥글을 감추고 직접 그린다.
   위쪽 빛 번짐 위로 머리글이 떠 있어야 하기 때문이다(careers-home.css).
   ========================================================= */
export default async function CareersPage() {
  await hydrateData()
  const posts = openPosts()
  const co = (await orgName()) || 'TalentCore'

  return (
    <main>
      <CareersHome
        posts={posts}
        co={co}
        steps={STEPS}
        ways={WAYS}
        stories={STORIES}
        faq={FAQ}
        today={todayISO()}
        photo={HERO_PHOTO}
      />
    </main>
  )
}
