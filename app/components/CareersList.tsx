'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { dueLabel, dueSoon, type CareerPost } from '../lib/careers'

/* =========================================================
   공고 목록 — 검색 + 필터

   서버가 이미 '내걸린 공고'만 골라서 넘겨준다. 여기서는 그 안에서
   걸러내기만 한다. 공고 수가 수천 건이 되는 회사가 아니라서
   서버 왕복 없이 브라우저에서 거르는 편이 훨씬 빠르다.
   ========================================================= */

interface Props {
  posts: CareerPost[]
  facets: { dept: string[]; emp: string[]; loc: string[] }
  today: string
}

/* 한 줄에 검색이 걸리는 범위. 직무명만으로는 '프론트'를 못 찾는다. */
const haystack = (p: CareerPost) =>
  [p.title, p.dept, p.team, p.emp, p.loc, p.exp, p.jd].join(' ').toLowerCase()

export default function CareersList({ posts, facets, today }: Props) {
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [emp, setEmp] = useState('')

  const shown = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return posts.filter(p => {
      if (dept && p.dept !== dept) return false
      if (emp && p.emp !== emp) return false
      if (kw && !haystack(p).includes(kw)) return false
      return true
    })
  }, [posts, q, dept, emp])

  const filtered = !!(q.trim() || dept || emp)
  const reset = () => { setQ(''); setDept(''); setEmp('') }

  /* 값이 하나뿐인 필터는 고르는 의미가 없어서 줄을 통째로 감춘다 */
  const chipRow = (
    label: string,
    values: string[],
    cur: string,
    set: (v: string) => void,
  ) =>
    values.length < 2 ? null : (
      <div className="s-chips">
        <span className="s-eyebrow">{label}</span>
        <button
          type="button"
          className="s-chip"
          aria-pressed={cur === ''}
          onClick={() => set('')}
        >
          전체
        </button>
        {values.map(v => (
          <button
            key={v}
            type="button"
            className="s-chip"
            aria-pressed={cur === v}
            onClick={() => set(cur === v ? '' : v)}
          >
            {v}
          </button>
        ))}
      </div>
    )

  return (
    <>
      <div className="s-filters">
        <label className="s-search">
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="s-sr">공고 검색</span>
          <input
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="직무, 부서, 기술로 검색"
          />
        </label>
        {chipRow('부서', facets.dept, dept, setDept)}
        {chipRow('고용형태', facets.emp, emp, setEmp)}
      </div>

      <div className="s-count">
        <span>
          <b>{shown.length}</b>개 공고
        </span>
        {filtered && (
          <button type="button" className="s-clear" onClick={reset}>
            필터 지우기
          </button>
        )}
      </div>

      <div className="s-list">
        {shown.map(p => (
          <Link key={p.id} href={`/careers/${p.id}`} className="s-row">
            <div>
              <h3>{p.title}</h3>
              <div className="s-meta">
                <span>{p.dept}{p.team && p.team !== p.dept ? ` · ${p.team}` : ''}</span>
                <span className="s-dot">·</span>
                <span>{p.loc}</span>
                <span className="s-dot">·</span>
                <span>{p.emp}</span>
                <span className="s-dot">·</span>
                <span>{p.exp}</span>
                <span className={`s-due${dueSoon(p.due, today) ? ' near' : ''}`}>
                  {dueLabel(p.due, today)}
                </span>
              </div>
            </div>
            <span className="s-go">
              자세히 보기
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                   stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </Link>
        ))}

        {shown.length === 0 && (
          <div className="s-empty">
            {posts.length === 0 ? (
              <>
                <b>지금은 모집 중인 공고가 없습니다</b>
                새 공고가 열리면 이 페이지에 바로 올라옵니다.
              </>
            ) : (
              <>
                <b>조건에 맞는 공고가 없습니다</b>
                검색어나 필터를 바꿔서 다시 찾아보세요.
              </>
            )}
          </div>
        )}
      </div>
    </>
  )
}
