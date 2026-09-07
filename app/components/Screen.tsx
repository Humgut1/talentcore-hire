'use client'
import { useEffect, useRef } from 'react'
import { useInternalNav } from './useInternalNav'

/* 정적 화면 공통 래퍼.
   render.ts가 만든 HTML 문자열을 그대로 그리고,
   프로토타입에서 필요한 최소 상호작용만 얹는다:
   - 내부 링크(<a href="/...">) 클릭 → Next 라우터로 SPA 이동(전체 새로고침 없음)
   - [data-copy] 복사 버튼 → 클립보드 + 토스트
   - .sw:not([disabled]) 토글 버튼의 켜짐/꺼짐 시각 전환 (데모용) */
export default function Screen({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useInternalNav(ref, [html])

  useEffect(() => {
    const root = ref.current
    if (!root) return

    function toast(msg: string) {
      let wrap = document.querySelector('.toast-wrap') as HTMLElement | null
      if (!wrap) {
        wrap = document.createElement('div')
        wrap.className = 'toast-wrap'
        document.body.appendChild(wrap)
      }
      const t = document.createElement('div')
      t.className = 'toast'
      t.textContent = msg
      wrap.appendChild(t)
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300) }, 2200)
    }

    function onClick(e: MouseEvent) {
      const el = (e.target as HTMLElement).closest('[data-copy], .sw, [data-fold]') as HTMLElement | null
      if (!el || !root!.contains(el)) return
      if (el.hasAttribute('data-fold')) {
        el.classList.toggle('open')
        const body = el.nextElementSibling as HTMLElement | null
        if (body) body.style.display = body.style.display === 'none' ? '' : 'none'
        const label = el.querySelector('.arw-t')
        if (label) label.textContent = el.classList.contains('open') ? '접기' : '펼치기'
      } else if (el.hasAttribute('data-copy')) {
        const v = el.getAttribute('data-copy') || ''
        navigator.clipboard?.writeText(v).catch(() => {})
        toast('링크를 복사했습니다')
      } else if (el.classList.contains('sw') && !el.hasAttribute('disabled')) {
        el.classList.toggle('on')
      }
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [html])

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
}
