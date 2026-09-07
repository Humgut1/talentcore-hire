'use client'
/* =========================================================
   외부 면접관 링크 ④ — 가능한 시간 알려주기 (전체화면)
   ---------------------------------------------------------
   계산은 lib/availability.ts 가 한다. 여기서는 격자를 그리고 클릭을 받는다.
   조작 규칙 (모두 '클릭 수를 줄인다' 하나에서 나온다):
     · 근무시간 전체가 이미 '가능'으로 켜져 있다. 사람은 안 되는 것만 끈다.
     · 드래그로 여러 칸을 한 번에 끄고 켤 수 있다.
     · 요일·시간대 머리를 누르면 그 줄 전체가 토글된다.
     · 캘린더에 이미 일정이 있는 칸은 회색으로 잠겨 있다.
   요약은 '몇 칸'이 아니라 '면접 몇 건이 들어가는지'로 말한다.
   디자인 규칙: 색은 상태에만. 선택 표시는 '내가 고른 것'이라 인디고를 쓴다.
   ========================================================= */
import { useMemo, useRef, useState } from 'react'
import { EXT_CSS } from '../lib/extshell'
import {
  cellKey, capacity, toBusy, label, type AvailGrid,
} from '../lib/availability'
import { saveAvailability } from '../lib/actions'

const softFail = (r?: string) =>
  r === 'not-configured' ||
  !!(r && (r.indexOf('does not exist') >= 0 || r.indexOf('schema cache') >= 0))

