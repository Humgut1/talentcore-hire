'use client'
/* =========================================================
   Cadence — 왼쪽 사이드바
   ---------------------------------------------------------
   이 화면의 중심은 '공고'다. 기능 메뉴를 늘어놓지 않고,
   위에 짧은 메뉴 몇 개만 두고 그 아래는 통째로 공고 목록이다.
   공고를 누르면 그 공고의 파이프라인(보드)이 열리고,
   조율·평가·오퍼·메일은 전부 그 보드 안에서 끝난다.
   ========================================================= */
import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from './IconSprite'
import { me } from '../lib/data'
import { dupCount } from '../lib/pool'

/** 사이드바가 그리는 데 필요한 만큼만 추린 공고 한 줄. 서버가 만들어 넘긴다. */
export interface SidePos {
  id: string; title: string; dept: string; team: string
  st: 'open' | 'hold' | 'closed'
  n: number      // 진행 중 후보자 수
  risk: number   // 사람이 손대야 하는 수(사람 대기 + 지연)
}

const TOP = [
  { r: '/todo',       i: 'i-check-sq', n: '내 할 일' },
  { r: '/review',     i: 'i-eye-off',  n: '서류 검토' },
  { r: '/candidates', i: 'i-users',    n: '후보자 전체' },
  { r: '/pool',       i: 'i-copy',     n: '인재풀', b: 'dup' },
]
const BOTTOM = [
  { r: '/interviewers', i: 'i-user',     n: '면접관' },
  { r: '/dashboard',    i: 'i-chart',    n: '대시보드' },
  { r: '/export',       i: 'i-download', n: '내보내기' },
  { r: '/settings',     i: 'i-sliders',  n: '설정' },
]

function isActive(r: string, pathname: string) {
  if (r === '/') return pathname === '/'
  if (r === '/candidates') return pathname.startsWith('/candidates') || pathname.startsWith('/c/')
  return pathname.startsWith(r)
}

export default function Sidebar({ posList = [] }: { posList?: SidePos[] }) {
  const pathname = usePathname()
  const dupN = dupCount()
  const [q, setQ] = useState('')

  /* 마감된 공고는 접어 둔다 — 매일 보는 목록이 과거로 길어지면 안 된다. */
  const [showClosed, setShowClosed] = useState(false)
  const { live, closed } = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const hit = (p: SidePos) => !kw ||
      (p.title + p.dept + p.team).toLowerCase().indexOf(kw) >= 0
    const all = posList.filter(hit)
    return {
      live: all.filter(p => p.st !== 'closed'),
      closed: all.filter(p => p.st === 'closed'),
    }
  }, [posList, q])

  const curPid = pathname.startsWith('/p/') ? pathname.split('/')[2] : ''

  const row = (p: SidePos) => (
    <Link className={'pos-i' + (p.id === curPid ? ' on' : '')} href={`/p/${p.id}/board`} key={p.id}>
      <i className={'pos-dot' + (p.st === 'hold' ? ' hold' : p.st === 'closed' ? ' closed' : '')} />
      <span className="pos-t">
        <b>{p.title}</b>
        <em>{p.dept} · {p.team}</em>
      </span>
      {p.risk > 0
        ? <span className="badge">{p.risk}</span>
        : <span className="pos-n">{p.n}</span>}
    </Link>
  )

  return (
    <aside className="side">
      <div className="brand">
        <span className="brand-mark"><svg viewBox="0 0 24 24"><use href="#i-mark" /></svg></span>
        <span className="brand-name">Hire</span>
        <span className="brand-tag">TalentCore</span>
      </div>

      <div className="nav-sec">
        {TOP.map(it => (
          <Link className={'nav-i' + (isActive(it.r, pathname) ? ' on' : '')} href={it.r} key={it.r}>
            <Icon id={it.i} />{it.n}
            {it.b === 'dup' && dupN ? <span className="badge mute">{dupN}</span> : null}
          </Link>
        ))}
      </div>

      {/* ===== 공고 목록 — 이 사이드바의 본체 ===== */}
      <div className="nav-sec pos-sec">
        <p>
          공고
          <Link className="pos-all" href="/positions">전체</Link>
        </p>
        {posList.length > 7 && (
          <input className="pos-q" value={q} placeholder="공고 찾기"
            onChange={e => setQ(e.target.value)} />
        )}
        <div className="pos-list">
          {live.map(row)}
          {!live.length && <div className="pos-empty">{q ? '찾는 공고가 없습니다' : '열린 공고가 없습니다'}</div>}
          {closed.length > 0 && (
            <button className="pos-more" onClick={() => setShowClosed(v => !v)}>
              <Icon id="i-chevron" className={'ic-sm' + (showClosed ? ' flip' : '')} />
              마감 {closed.length}건
            </button>
          )}
          {showClosed && closed.map(row)}
        </div>
        <Link className="nav-i pos-new" href="/positions/new">
          <Icon id="i-plus" />공고 만들기
        </Link>
      </div>

      <div className="nav-sec">
        <p>운영</p>
        {BOTTOM.map(it => (
          <Link className={'nav-i' + (isActive(it.r, pathname) ? ' on' : '')} href={it.r} key={it.r}>
            <Icon id={it.i} />{it.n}
          </Link>
        ))}
        {/* 채용 사이트는 앱이 아니라 바깥 사람이 보는 화면이라 새 탭으로 연다.
            사이드바가 따라 들어가면 안 되는 유일한 주소다. */}
        <a className="nav-i" href="/careers" target="_blank" rel="noreferrer">
          <Icon id="i-briefcase" />채용 사이트
        </a>
      </div>

      <div className="side-foot">
        <span className="avatar">{me.init}</span>
        <div>
          <div className="who">{me.name}</div>
          <div className="role">{me.role}</div>
        </div>
      </div>
    </aside>
  )
}
