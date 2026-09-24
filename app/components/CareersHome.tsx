'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { dueLabel, dueSoon, type CareerPost } from '../lib/careers'
import type { Story } from '../(site)/careers/content'
import { CareersTop, CareersFoot } from './CareersChrome'
import BrandMark from './BrandMark'
import { WordReel, JobStream } from './CareersMotion'
import './careers-home.css'

/* =========================================================
   채용 첫 화면

   한 장짜리다. 위에서부터 공고 → 전형 절차 → 팀 이야기 → 일하는 방식 →
   자주 묻는 질문. 바깥에서 온 사람이 가장 먼저 찾는 것이 '무슨 자리가
   열려 있나'라, 회사 이야기보다 공고가 먼저 온다.

   첫 화면에는 제목 · 검색창 · 사진 한 장만 둔다. 숫자 띠(구성원 181명 ·
   평균 근속 3.4년)는 회사가 직접 채워야 하는 예시 값이라 뺐고, 그 자리에
   잠깐 두었던 부서 바로 가기와 '7일 안에' 안내도 뺐다 — 둘 다 바로 아래
   구역에서 다시 나오는 말이라, 첫 화면이 같은 말을 두 번 하고 있었다.

   효과는 브라우저에서만 그린다 — 글자와 공고가 먼저 뜨고 빛이 뒤따른다.
   ========================================================= */
const Glow = dynamic(() => import('./CareersFx').then(m => m.Glow), { ssr: false })
const MetalMark = dynamic(() => import('./CareersFx').then(m => m.MetalMark), { ssr: false })

interface Props {
  posts: CareerPost[]
  co: string
  steps: { t: string; d: string; dur: string }[]
  ways: { t: string; d: string }[]
  stories: Story[]
  faq: { q: string; a: string }[]
  today: string
  photo: string
}

function useStill() {
  const [still, setStill] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setStill(q.matches)
    on()
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return still
}

