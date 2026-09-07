'use client'
import { useState, useRef, useEffect } from 'react'
import { inboxHTML } from '../lib/render'
import { useInternalNav } from './useInternalNav'

/* 조율 처리함 — 접기/펼치기 상태만 클라이언트에서 관리.
   나머지는 render.ts의 inboxHTML(open)이 그린다. */
export default function Inbox() {
  const [open, setOpen] = useState({ idle: false, done: false })
  const ref = useRef<HTMLDivElement>(null)
  useInternalNav(ref)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    function onClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement).closest('[data-fold]') as HTMLElement | null
      if (!btn || !root!.contains(btn)) return
      const k = btn.getAttribute('data-fold') as 'idle' | 'done'
      setOpen(o => ({ ...o, [k]: !o[k] }))
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [])

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: inboxHTML(open) }} />
}
