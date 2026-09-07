import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { hydrateData } from '../../../../lib/db'
import { postById, isClosed, todayISO } from '../../../../lib/careers'
import { orgName } from '../../../../lib/core'
import ApplyForm from '../../../../components/ApplyForm'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ pid: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  await hydrateData()
  const { pid } = await params
  const post = postById(pid)
  return { title: post ? `${post.title} 지원하기` : '지원하기' }
}

export default async function ApplyPage({ params }: Params) {
  await hydrateData()
  const { pid } = await params
  const post = postById(pid)
  /* 내려간 공고·마감된 공고는 지원 화면도 열리지 않는다.
     폼을 띄워 놓고 제출할 때 막으면 지원자가 글을 다 쓰고 나서 버려진다. */
  if (!post || isClosed(post.due, todayISO())) notFound()

  const co = (await orgName()) || 'TalentCore'

  return (
    <main className="s-wrap">
      <ApplyForm pid={post.id} title={post.title} steps={post.steps} company={co} />
    </main>
  )
}
