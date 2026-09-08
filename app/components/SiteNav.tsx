'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/* =========================================================
   채용 사이트 위쪽 메뉴

   길잡이는 이 한 줄뿐이다. 사이드바는 공고 화면의 '거르개'로만 나온다 —
   메뉴가 두 군데 있으면 지금 어디에 있는지가 흐려진다.

   지금 있는 곳은 밑줄 하나로만 말한다. 색을 칠하거나 배경을 넣으면
   위쪽 띠가 시끄러워지고, 정작 아래 색면(.s-field)이 죽는다.

   클라이언트 컴포넌트인 이유는 하나 — 지금 주소를 알아야 하기 때문이다.
   ========================================================= */

const NAV = [
  { href: '/careers',         nm: '공고' },
  { href: '/careers/culture', nm: '일하는 방식' },
  { href: '/careers/process', nm: '지원하기 전에' },
]

/** '/careers/culture' 안에 있으면 그 메뉴가 켜진다.
    공고(/careers)만 예외로 정확히 일치할 때와 공고 상세일 때 켜진다 —
    /careers/culture 도 '/careers' 로 시작하기 때문이다. */
function isOn(here: string, href: string): boolean {
  if (href !== '/careers') return here === href || here.startsWith(href + '/')
  if (here === '/careers') return true
  return !NAV.some(n => n.href !== '/careers' && here.startsWith(n.href))
}

export default function SiteNav({ open }: { open: number }) {
  const here = usePathname() || ''
  return (
    <nav className="s-nav">
      {NAV.map(n => (
        <Link key={n.href} href={n.href} aria-current={isOn(here, n.href) ? 'page' : undefined}>
          {n.nm}
        </Link>
      ))}
      {/* '지원하기'라고 쓰지 않는다 — 어느 자리에 지원하는지 정하지 않은 채
          누르는 버튼이라 거짓말이 된다. 대신 지금 몇 자리가 열려 있는지 말한다. */}
      <Link href="/careers" className="s-btn">
        열려 있는 자리 <b>{open}</b>
      </Link>
    </nav>
  )
}
