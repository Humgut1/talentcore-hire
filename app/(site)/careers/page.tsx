import type { Metadata } from 'next'
import { hydrateData } from '../../lib/db'
import { openPosts, facets, todayISO } from '../../lib/careers'
import { orgName } from '../../lib/core'
import CareersList from '../../components/CareersList'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const co = (await orgName()) || 'TalentCore'
  return {
    title: `채용 | ${co}`,
    description: `${co}에서 함께 일할 분을 찾고 있습니다. 모집 중인 공고를 확인해 보세요.`,
  }
}

export default async function CareersPage() {
  await hydrateData()
  const posts = openPosts()
  const co = (await orgName()) || 'TalentCore'

  return (
    <main>
      <section className="s-hero">
        <div className="s-wrap">
          <span className="s-eyebrow">Careers</span>
          <h1>같이 만들 사람을 찾습니다</h1>
          <p>
            {co}는 서로의 일을 믿고 맡길 수 있는 팀을 만들고 있습니다.
            지금 열려 있는 자리를 확인하고, 맞는 곳이 있다면 편하게 지원해 주세요.
          </p>
        </div>
      </section>

      <div className="s-wrap">
        <CareersList posts={posts} facets={facets(posts)} today={todayISO()} />
      </div>
    </main>
  )
}
