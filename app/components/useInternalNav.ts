'use client'
import { useEffect, type RefObject } from 'react'
import { useRouter } from 'next/navigation'

/* HTML 문자열로 그려진 화면의 내부 링크를 SPA 이동으로 바꾼다.
   render.ts 가 만든 <a href="/..."> 는 JSX가 아니라 next/link 를 쓸 수 없으므로,
   컨테이너에서 클릭을 가로채 Next 라우터로 넘긴다(전체 새로고침 없음).
   새 탭(Ctrl/⌘/가운데 클릭)·외부 링크·/api 서버 라우트·download 는 브라우저에 맡긴다.
   링크에 마우스를 올리면 미리 받아둬(prefetch) 클릭 시 바로 전환된다. */
export function useInternalNav(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  const router = useRouter()

  useEffect(() => {
    const root = ref.current
    if (!root) return

    /* 라우터가 처리할 내부 경로인지 판별 */
    function internalHref(a: HTMLAnchorElement | null): string | null {
      if (!a || !root!.contains(a)) return null
      if (a.target && a.target !== '_self') return null
      if (a.hasAttribute('download')) return null
      const href = a.getAttribute('href') || ''
      if (!href.startsWith('/') || href.startsWith('//')) return null // 외부·프로토콜 상대
      if (href.startsWith('/api/')) return null                       // 서버 라우트(구글 연결 등)
      return href
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return // 새 탭/새 창은 그대로
      const href = internalHref((e.target as HTMLElement).closest('a'))
      if (!href) return
      e.preventDefault()
      router.push(href)
    }
    function onOver(e: MouseEvent) {
      const href = internalHref((e.target as HTMLElement).closest('a'))
      if (href) router.prefetch(href)
    }

    root.addEventListener('click', onClick)
    root.addEventListener('mouseover', onOver)
    return () => {
      root.removeEventListener('click', onClick)
      root.removeEventListener('mouseover', onOver)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, router, ...deps])
}
