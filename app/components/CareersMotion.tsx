'use client'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import type { CareerPost } from '../lib/careers'

/* =========================================================
   채용 첫 화면의 글자 움직임 세 가지

   WordReel  제목 속 한 단어가 위로 올라가며 바뀐다(부서 이름).
   JobStream 맨 아래에서 공고 칸이 옆으로 흐르고, 스크롤하면 빨라진다.
   FlipWord  바닥글 'talentcore' 가 한 글자씩 돈다. 마우스를 올려야만
             도는 효과는 폰에서 안 보이므로, 화면에 들어올 때 한 번 돈다.

   라이브러리 없이 CSS 와 짧은 스크립트로만 만든다. '움직임 줄이기'를
   켠 사람에게는 모두 멈춘 모양으로 보인다(still).
   ========================================================= */

export function WordReel({ words, still }: { words: string[]; still: boolean }) {
  const [i, setI] = useState(0)
  const [jump, setJump] = useState(false)
  const [w, setW] = useState<number>()
  const ref = useRef<HTMLSpanElement>(null)
  const many = words.length > 1 && !still
  /* 끝에 첫 단어를 한 번 더 둬서, 마지막 → 처음이 되감기 없이 위로 이어진다 */
  const list = many ? [...words, words[0]] : words.slice(0, 1)

  useEffect(() => {
    if (!many) return
    const t = setInterval(() => { setJump(false); setI(n => n + 1) }, 2600)
    return () => clearInterval(t)
  }, [many])

  useEffect(() => {
    if (!many || i < words.length) return
    const t = setTimeout(() => { setJump(true); setI(0) }, 650)
    return () => clearTimeout(t)
  }, [i, many, words.length])

  /* 지금 단어 폭에 맞춰 문장이 늘었다 줄었다 한다. 글꼴이 늦게 오면 다시 잰다. */
  useEffect(() => {
    const fit = () => {
      const el = ref.current?.children[i] as HTMLElement | undefined
      if (el) setW(el.offsetWidth)
    }
    fit()
    document.fonts?.ready.then(fit)
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [i, list.length])

  return (
    <span className="ch-reel" style={{ width: w }} aria-hidden="true">
      <span
        ref={ref}
        className={`ch-reel-list${jump ? ' jump' : ''}`}
        style={{ transform: `translateY(${-i * 1.2}em)` }}
      >
        {list.map((t, k) => <span key={k}>{t}</span>)}
      </span>
    </span>
  )
}

export function JobStream({ posts, still }: { posts: CareerPost[]; still: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const rows = posts.length >= 4 ? 2 : 1

  useEffect(() => {
    const el = box.current
    if (!el || still || !posts.length) return
    const lines = Array.from(el.querySelectorAll<HTMLElement>('.ch-stream-row'))
    const xs = lines.map((r, k) => (k ? -r.scrollWidth / 2 : 0))
    let boost = 0, lastY = window.scrollY, paused = false, seen = false, raf = 0, prev = performance.now()

    const onScroll = () => {
      boost = Math.min(boost + Math.abs(window.scrollY - lastY) * 0.06, 9)
      lastY = window.scrollY
    }
    const stop = () => { paused = true }
    const go = () => { paused = false }
    const tick = (now: number) => {
      const dt = Math.min(now - prev, 50) / 16.67
      prev = now
      boost *= 0.94
      const v = paused ? 0 : 0.5 + boost
      lines.forEach((r, k) => {
        const half = r.scrollWidth / 2
        xs[k] -= v * dt * (k ? -1 : 1)
        if (xs[k] <= -half) xs[k] += half
        if (xs[k] > 0) xs[k] -= half
        r.style.transform = `translate3d(${xs[k]}px,0,0)`
      })
      raf = seen ? requestAnimationFrame(tick) : 0
    }
    /* 화면 밖에서는 멈춘다 — 안 보이는 걸 그리느라 배터리를 쓰지 않게 */
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting
      if (seen && !raf) { prev = performance.now(); raf = requestAnimationFrame(tick) }
    })
    io.observe(el)
    window.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('mouseenter', stop)
    el.addEventListener('mouseleave', go)
    el.addEventListener('focusin', stop)
    el.addEventListener('focusout', go)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      el.removeEventListener('mouseenter', stop)
      el.removeEventListener('mouseleave', go)
      el.removeEventListener('focusin', stop)
      el.removeEventListener('focusout', go)
    }
  }, [posts, still])

  if (!posts.length) return null

  const chip = (p: CareerPost, key: string, copy: boolean) => (
    <Link key={key} href={`/careers/${p.id}`} className="ch-chip"
      aria-hidden={copy || undefined} tabIndex={copy ? -1 : undefined}>
      {p.title}
      <small>{[p.dept, p.loc].filter(Boolean).join(' · ')}</small>
    </Link>
  )

  if (still) {
    return (
      <div className="ch-stream still">
        <div className="ch-in ch-stream-row">{posts.map(p => chip(p, p.id, false))}</div>
      </div>
    )
  }

  /* 한 줄이 화면보다 짧으면 끊겨 보이므로 8칸 이상이 되게 되풀이하고,
     그 한 벌을 두 번 이어 붙여 끝과 처음이 맞물리게 흐른다. */
  const lineOf = (k: number) => {
    const base = k ? [...posts.slice(Math.ceil(posts.length / 2)), ...posts.slice(0, Math.ceil(posts.length / 2))] : posts
    const set: CareerPost[] = []
    while (set.length < 8) set.push(...base)
    return [...set, ...set].map((p, n) => chip(p, `${k}-${n}`, n >= base.length))
  }

  return (
    <div className="ch-stream" ref={box} aria-label="열린 공고">
      {Array.from({ length: rows }, (_, k) => (
        <div className="ch-stream-row" key={k}>{lineOf(k)}</div>
      ))}
    </div>
  )
}

export function FlipWord({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const spin = () => {
      el.classList.remove('go')
      void el.offsetWidth
      el.classList.add('go')
    }
    const host = el.closest('a') || el
    host.addEventListener('mouseenter', spin)
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { spin(); io.disconnect() }
    }, { threshold: 0.5 })
    io.observe(el)
    return () => { host.removeEventListener('mouseenter', spin); io.disconnect() }
  }, [])

  return (
    <span className="tc-word tc-flip" ref={ref}>
      {text.split('').map((c, k) => <span key={k} style={{ '--i': k } as CSSProperties}>{c}</span>)}
    </span>
  )
}
