'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { dueLabel, dueSoon, type CareerPost } from '../lib/careers'

/* =========================================================
   공고 목록 — 왼쪽 거르개 + 오른쪽 줄

   길잡이(공고 / 일하는 방식 / 지원하기 전에)는 위쪽 메뉴가 들고 있다.
   여기 왼쪽 기둥은 페이지를 옮기는 곳이 아니라 이 화면 안에서만 쓰는
   '거르개'다. 그래서 공고 화면에만 나온다.

   깔끔하다고 꼽히는 채용 사이트들(Toss·당근·Linear·Stripe)에서 가져온 것:

   1) 고를 값이 하나뿐인 줄은 아예 안 그린다.
      부서가 하나뿐인 회사에 '부서: 전체 / 프로덕트본부' 를 보여 주는 것은
      고르는 척만 하는 화면이다.

   2) 옆에 건수를 붙인다 — 당근이 하는 것.
      눌러 보기 전에 몇 건인지 보이면 0건짜리를 눌러 놓고 빈 화면을 볼 일이 없다.

   3) 한 줄에 정보는 셋까지. 근무지·고용형태·마감.
      나머지(경력·상세 설명)는 공고 상세가 들고 있다.

   검색창은 공고가 SEARCH_FROM 건 넘게 걸렸을 때만 꺼낸다. 세 건짜리 목록에
   검색창을 두면 도움이 아니라 '이 회사 공고가 많나 보다' 하는 헛기대만 만든다.
   ========================================================= */

interface Props {
  posts: CareerPost[]
  facets: { dept: string[]; emp: string[]; loc: string[] }
  today: string
}

/** 이 건수를 넘어야 검색창을 꺼낸다 */
const SEARCH_FROM = 12

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

  /* 거르개를 그릴지 말지. 고를 게 없으면 왼쪽 기둥 자체를 없애고
     공고가 한 칸을 다 쓴다 */
  const canDept = facets.dept.length >= 2
  const canEmp = facets.emp.length >= 2
  const canSearch = posts.length > SEARCH_FROM
  const hasRail = canDept || canEmp || canSearch

  const filtered = !!(q.trim() || dept || emp)
  const reset = () => { setQ(''); setDept(''); setEmp('') }

  const countOf = (key: 'dept' | 'emp', v: string) => posts.filter(p => p[key] === v).length

  const railGroup = (
    label: string,
    key: 'dept' | 'emp',
    values: string[],
    cur: string,
    set: (v: string) => void,
  ) => (
    <div className="s-rail-g">
      <h4>{label}</h4>
      <ul>
        <li>
          <button type="button" aria-current={cur === '' ? 'true' : undefined} onClick={() => set('')}>
            전체 <i>{posts.length}</i>
          </button>
        </li>
        {values.map(v => (
          <li key={v}>
            <button
              type="button"
              aria-current={cur === v ? 'true' : undefined}
              onClick={() => set(cur === v ? '' : v)}
            >
              {v} <i>{countOf(key, v)}</i>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className={hasRail ? 's-cols2' : undefined}>
      {hasRail && (
        <aside className="s-rail">
          {canSearch && (
            <label className="s-search">
              <span className="s-sr">공고 검색</span>
              <input
                type="text"
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="직무 · 기술로 검색"
              />
            </label>
          )}
          {canDept && railGroup('부서', 'dept', facets.dept, dept, setDept)}
          {canEmp && railGroup('고용 형태', 'emp', facets.emp, emp, setEmp)}
          {filtered && (
            <button type="button" className="s-clear" onClick={reset}>
              거르개 지우기
            </button>
          )}
        </aside>
      )}

      <div>
        {filtered && (
          <p className="s-count"><b>{shown.length}</b>개 공고</p>
        )}

        <div className="s-jobs">
          {shown.map(p => (
            <Link href={`/careers/${p.id}`} className="s-job" key={p.id}>
              <div className="s-dep">{p.dept}</div>
              <div>
                <h3 className="s-dsp">{p.title}</h3>
                <p>
                  {p.loc}
                  <span className="s-dot">·</span>
                  {p.emp}
                  <span className="s-dot">·</span>
                  <span className={dueSoon(p.due, today) ? 's-due' : undefined}>
                    {dueLabel(p.due, today)}
                  </span>
                </p>
              </div>
              <div className="s-arw" aria-hidden>→</div>
            </Link>
          ))}

          {shown.length === 0 && (
            <div className="s-empty">
              {filtered ? (
                <><b>조건에 맞는 공고가 없습니다</b>거르개를 바꿔서 다시 찾아보세요.</>
              ) : (
                <><b>지금은 모집 중인 공고가 없습니다</b>새 공고가 열리면 이 페이지에 바로 올라옵니다.</>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