export default function CareersHome({ posts, co, steps, ways, stories, faq, today, photo }: Props) {
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const still = useStill()

  const depts = useMemo(() => {
    const m = new Map<string, number>()
    posts.forEach(p => p.dept && m.set(p.dept, (m.get(p.dept) || 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [posts])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return posts.filter(p =>
      (!dept || p.dept === dept) &&
      (!s || [p.title, p.dept, p.team, p.loc, p.emp].join(' ').toLowerCase().includes(s)))
  }, [posts, q, dept])

  const soon = posts.filter(p => dueSoon(p.due, today)).length
  const toJobs = () => document.getElementById('jobs')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="ch">
      <CareersTop co={co} count={posts.length} />

      <section className="ch-hero">
        <div className="ch-fx"><Glow still={still} /></div>
        <div className="ch-in ch-hero-in">
          {/* 녹은 금속 로고. 밑의 평범한 로고는 효과를 못 그리는 기기에서 남는다 */}
          <div className="ch-logo">
            <BrandMark className="ch-logo-still" />
            <MetalMark still={still} />
          </div>
          <p className="ch-eye">{co} 채용</p>
          <h1>
            <WordReel words={depts.length ? depts.map(([d]) => d) : [co]} still={still} />
            <span className="ch-sr">{depts.length ? depts.map(([d]) => d).join(', ') : co}</span>에서<br />
            함께할 분을 찾습니다
          </h1>
          <p className="ch-sub">사람을 뽑고, 맞이하고, 함께 일하는 과정을 다시 설계합니다.</p>

          <label className="ch-search">
            <span className="ch-sr">공고 검색</span>
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="m14 14 4 4" /></svg>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') toJobs() }}
              placeholder="직무, 팀, 근무지로 찾아보세요"
            />
          </label>

        </div>
      </section>

      {/* 아래 구역에서 다시 나올 말(부서 칩·7일 안내)을 첫 화면이 한 번 더
          하지 않게 했다. 사진은 어두운 첫 화면 밖, 흰 바탕에 둔다. */}
      {photo && (
        <div className="ch-in ch-hero-shot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="" />
        </div>
      )}

      <section className="ch-sec" id="jobs">
        <div className="ch-in">
          <div className="ch-h">
            <h2 className="ch-h2">열려 있는 공고 <b>{shown.length}</b></h2>
            {(q || dept) && <button type="button" className="ch-reset" onClick={() => { setQ(''); setDept('') }}>조건 지우기</button>}
          </div>
          <div className="ch-filter">
            <div className="ch-chips">
              <button type="button" className={!dept ? 'on' : ''} onClick={() => setDept('')}>전체 {posts.length}</button>
              {depts.map(([d, n]) => (
                <button type="button" key={d} className={dept === d ? 'on' : ''} onClick={() => setDept(dept === d ? '' : d)}>{d} {n}</button>
              ))}
            </div>
          </div>
          {shown.length ? (
            <ul className="ch-rows">
              {shown.map(p => (
                <li key={p.id}>
                  <Link href={`/careers/${p.id}`}>
                    <span className="ch-dept">{[p.dept, p.team].filter(Boolean).join(' · ')}</span>
                    <strong>{p.title}</strong>
                    <span className="ch-meta">{[p.loc, p.emp, p.exp].filter(Boolean).join(' · ')}</span>
                    <span className={`ch-due${dueSoon(p.due, today) ? ' soon' : ''}`}>{dueLabel(p.due, today)}</span>
                    <i className="ch-go" aria-hidden="true">
                      <svg viewBox="0 0 20 20"><path d="M7 4l6 6-6 6" /></svg>
                    </i>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ch-empty">조건에 맞는 공고가 없습니다.</p>
          )}
        </div>
      </section>

      <section className="ch-sec ch-soft" id="steps">
        <div className="ch-in">
          <div className="ch-h">
            <h2 className="ch-h2">전형 절차</h2>
            <Link className="ch-more" href="/careers/process">지원하기 전에 →</Link>
          </div>
          <p className="ch-lead">지원부터 입사까지 네 단계입니다. 면접은 두 번으로 끝냅니다.</p>
          <ol className="ch-steps">
            {steps.map((s, i) => (
              <li key={s.t}>
                <span className="ch-n">{String(i + 1).padStart(2, '0')}</span>
                <strong>{s.t}</strong>
                <p>{s.d}</p>
                <em>{s.dur}</em>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {stories.length > 0 && (
        <section className="ch-sec" id="stories">
          <div className="ch-in">
            <div className="ch-h">
              <h2 className="ch-h2">팀 이야기</h2>
              <Link className="ch-more" href="/careers/culture#stories">전체 보기 →</Link>
            </div>
            <p className="ch-lead">무엇을 만들고 있는지, 어떻게 일하는지 직접 적은 글입니다.</p>
            <div className="ch-stories">
              {stories.slice(0, 4).map(s => {
                const card = (
                  <>
                    <span className="ch-shot">
                      {/* 바깥 주소의 사진이라 next/image 최적화를 태우지 않는다 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.photo} alt="" loading="lazy" />
                    </span>
                    <span className="ch-tag">{s.tag}</span>
                    <strong>{s.t}</strong>
                    <p>{s.d}</p>
                  </>
                )
                /* 글이 실릴 주소가 아직 없으면 누를 수 없게 둔다 — 눌러도
                   아무 데도 가지 않는 카드가 더 나쁘다 */
                return s.href
                  ? <a className="ch-story" key={s.t} href={s.href}>{card}</a>
                  : <div className="ch-story" key={s.t}>{card}</div>
              })}
            </div>
          </div>
        </section>
      )}

      <section className="ch-sec ch-soft" id="ways">
        <div className="ch-in">
          <div className="ch-h">
            <h2 className="ch-h2">일하는 방식</h2>
            <Link className="ch-more" href="/careers/culture">자세히 보기 →</Link>
          </div>
          <div className="ch-ways">
            {ways.map(w => (
              <div key={w.t}>
                <strong>{w.t}</strong>
                <p>{w.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ch-sec" id="faq">
        <div className="ch-in ch-narrow">
          <h2 className="ch-h2">자주 묻는 질문</h2>
          <div className="ch-faq">
            {faq.map(f => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="ch-end">
        <div className="ch-in">
          <h2>함께 일할 준비가 되셨나요</h2>
        </div>
        <JobStream posts={posts} still={still} />
        <div className="ch-in">
          <a className="ch-cta big" href="#jobs">
            공고 {posts.length}건 보기{soon ? ` · 이번 주 마감 ${soon}건` : ''}
          </a>
        </div>
      </section>

      <CareersFoot co={co} />
    </div>
  )
}
