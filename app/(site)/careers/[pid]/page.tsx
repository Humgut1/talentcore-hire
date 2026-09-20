import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { hydrateData } from '../../../lib/db'
import { postById, openPosts, dueLabel, dueSoon, isClosed, todayISO } from '../../../lib/careers'
import { orgName } from '../../../lib/core'
import { CareersTop, CareersFoot } from '../../../components/CareersChrome'
import '../../../components/careers-detail.css'

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
   줄 단위로 세 가지만 읽는다.

     소제목 — '[하는 일]' 처럼 대괄호로 감쌌거나, '## ' 로 시작하거나,
              짧은 한 줄 뒤에 바로 목록이 오는 줄
     목록   — '-' '·' '•' '*' 로 시작하는 줄
     문단   — 나머지. 빈 줄에서 끊는다

   블록(빈 줄 사이)이 아니라 줄로 읽는 이유는, 담당자가 소제목 바로 다음
   줄에 목록을 붙여 쓰는 일이 더 흔하기 때문이다. 블록으로 읽으면 그 경우
   소제목과 목록이 한 문단으로 뭉쳐 버린다.
----------------------------------------------------------- */
function Jd({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.trim())
  const isBullet = (l: string) => /^[-·•*]\s+/.test(l)
  const isHead = (l: string, next: string) =>
    /^\[.+\]$/.test(l) || /^#{1,3}\s+/.test(l) ||
    (!isBullet(l) && l.length <= 24 && !/[.!?]$/.test(l) && isBullet(next))

  const out: React.ReactNode[] = []
  let para: string[] = []
  let items: string[] = []
  const flushPara = () => {
    if (para.length) out.push(<p key={out.length}>{para.join('\n')}</p>)
    para = []
  }
  const flushList = () => {
    if (items.length) {
      out.push(<ul key={out.length}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>)
    }
    items = []
  }
  const flush = () => { flushPara(); flushList() }

  lines.forEach((l, i) => {
    if (!l) return flush()
    if (isHead(l, lines.slice(i + 1).find(Boolean) || '')) {
      flush()
      out.push(<h2 key={out.length}>{l.replace(/^\[\s*|\s*\]$/g, '').replace(/^#{1,3}\s+/, '')}</h2>)
      return
    }
    if (isBullet(l)) { flushPara(); items.push(l.replace(/^[-·•*]\s+/, '')); return }
    flushList()
    para.push(l)
  })
  flush()

  if (!out.length) {
    return <p>이 공고의 상세 설명은 준비 중입니다. 궁금한 점은 지원 시 남겨 주세요.</p>
  }
  return <>{out}</>
}

/* =========================================================
   공고 상세

   첫 화면과 같은 머리글·바닥글을 쓴다(.ch). 공고를 눌러 들어왔는데
   위쪽 띠가 바뀌면 다른 사이트로 넘어온 것처럼 읽힌다.
   ========================================================= */
export default async function CareerDetail({ params }: Params) {
  await hydrateData()
  const { pid } = await params
  const post = postById(pid)
  /* 내려간 공고 주소를 직접 쳐도 열리지 않는다 */
  if (!post) notFound()

  const today = todayISO()
  const closed = isClosed(post.due, today)
  const co = (await orgName()) || 'TalentCore'
  const open = openPosts().length

  const apply = closed
    ? <span className="ch-cta big cd-go off" aria-disabled="true">지원 마감</span>
    : <Link href={`/careers/${post.id}/apply`} className="ch-cta big cd-go">지원하기</Link>

  return (
    <div className="ch cd">
      <CareersTop co={co} count={open} base="/careers" always />

      <section className="cd-head">
        <div className="ch-in">
          <Link href="/careers#jobs" className="cd-back">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12 4l-6 6 6 6" /></svg>
            전체 공고
          </Link>

          <span className="cd-dept">
            {[post.dept, post.team !== post.dept ? post.team : ''].filter(Boolean).join(' · ')}
          </span>
          <h1>{post.title}</h1>

          <dl className="cd-facts">
            <div><dt>고용형태</dt><dd>{post.emp}</dd></div>
            <div><dt>근무지</dt><dd>{post.loc}</dd></div>
            <div><dt>경력</dt><dd>{post.exp}</dd></div>
            <div>
              <dt>마감</dt>
              <dd className={dueSoon(post.due, today) ? 'near' : undefined}>{dueLabel(post.due, today)}</dd>
            </div>
          </dl>

          {/* 좁은 화면에서만 보인다 — 넓은 화면은 오른쪽 붙박이가 대신한다 */}
          <div className="cd-top-go">{apply}</div>
        </div>
      </section>

      <section className="cd-body">
        <div className="ch-in cd-cols">
          <article className="cd-jd"><Jd text={post.jd} /></article>

          <aside className="cd-side">
            {/* 전형 절차. 이 회사가 실제로 굴리는 단계를 그대로 보여 준다 —
                지원자가 가장 궁금해하면서 대부분의 채용 사이트가 안 알려 주는 것이다. */}
            {post.steps.length > 0 && (
              <div className="cd-card">
                <strong>전형 절차</strong>
                <ul className="cd-plan">
                  {post.steps.map((s, i) => (
                    <li key={i}>
                      <i>{i + 1}</i>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {apply}
            <p className="cd-note">
              {closed ? '이 공고는 마감되었습니다.' : '이력서 파일과 기본 정보만 있으면 됩니다.'}
            </p>
          </aside>
        </div>
      </section>

      <CareersFoot co={co} />
    </div>
  )
}
