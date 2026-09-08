import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { hydrateData } from '../../../lib/db'
import { postById, dueLabel, dueSoon, isClosed, todayISO } from '../../../lib/careers'
import { orgName } from '../../../lib/core'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ pid: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  await hydrateData()
  const { pid } = await params
  const post = postById(pid)
  if (!post) return { title: '채용' }
  const co = (await orgName()) || 'TalentCore'
  return {
    title: `${post.title} | ${co} 채용`,
    description: post.jd.slice(0, 140),
  }
}

/* -----------------------------------------------------------
   직무 설명 본문 그리기

   JD 는 담당자가 글상자에 그냥 쓴 글이다. 마크다운 라이브러리를 얹지 않고
   두 가지 규칙만 읽는다 — 빈 줄은 문단 나눔, '-'나 '·'로 시작하는 줄은 목록.
   그 이상은 쓴 그대로 보여 준다(줄바꿈 유지).
----------------------------------------------------------- */
function Jd({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
  if (!blocks.length) {
    return <p>이 공고의 상세 설명은 준비 중입니다. 궁금한 점은 지원 시 남겨 주세요.</p>
  }
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n').map(l => l.trim()).filter(Boolean)
        const bullet = (l: string) => /^[-·•*]\s*/.test(l)
        if (lines.every(bullet)) {
          return (
            <ul key={i}>
              {lines.map((l, j) => <li key={j}>{l.replace(/^[-·•*]\s*/, '')}</li>)}
            </ul>
          )
        }
        /* 짧은 한 줄이고 뒤에 내용이 더 있으면 소제목으로 읽는다 */
        if (lines.length === 1 && lines[0].length <= 24 && i < blocks.length - 1) {
          return <h2 key={i}>{lines[0]}</h2>
        }
        return <p key={i}>{b}</p>
      })}
    </>
  )
}

export default async function CareerDetail({ params }: Params) {
  await hydrateData()
  const { pid } = await params
  const post = postById(pid)
  /* 내려간 공고 주소를 직접 쳐도 열리지 않는다 */
  if (!post) notFound()

  const today = todayISO()
  const closed = isClosed(post.due, today)

  return (
    <main className="s-wrap">
      <div className="s-detail">
        <Link href="/careers" className="s-back">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          전체 공고
        </Link>

        <span className="s-eyebrow">{post.dept}{post.team && post.team !== post.dept ? ` · ${post.team}` : ''}</span>

        {/* 지원 버튼을 제목 옆에 한 번 더 둔다. Toss·당근·Stripe 모두
            스크롤 없이 보이는 자리에 지원 버튼이 있다. 이미 마음을 정하고
            들어온 사람을 JD 끝까지 스크롤시킬 이유가 없다. */}
        <div className="s-title">
          <h1>{post.title}</h1>
          {closed ? (
            <span className="s-cta s-cta-top" aria-disabled="true">지원 마감</span>
          ) : (
            <Link href={`/careers/${post.id}/apply`} className="s-cta s-cta-top">지원하기</Link>
          )}
        </div>

        <dl className="s-facts">
          <div className="s-fact"><dt>고용형태</dt><dd>{post.emp}</dd></div>
          <div className="s-fact"><dt>근무지</dt><dd>{post.loc}</dd></div>
          <div className="s-fact"><dt>경력</dt><dd>{post.exp}</dd></div>
          <div className="s-fact">
            <dt>마감</dt>
            <dd className={dueSoon(post.due, today) ? 'near' : undefined}>
              {dueLabel(post.due, today)}
            </dd>
          </div>
        </dl>
      </div>

      <div className="s-cols">
        <article className="s-jd">
          <Jd text={post.jd} />
        </article>

        <aside className="s-aside">
          {/* 전형 절차. 이 회사가 실제로 굴리는 단계를 그대로 보여 준다 —
              지원자가 가장 궁금해하면서 대부분의 채용 사이트가 안 알려 주는 것이다. */}
          {post.steps.length > 0 && (
            <div className="s-panel">
              <span className="s-eyebrow">전형 절차</span>
              <div className="s-plan">
                {post.steps.map((s, i) => (
                  <div key={i}>
                    {i > 0 && <div className="s-tie" />}
                    <div className="s-step">
                      <span className="s-num">{i + 1}</span>
                      <span className="s-nm">{s}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {closed ? (
            <>
              <span className="s-cta" aria-disabled="true">지원 마감</span>
              <p className="s-cta-note">이 공고는 마감되었습니다.</p>
            </>
          ) : (
            <>
              <Link href={`/careers/${post.id}/apply`} className="s-cta">지원하기</Link>
              <p className="s-cta-note">이력서 파일과 기본 정보만 있으면 됩니다.</p>
            </>
          )}
        </aside>
      </div>
    </main>
  )
}