export default function AvailClient({ data }: { data: AvailGrid }) {
  const days = data.days ?? []
  const times = data.times ?? []
  const busy = useMemo(() => new Set(data.busy ?? []), [data.busy])

  const [open, setOpen] = useState<Set<string>>(() => new Set(data.open ?? []))
  const [busyState, setBusyState] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  /* 드래그 상태 — 시작한 칸이 켜져 있었으면 '끄는 드래그', 아니면 '켜는 드래그'.
     드래그 중에 켜고 끄기가 섞이면 손이 미끄러졌을 때 판이 엉망이 된다. */
  const drag = useRef<null | boolean>(null)

  if (!data.ok) {
    return (
      <div className="ivp-root">
        <style>{EXT_CSS}</style>
        <div className="ivp-card">
          <div className="ivp-body">
            <h1 className="ivp-h1">링크를 확인할 수 없어요</h1>
            <p className="ivp-lead">유효하지 않은 링크입니다. 담당자에게 다시 요청해 주세요.</p>
          </div>
        </div>
      </div>
    )
  }

  const set = (k: string, on: boolean) => {
    if (busy.has(k)) return
    setOpen(prev => {
      if (prev.has(k) === on) return prev
      const n = new Set(prev)
      if (on) n.add(k); else n.delete(k)
      return n
    })
    setSaved(false)
  }

  const down = (k: string) => {
    if (busy.has(k)) return
    const on = !open.has(k)
    drag.current = on
    set(k, on)
  }
  const enter = (k: string) => { if (drag.current !== null) set(k, drag.current) }
  const up = () => { drag.current = null }

  const toggleCol = (date: string) => {
    const keys = times.map(t => cellKey(date, t)).filter(k => !busy.has(k))
    const allOn = keys.every(k => open.has(k))
    setOpen(prev => {
      const n = new Set(prev)
      keys.forEach(k => { if (allOn) n.delete(k); else n.add(k) })
      return n
    })
    setSaved(false)
  }
  const toggleRow = (t: number) => {
    const keys = days.map(d => cellKey(d.date, t)).filter(k => !busy.has(k))
    const allOn = keys.every(k => open.has(k))
    setOpen(prev => {
      const n = new Set(prev)
      keys.forEach(k => { if (allOn) n.delete(k); else n.add(k) })
      return n
    })
    setSaved(false)
  }

  /* 빠른 선택 — 실제로 자주 나오는 답변 세 가지를 버튼 하나로. */
  const quick = (kind: 'all' | 'none' | 'am' | 'pm') => {
    const mid = 12 * 60
    const n = new Set<string>()
    if (kind !== 'none') {
      for (const d of days) for (const t of times) {
        const k = cellKey(d.date, t)
        if (busy.has(k)) continue
        if (kind === 'all') n.add(k)
        else if (kind === 'am' && t < mid) n.add(k)
        else if (kind === 'pm' && t >= mid) n.add(k)
      }
    }
    setOpen(n)
    setSaved(false)
  }

  const openArr = Array.from(open)
  const cap = capacity(days, times, openArr, 60)

  async function save() {
    if (busyState) return
    setBusyState(true); setErr('')
    try {
      const blocks = toBusy(days, times, openArr)
      const r = await saveAvailability(data.uid!, data.wh!, blocks)
      if (!r.ok && !softFail(r.reason)) {
        setErr('저장하지 못했습니다 (' + (r.reason ?? '알 수 없는 오류') + ')')
        return
      }
      setSaved(true)
    } catch {
      setErr('저장하지 못했습니다. 잠시 뒤 다시 눌러주세요.')
    } finally { setBusyState(false) }
  }

  return (
    <div className="ivp-root" onMouseUp={up} onMouseLeave={up}>
      <style>{EXT_CSS}</style>
      <div className="ivp-card">
        <div className="ivp-brand">
          <span className="ivp-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h4l2-6 4 12 2-6h4" />
            </svg>
          </span>
          <span className="ivp-wm">Cadence</span>
          <span className="ivp-wm-sub">가능한 시간</span>
        </div>

        <div className="ivp-body ivp-body-l">
          <h1 className="ivp-h1">{data.nm} 님, 면접 가능한 시간을 알려주세요</h1>
          <p className="ivp-lead">
            앞으로 2주, {label(data.wh![0])}–{label(data.wh![1])} 안에서
            <b> 안 되는 시간만 꺼주시면</b> 됩니다. 드래그로 여러 칸을 한 번에 바꿀 수 있어요.
          </p>

          <div className="ivp-quick">
            <button type="button" onClick={() => quick('all')}>전부 가능</button>
            <button type="button" onClick={() => quick('am')}>오전만</button>
            <button type="button" onClick={() => quick('pm')}>오후만</button>
            <button type="button" onClick={() => quick('none')}>전부 해제</button>
          </div>

          <div className="ivp-cal">
            <div
              className="ivp-cal-grid"
              style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(38px, 1fr))` }}
            >
              <div className="ivp-cal-h" />
              {days.map(d => (
                <button
                  key={d.date}
                  type="button"
                  className={`ivp-cal-h${d.wknd ? ' wknd' : ''}`}
                  onClick={() => toggleCol(d.date)}
                  title="이 날 전체 켜기 / 끄기"
                >{d.md}<br />{d.dow}</button>
              ))}

              {times.map(t => (
                <div key={t} style={{ display: 'contents' }}>
                  <button
                    type="button"
                    className="ivp-cal-t"
                    onClick={() => toggleRow(t)}
                    title="이 시간대 전체 켜기 / 끄기"
                  >{label(t)}</button>
                  {days.map(d => {
                    const k = cellKey(d.date, t)
                    const isBusy = busy.has(k)
                    const on = open.has(k)
                    return (
                      <div
                        key={k}
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${d.md} ${label(t)}`}
                        tabIndex={isBusy ? -1 : 0}
                        className={`ivp-cell${isBusy ? ' busy' : on ? ' on' : ''}`}
                        onMouseDown={e => { e.preventDefault(); down(k) }}
                        onMouseEnter={() => enter(k)}
                        onKeyDown={e => {
                          if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); set(k, !on) }
                        }}
                        title={isBusy ? '이미 일정이 있습니다' : undefined}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="ivp-legend">
            <span><i style={{ background: 'var(--brand-soft, #efeefc)', boxShadow: 'inset 0 0 0 1.5px var(--brand, #5b53d6)' }} /> 가능</span>
            <span><i style={{ background: 'var(--canvas, #fff)', boxShadow: 'inset 0 0 0 1px var(--line, #ececf0)' }} /> 불가</span>
            <span><i style={{ background: 'var(--sunken, #f6f6f8)' }} /> 이미 일정 있음</span>
          </div>

          <div className={`ivp-count${cap.thin ? ' thin' : ''}`}>
            {cap.fits === 0
              ? '지금 상태로는 60분짜리 면접을 넣을 자리가 없습니다.'
              : <>고르신 시간 <b>{cap.hours.toFixed(1)}시간</b> · 60분 면접을 최대 <b>{cap.fits}건</b>까지 넣을 수 있습니다.
                {cap.thin ? ' 3건 미만이면 일정을 잡다가 막히는 경우가 많습니다.' : ''}</>}
          </div>

          {err ? <div className="ivp-err">{err}</div> : null}

          <div className="ivp-foot">
            <button
              type="button"
              className="ivp-cta"
              onClick={save}
              disabled={busyState}
            >{busyState ? '저장 중…' : saved ? '저장됨 · 다시 저장' : '이 시간으로 저장'}</button>
            {saved ? (
              <span className="ivp-fine" style={{ color: 'var(--done, #0a9459)' }}>
                담당자에게 전달되었습니다. 이 링크에서 언제든 다시 바꿀 수 있어요.
              </span>
            ) : null}
          </div>

          <p className="ivp-fine" style={{ marginTop: 12 }}>
            저장하시면 담당자가 이 시간 안에서만 면접을 제안합니다.
            일정이 바뀌면 이 링크를 다시 열어 수정해 주세요.
          </p>
        </div>
      </div>

      <div className="ivp-brandline">
        <span className="ivp-mark-sm" aria-hidden />
        Cadence · TalentCore Hire
      </div>
    </div>
  )
}
