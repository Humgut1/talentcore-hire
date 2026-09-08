import type { Metadata } from 'next'
import { hydrateData } from '../../lib/db'
import { openPosts, facets, todayISO } from '../../lib/careers'
import { orgName } from '../../lib/core'
import CareersList from '../../components/CareersList'
import { STATS } from './content'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const co = (await orgName()) || 'TalentCore'
  return {
    title: `채용 | ${co}`,
    description: `${co}에서 함께 일할 분을 찾고 있습니다. 모집 중인 공고를 확인해 보세요.`,
  }
}

/* =========================================================
   공고 — 채용 사이트의 첫 화면

   한 페이지에 회사 이야기를 다 쌓지 않는다. 여기는 자리를 보러 오는 곳이라
   색면 하나 지나면 바로 공고다. 회사 이야기는 '일하는 방식'이 들고 있고,
   절차와 질문은 '지원하기 전에'가 들고 있다.

   색면의 숫자 세 개 중 첫 칸(열려 있는 자리)만 진짜 값이다.
   나머지 둘은 content.ts 의 예시 — 회사의 진짜 숫자로 바꿔야 한다.
   ========================================================= */
export default async function CareersPage() {
  await hydrateData()
  const posts = openPosts()
  const co = (await orgName()) || 'TalentCore'

  return (
    <main>
      <section className="s-field">
        <div className="s-wrap">
          <h1 className="s-dsp">일하는 방식을<br />만드는 일</h1>
          <p>{co}는 사람을 뽑고, 맞이하고, 함께 일하는 과정을 다시 설계합니다.</p>

          <div className="s-bar">
            <div><b>{posts.length}</b>열려 있는 자리</div>
            {STATS.map(s => (
              <div key={s.k}><b>{s.v}</b>{s.k}</div>
            ))}
          </div>
        </div>
      </section>

      <div className="s-wrap s-sheet">
        <CareersList posts={posts} facets={facets(posts)} today={todayISO()} />
      </div>
    </main>
  )
}
