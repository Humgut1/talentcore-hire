'use client'
/* =========================================================
   Cadence — 이동 중 표시줄
   ---------------------------------------------------------
   이 앱은 모든 화면이 force-dynamic 이라, 링크를 누르면 서버가 다시 그릴 때까지
   화면이 그대로 멈춰 있다(개발 모드에서는 특히 길다). 사람은 그 정적을
   '안 눌렸다'로 읽고 다시 누른다.

   그래서 화면을 통째로 뼈대로 갈아치우는 대신(그러면 후보자 서랍을 열 때도
   보드가 사라진다) 맨 위에 얇은 줄만 흐르게 한다.
   보던 화면은 그대로 두고, '가고 있다'만 말해 주는 쪽이 덜 어지럽다.
   ========================================================= */
import { useEffect, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export default function NavProgress() {
  const path = usePathname()
  const qs = useSearchParams().toString()
  const [on, setOn] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* 주소가 실제로 바뀌면 도착한 것이다 — 줄을 끝까지 밀고 지운다. */
  useEffect(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    setOn(false)
  }, [path, qs])

  /* 앱 안쪽 링크 클릭을 잡는다. 새 탭·바깥 주소·내려받기는 건드리지 않는다. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest?.('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href || !href.startsWith('/') || a.target === '_blank' || a.hasAttribute('download')) return
      if (href === path + (qs ? '?' + qs : '')) return
      /* 아주 짧은 이동에서는 줄이 번쩍이기만 한다 — 조금 늦게 켠다. */
      timer.current = setTimeout(() => setOn(true), 120)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [path, qs])

  return (
    <>
      <div className={'navp' + (on ? ' on' : '')} aria-hidden="true"><i /></div>
      <style>{`
.navp { position: fixed; inset: 0 0 auto 0; height: 2px; z-index: 200; pointer-events: none;
  opacity: 0; transition: opacity .15s; }
.navp.on { opacity: 1; }
.navp i { display: block; height: 100%; width: 0; background: var(--brand);
  box-shadow: 0 0 8px var(--brand-rim); }
.navp.on i { animation: navp-run 8s cubic-bezier(.2,.8,.25,1) forwards; }
@keyframes navp-run { 0% { width: 0 } 12% { width: 42% } 40% { width: 72% } 100% { width: 94% } }
@media (prefers-reduced-motion: reduce) { .navp.on i { animation: none; width: 60% } }
`}</style>
    </>
  )
}
