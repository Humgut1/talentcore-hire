'use client'

/* =========================================================
   공고 설정 — 전형 단계 편집 (실동작)
   ---------------------------------------------------------
   · 단계 하나 = 카드 하나. 접었을 때는 "몇 번째 · 무슨 단계 · 지금 몇 명"만
     보이고, 펼치면 라벨이 붙은 칸이 나온다. 예전에는 한 줄에 입력칸 7~9개가
     라벨 없이 들어가 있어서, 어떤 칸이 무엇인지 눌러 보기 전에는 알 수 없었다.
   · 끝 단계(입사·불합격)는 순서를 바꿀 수 없으므로 목록 밖 고정 줄로 내렸다.
   · 낙관적 갱신: 화면 상태를 먼저 바꾸고, DB가 설정돼 있으면
     서버 액션으로 저장한다(미설정이면 조용히 화면만 유지).
   · 헤더를 JSX로 직접 그려, 공고명·팀·상태를 편집하면 즉시 반영된다.
   ========================================================= */
import { Fragment, useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from './IconSprite'
import { KIND, type Stage, type Person, type Position } from '../lib/data'
import {
  persistStageEdit, persistStageLayout, persistAddStage,
  persistDeleteStage, persistPosition, savePositionBand, savePositionPublic,
  type NewStage,
} from '../lib/actions'

/* 프리셋 (render.ts 의 PRESETS 와 동일) */
const PRESETS: { nm: string; kind: string; sla: number; dur: number; mode: string }[] = [
  { nm: '사전 과제', kind: 'task', sla: 5, dur: 0, mode: '—' },
  { nm: '컬처핏 인터뷰', kind: 'interview', sla: 4, dur: 60, mode: '화상' },
  { nm: '실무 인터뷰', kind: 'interview', sla: 5, dur: 90, mode: '대면' },
  { nm: '레퍼런스 체크', kind: 'screen', sla: 3, dur: 0, mode: '—' },
  { nm: '임원 면접', kind: 'interview', sla: 7, dur: 60, mode: '대면' },
  { nm: '처우 협의', kind: 'offer', sla: 3, dur: 0, mode: '—' },
]
const DUR_OPTS = [30, 45, 60, 90, 120]
const MODE_OPTS = ['대면', '화상', '전화']

/* 비레일 단계 색 램프: 연한 라벤더 → 브랜드 인디고 */
function ramp(n: number, i: number): string {
  const a = [205, 208, 236], b = [91, 83, 214]
  const t = n <= 1 ? 1 : i / (n - 1)
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * t))
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('')
}
/* 비레일 단계에 램프 색을 다시 입힌다(순서/개수 변경 시). */
function recolor(list: Stage[]): Stage[] {
  const cols = list.filter(s => !s.rail)
  let i = 0
  return list.map(s => (s.rail ? s : { ...s, color: ramp(cols.length, i++) }))
}

/* 접힌 카드에 한 줄로 붙는 요약 — 펼치지 않고도 이 단계가 어떤 단계인지 알게 한다. */
function summary(s: Stage): string {
  const bits = [`체류 ${s.sla}일`]
  if (s.kind === 'interview') {
    if (s.dur) bits.push(`${s.dur}분`)
    if (s.mode && s.mode !== '—') bits.push(s.mode)
    bits.push(s.ivs.length ? `면접관 ${s.ivs.length}명` : '면접관 미지정')
  } else {
    bits.push(s.auto ? '자동' : '수동')
  }
  return bits.join(' · ')
}

interface Toast { id: number; html: string }

export default function StageEditor(
  { pid, initialStages, people, candCounts, position }:
  {
    pid: string
    initialStages: Stage[]
    people: Person[]
    candCounts: Record<string, number>
    position: Position
  },
) {
  const [stages, setStages] = useState<Stage[]>(initialStages)
  const [pos, setPos] = useState<Position>(position)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [pick, setPick] = useState<string | null>(null) // 면접관 지정 팝오버 대상 단계 id
  const [copied, setCopied] = useState(false)  // 공개 주소를 방금 복사했는가
  const [open, setOpen] = useState<string | null>(null) // 지금 펼쳐 놓은 카드
  /* 카드 전체가 draggable 이면 안에 있는 입력칸에서 글자를 끌 때도 카드가 끌린다.
     그래서 손잡이를 누르고 있는 동안에만 그 카드를 draggable 로 켠다. */
  const [grab, setGrab] = useState<string | null>(null)
  const toastSeq = useRef(0)
  const dragId = useRef<string | null>(null)
  const [over, setOver] = useState<{ id: string; pos: 'top' | 'bot' } | null>(null)

  const cols = stages.filter(s => !s.rail)
  const rails = stages.filter(s => s.rail)
  /* 면접관으로 켜 둔 사람만, 그중에서도 재직 중인 사람만 후보로 선다(T4).
     TalentCore 직원 전원이 명부에 들어와 있지만 기본값은 '면접 안 함'이다. */
  const interviewers = people.filter(p =>
    p.active !== false && p.roles.some(r => r === '인터뷰어' || r === '하이어링 매니저'))

  /* ---- 저장 표시 ----
     이 화면에는 '수정' 버튼도 '저장' 버튼도 없다. 칸을 고치고 다른 데를 누르면
     그 순간 저장된다. 문제는 그게 눈에 안 보인다는 것 — 사람은 저장 버튼을 찾다가
     저장이 안 된 줄 알고 나간다. 그래서 화면 머리에 지금 상태를 계속 띄워 둔다:
     평소에는 '자동 저장', 방금 저장했으면 2초간 '저장됨'. */
  const [saved, setSaved] = useState(false)
  const savedT = useRef<ReturnType<typeof setTimeout> | null>(null)
  function mark() {
    setSaved(true)
    if (savedT.current) clearTimeout(savedT.current)
    savedT.current = setTimeout(() => setSaved(false), 2000)
  }
  const SaveTag = () => (
    <span className={'save-tag' + (saved ? ' on' : '')}>
      <Icon id={saved ? 'i-check-circle' : 'i-zap'} className="ic-sm" />
      {saved ? '저장됨' : '자동 저장'}
    </span>
  )

  function toast(html: string) {
    const id = ++toastSeq.current
    setToasts(t => [...t, { id, html }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
  }

  /* ---- 순서·색 저장(레이아웃) ---- */
  function saveLayout(list: Stage[]) {
    const rows = list.map((s, i) => ({ id: s.id, ord: i, color: s.color }))
    mark()
    void persistStageLayout(pid, rows).catch(() => {})
  }

  /* ---- 단계 속성 수정 ---- */
  function patch(id: string, p: Partial<Stage>) {
    setStages(list => list.map(s => (s.id === id ? { ...s, ...p } : s)))
    const { nm, sla, dur, mode, ivs, auto } = p
    mark()
    void persistStageEdit(pid, id, { nm, sla, dur, mode, ivs, auto }).catch(() => {})
  }

  /* ---- 면접관 토글 ---- */
  function toggleIv(id: string, uid: string) {
    setStages(list => list.map(s => {
      if (s.id !== id) return s
      const has = s.ivs.includes(uid)
      const ivs = has ? s.ivs.filter(x => x !== uid) : [...s.ivs, uid]
      mark()
      void persistStageEdit(pid, id, { ivs }).catch(() => {})
      return { ...s, ivs }
    }))
  }

  /* ---- 단계 추가(프리셋/커스텀) ---- */
  function addStage(preset: number | null) {
    const pz = preset != null ? PRESETS[preset] : null
    const id = 'x' + Math.abs(toastSeq.current * 131 + stages.length * 977 + (preset ?? 7) * 17 + 1).toString(36)
    const railStart = stages.findIndex(s => s.rail)
    const insertAt = railStart < 0 ? stages.length : railStart
    const base: Stage = {
      id,
      nm: pz ? pz.nm : '새 단계',
      kind: (pz ? pz.kind : 'screen') as Stage['kind'],
      sla: pz ? pz.sla : 3,
      dur: pz ? pz.dur : 0,
      mode: pz ? pz.mode : '—',
      ivs: [],
      color: '#8b86e0',
      auto: true,
    }
    const next = recolor([...stages.slice(0, insertAt), base, ...stages.slice(insertAt)])
    setStages(next)
    /* 새로 만든 단계는 이름부터 고치게 된다 — 만들자마자 펼쳐 준다. */
    setOpen(id)
    const ord = next.findIndex(s => s.id === id)
    const colored = next.find(s => s.id === id)!
    const ns: NewStage = {
      id, nm: base.nm, kind: base.kind, sla: base.sla, dur: base.dur,
      mode: base.mode, color: colored.color, auto: base.auto, ord,
    }
    void persistAddStage(pid, ns).then(() => saveLayout(next)).catch(() => {})
    toast(`<b>${base.nm}</b> 단계를 추가했습니다`)
  }

  /* ---- 단계 삭제(진행 중 후보자 있으면 차단) ---- */
  function delStage(id: string) {
    const n = candCounts[id] || 0
    const s = stages.find(x => x.id === id)
    if (n > 0) {
      toast(`진행 중인 후보자 <b>${n}명</b>이 있어 삭제할 수 없습니다`)
      return
    }
    const next = recolor(stages.filter(x => x.id !== id))
    setStages(next)
    if (open === id) setOpen(null)
    void persistDeleteStage(pid, id).then(r => {
      if (!r.ok && r.reason === 'has-candidates') {
        // 서버 재확인에서 걸리면 되돌린다.
        setStages(stages)
        toast(`진행 중인 후보자 <b>${r.count}명</b>이 있어 삭제할 수 없습니다`)
      } else {
        saveLayout(next)
      }
    }).catch(() => {})
    toast(`<b>${s?.nm ?? '단계'}</b>를 삭제했습니다`)
  }

  /* ---- 드래그 순서 변경(비레일 단계만) ---- */
  function onDrop(targetId: string) {
    const src = dragId.current
    dragId.current = null
    setGrab(null)
    const info = over
    setOver(null)
    if (!src || src === targetId) return
    const srcS = stages.find(s => s.id === src)
    if (!srcS || srcS.rail) return
    const without = stages.filter(s => s.id !== src)
    const ti = without.findIndex(s => s.id === targetId)
    if (ti < 0) return
    const at = info?.pos === 'bot' ? ti + 1 : ti
    const next = recolor([...without.slice(0, at), srcS, ...without.slice(at)])
    setStages(next)
    saveLayout(next)
  }

  /* ---- 기본 정보 저장 ---- */
  function setField<K extends keyof Position>(k: K, v: Position[K]) {
    setPos(p => ({ ...p, [k]: v }))
  }
  function saveField(k: keyof Position, v: string) {
    mark()
    void persistPosition(pid, { [k]: v }).catch(() => {})
  }

  /* 밴드는 칸 두 개가 한 쌍이라 두 값을 같이 보낸다.
     적은 값을 아래로 바꾸지는 않는다 — 하한부터 치는 사람이 대부분인데,
     그때마다 숫자가 뒤집히면 방금 친 값이 사라진 것처럼 보인다.
     앞뒷이 뒤집힌 밴드는 오퍼 화면이 그대로 경고로 잡아 준다. */
  function saveBand(lo: number, hi: number) {
    const a = Math.max(0, lo)
    const b = Math.max(0, hi)
    setPos(p => ({ ...p, band: [a, b] }))
    mark()
    void savePositionBand(pid, a, b).catch(() => {})
  }

  /* 채용 사이트에 보이는 값. 마이그레이션 012 전이면 저장은 실패하지만
     화면은 바뀐 대로 둔다 — 담당자가 방금 친 값이 사라지는 게 더 나쁘다. */
  function savePublic(patch: { pub?: boolean; loc?: string; exp?: string; due?: string }) {
    setPos(p => ({ ...p, ...patch }))
    mark()
    void savePositionPublic(pid, patch).catch(() => {})
  }

  /* ---- 헤더용 파생값 ---- */
  const stMap: Record<string, string[]> =
    { open: ['ok', '오픈'], hold: ['warn', '홀드'], closed: ['', '마감'] }
  const stPill = stMap[pos.st] || stMap.open
  const tabs: [string, string, string][] = [
    ['board', '파이프라인', 'i-columns'],
    ['progress', '진행 매트릭스', 'i-rows'],
    ['setup', '전형 단계', 'i-sliders'],
    ['auto', '자동화', 'i-zap'],
    ['links', '지원 링크', 'i-link'],
  ]

  return (
    <>
      {/* ===== 공고 헤더 (편집 내용이 실시간 반영) ===== */}
      <header className="top">
        <div className="crumb">
          <Icon id="i-briefcase" className="ic-sm" /><Link href="/positions">공고</Link>
          <span className="sep">/</span>{pos.dept}<span className="sep">/</span>{pos.team}
        </div>
        <div className="h-row">
          <h1>{pos.title}</h1>
          <span className={'pill ' + stPill[0]}><i className="dot" />{stPill[1]}</span>
          <div className="spacer">
            <Link className="btn" href={`/p/${pid}/board`}><Icon id="i-columns" className="ic-sm" />보드로</Link>
          </div>
        </div>
        <div className="meta">
          <i><Icon id="i-users" className="ic-sm" />{pos.dept} <b>{pos.team}</b></i>
          <i><Icon id="i-user" className="ic-sm" />리크루터 <b>{pos.rec}</b></i>
          <i><Icon id="i-star" className="ic-sm" />HM <b>{pos.hm}</b></i>
          <i><Icon id="i-briefcase" className="ic-sm" />고용형태 <b>{pos.emp}</b></i>
          {/* TalentCore 에서 넘어온 공고만 — 출처 표시다. 색은 쓰지 않는다. */}
          {(pos.openings ?? 1) > 1 &&
            <i><Icon id="i-users" className="ic-sm" />채용 인원 <b>{pos.openings}명</b></i>}
          {pos.reqRef &&
            <i><Icon id="i-link" className="ic-sm" />TalentCore <b>{pos.reqRef}</b></i>}
        </div>
        <nav className="tabs">
          {tabs.map(t => (
            <Link className={'tab' + (t[0] === 'setup' ? ' on' : '')} href={`/p/${pid}/${t[0]}`} key={t[0]}>
              <Icon id={t[2]} className="ic-sm" />{t[1]}
            </Link>
          ))}
        </nav>
      </header>

      {/* ===== 본문 ===== */}
      <div className="stage">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 26, alignItems: 'start' }}>
          {/* ----- 왼쪽: 단계 편집 + 기본 정보 ----- */}
          <div>
            <div className="sec-h">
              <h3>전형 단계 구성</h3><span className="n">{cols.length}단계</span>
              <span className="hint"><Icon id="i-grip" className="ic-sm" /> 손잡이를 끌어 순서 변경 · 카드를 눌러 펼치기</span>
              <div className="right"><SaveTag /></div>
            </div>

            {/* 지원자가 지나가는 순서 한눈에 — 아래 목록을 고치면 여기가 같이 바뀐다. */}
            <div className="se-flow">
              {cols.map((s, i) => (
                <Fragment key={s.id}>
                  {i > 0 && <span className="se-arrow">→</span>}
                  <button
                    type="button"
                    className={'se-step' + (open === s.id ? ' on' : '')}
                    onClick={() => setOpen(open === s.id ? null : s.id)}
                  >
                    <i style={{ background: s.color }} />
                    <span>{s.nm}</span>
                    <b>{candCounts[s.id] || 0}</b>
                  </button>
                </Fragment>
              ))}
              {rails.length > 0 && (
                <>
                  <span className="se-arrow">→</span>
                  <span className="se-step end">
                    <Icon id="i-lock" className="ic-sm" />
                    {rails.map(r => r.nm).join(' · ')}
                  </span>
                </>
              )}
            </div>

            <div className="sheet">
              {cols.map((s, i) => {
                const drop = over?.id === s.id ? (over.pos === 'top' ? ' over-top' : ' over-bot') : ''
                const n = candCounts[s.id] || 0
                const isOpen = open === s.id
                return (
                  <div
                    key={s.id}
                    className={'se-card' + drop + (isOpen ? ' open' : '')}
                    draggable={grab === s.id}
                    data-s={s.id}
                    data-i={i}
                    onDragStart={() => { dragId.current = s.id }}
                    onDragOver={e => {
                      if (!dragId.current) return
                      e.preventDefault()
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      const at: 'top' | 'bot' = e.clientY < r.top + r.height / 2 ? 'top' : 'bot'
                      setOver(o => (o?.id === s.id && o.pos === at ? o : { id: s.id, pos: at }))
                    }}
                    onDrop={() => onDrop(s.id)}
                    onDragEnd={() => { dragId.current = null; setGrab(null); setOver(null) }}
                  >
                    {/* --- 접었을 때도 보이는 머리줄 --- */}
                    <div className="se-hd" onClick={() => setOpen(isOpen ? null : s.id)}>
                      <span
                        className="se-grip"
                        title="끌어서 순서 변경"
                        onMouseDown={() => setGrab(s.id)}
                        onMouseUp={() => setGrab(null)}
                        onClick={e => e.stopPropagation()}
                      >
                        <Icon id="i-grip" />
                      </span>
                      <span className="se-no">{i + 1}</span>
                      <i className="se-sw" style={{ background: s.color }} />
                      <b className="se-nm">{s.nm}</b>
                      <span className="se-kind">{KIND[s.kind]}</span>
                      <span className={'se-cnt' + (n > 0 ? ' on' : '')}>지금 {n}명</span>
                      <span className="se-sum">{summary(s)}</span>
                      {/* 삭제는 눌러 보고 나서 막히면 늦다 — 막힌 이유를 먼저 보여 준다. */}
                      {n > 0
                        ? (
                          <span className="se-locked" title={`이 단계에 후보자 ${n}명이 서 있습니다`}>
                            <Icon id="i-lock" className="ic-sm" />{n}명이 서 있어 삭제 불가
                          </span>
                        )
                        : (
                          <button
                            className="se-del" title="단계 삭제"
                            onClick={e => { e.stopPropagation(); delStage(s.id) }}
                          >
                            <Icon id="i-trash" className="ic-sm" />
                          </button>
                        )}
                      <span className={'se-tog' + (isOpen ? ' up' : '')}>
                        <Icon id="i-chevron" className="ic-sm" />
                      </span>
                    </div>

                    {/* --- 펼쳤을 때: 라벨이 붙은 칸 --- */}
                    {isOpen && (
                      <div className="se-body">
                        <div className="se-fields">
                          <div className="field">
                            <label>단계 이름</label>
                            <input
                              className="in" value={s.nm}
                              onChange={e => setStages(l => l.map(x => (x.id === s.id ? { ...x, nm: e.target.value } : x)))}
                              onBlur={e => patch(s.id, { nm: e.target.value.trim() || s.nm })}
                            />
                          </div>
                          <div className="field">
                            <label>기준 체류일</label>
                            <div className="se-unit">
                              <input
                                className="in" type="number" min={0} value={s.sla}
                                onChange={e => setStages(l => l.map(x => (x.id === s.id ? { ...x, sla: +e.target.value } : x)))}
                                onBlur={e => patch(s.id, { sla: Math.max(0, +e.target.value || 0) })}
                              />
                              <span>일</span>
                            </div>
                            <p className="se-hlp">이 날짜를 넘긴 후보자 카드는 보드에서 지연으로 바뀝니다.</p>
                          </div>

                          {/* 면접 단계에만 있는 칸 — 다른 단계에서는 아예 그리지 않는다. */}
                          {s.kind === 'interview' && (
                            <>
                              <div className="field">
                                <label>면접 길이</label>
                                <select
                                  className="sel" value={s.dur}
                                  onChange={e => patch(s.id, { dur: +e.target.value })}
                                >
                                  {DUR_OPTS.map(m => <option key={m} value={m}>{m}분</option>)}
                                </select>
                                <p className="se-hlp">캘린더에서 이만큼 비어 있는 시간을 찾습니다.</p>
                              </div>
                              <div className="field">
                                <label>진행 형태</label>
                                <select
                                  className="sel" value={MODE_OPTS.includes(s.mode) ? s.mode : ''}
                                  onChange={e => patch(s.id, { mode: e.target.value })}
                                >
                                  {!MODE_OPTS.includes(s.mode) && <option value="">미정</option>}
                                  {MODE_OPTS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <p className="se-hlp">후보자에게 나가는 안내에 이대로 적힙니다.</p>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="se-fl">
                          <label>진행 방식</label>
                          <div className="se-seg">
                            <button
                              className={'se-badge' + (s.auto ? ' on' : '')}
                              onClick={() => patch(s.id, { auto: true })}
                            >
                              <Icon id="i-zap" className="ic-sm" />자동
                            </button>
                            <button
                              className={'se-badge' + (!s.auto ? ' on' : '')}
                              onClick={() => patch(s.id, { auto: false })}
                            >
                              <Icon id="i-user" className="ic-sm" />수동
                            </button>
                          </div>
                          <p className="se-hlp">
                            {s.auto
                              ? '사람이 붙지 않아도 넘어가는 단계로 표시됩니다.'
                              : '사람이 직접 확인하고 넘기는 단계로 표시됩니다.'}
                          </p>
                        </div>

                        {s.kind === 'interview' && (
                          <div className="se-fl">
                            <label>면접관</label>
                            <div className="iv-pick">
                              {s.ivs.length === 0 && <span className="iv-none">미지정</span>}
                              {s.ivs.map(uid => {
                                const u = people.find(p => p.id === uid)
                                if (!u) return null
                                return (
                                  <span className={'iv-chip' + (u.ea ? ' ea' : '')} key={uid}>
                                    {u.nm}{u.ea && <b>EA</b>}
                                    <button className="iv-x" title="제외" onClick={() => toggleIv(s.id, uid)}>
                                      <Icon id="i-x" className="ic-sm" />
                                    </button>
                                  </span>
                                )
                              })}
                              <button className="iv-add" onClick={() => setPick(pick === s.id ? null : s.id)}>
                                <Icon id="i-plus" className="ic-sm" />
                              </button>

                              {pick === s.id && (
                                <>
                                  <div className="iv-backdrop" onClick={() => setPick(null)} />
                                  <div className="iv-menu">
                                    <div className="iv-menu-h">면접관 선택</div>
                                    {interviewers.map(u => {
                                      const on = s.ivs.includes(u.id)
                                      return (
                                        <button
                                          className={'iv-opt' + (on ? ' on' : '')} key={u.id}
                                          onClick={() => toggleIv(s.id, u.id)}
                                        >
                                          <i className="iv-ck">{on && <Icon id="i-mark" className="ic-sm" />}</i>
                                          <span className="iv-nm">{u.nm}</span>
                                          <span className="iv-tt">{u.tt}</span>
                                          {u.ea && <span className="iv-ea">EA</span>}
                                        </button>
                                      )
                                    })}
                                    {s.ivs.some(uid => people.find(p => p.id === uid)?.ea) && (
                                      <div className="iv-note">
                                        <Icon id="i-info" className="ic-sm" />
                                        EA 조율 대상이 있어 이 단계는 자동화에서 제외됩니다.
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            <p className="se-hlp">
                              여기 넣은 사람의 캘린더에서 빈 시간을 찾습니다.
                              EA 조율 대상이 한 명이라도 있으면 이 단계는 자동 조율에서 빠집니다.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              <button className="se-add" onClick={() => addStage(null)}>
                <Icon id="i-plus" className="ic-sm" />단계 추가
              </button>
            </div>

            <div className="preset">
              {PRESETS.map((pz, i) => (
                <button key={i} onClick={() => addStage(i)}>
                  <Icon id="i-plus" className="ic-sm" />{pz.nm}
                </button>
              ))}
            </div>

            {/* 끝 단계는 순서를 바꿀 수도, 지울 수도 없다. 그래서 끄는 목록에서 빼고
                아래 고정 줄로 내렸다 — 목록 안에 섞여 있으면 끌리는 줄 알고 잡는다. */}
            {rails.length > 0 && (
              <div className="se-rails">
                <span className="se-rails-t">
                  <Icon id="i-lock" className="ic-sm" />끝 단계 — 순서와 이름이 고정입니다
                </span>
                {rails.map(r => (
                  <span className="se-rail" key={r.id}>
                    <i className="se-sw" style={{ background: r.color }} />
                    <b>{r.nm}</b>
                    <span>{candCounts[r.id] || 0}명</span>
                  </span>
                ))}
              </div>
            )}

            {/* ----- 기본 정보 ----- */}
            <div className="sec-h" style={{ marginTop: 26 }}>
              <h3>기본 정보</h3>
              <span className="hint">칸을 고치고 다른 곳을 누르면 그대로 저장됩니다 — 따로 누를 저장 버튼이 없습니다</span>
              <div className="right"><SaveTag /></div>
            </div>
            <div className="sheet" style={{ padding: '16px 18px' }}>
              <div className="row2">
                <div className="field">
                  <label>공고명</label>
                  <input
                    className="in" value={pos.title}
                    onChange={e => setField('title', e.target.value)}
                    onBlur={e => saveField('title', e.target.value.trim() || pos.title)}
                  />
                </div>
                <div className="field">
                  <label>고용형태</label>
                  <select
                    className="sel" value={pos.emp}
                    onChange={e => { setField('emp', e.target.value); saveField('emp', e.target.value) }}
                  >
                    {['정규직', '계약직', '인턴', '파견'].map(x => <option key={x}>{x}</option>)}
                  </select>
                </div>
              </div>
              <div className="row3">
                <div className="field">
                  <label>부문</label>
                  <select
                    className="sel" value={pos.dept}
                    onChange={e => { setField('dept', e.target.value); saveField('dept', e.target.value) }}
                  >
                    {['플랫폼본부', '프로덕트본부', '사업본부'].map(x => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>팀</label>
                  <input
                    className="in" value={pos.team}
                    onChange={e => setField('team', e.target.value)}
                    onBlur={e => saveField('team', e.target.value.trim() || pos.team)}
                  />
                </div>
                <div className="field">
                  <label>상태</label>
                  <select
                    className="sel" value={pos.st}
                    onChange={e => { setField('st', e.target.value as Position['st']); saveField('st', e.target.value) }}
                  >
                    <option value="open">오픈</option>
                    <option value="hold">홀드</option>
                    <option value="closed">마감</option>
                  </select>
                </div>
              </div>
              {/* 연봉 밴드 — 공고를 열 뒤에도 고칠 수 있어야 한다.
                  처우는 공고를 먼저 열고 나중에 정해지는 일이 흔하고,
                  오퍼 초안이 이 값을 그대로 복사해 가기 때문이다. */}
              <div className="row2">
                <div className="field">
                  <label>연봉 밴드 하한 (만원)</label>
                  <input
                    className="in" type="number" min={0}
                    value={pos.band ? pos.band[0] : 0}
                    onChange={e => setField('band', [Number(e.target.value) || 0, pos.band ? pos.band[1] : 0])}
                    onBlur={e => saveBand(Number(e.target.value) || 0, pos.band ? pos.band[1] : 0)}
                  />
                </div>
                <div className="field">
                  <label>연봉 밴드 상한 (만원)</label>
                  <input
                    className="in" type="number" min={0}
                    value={pos.band ? pos.band[1] : 0}
                    onChange={e => setField('band', [pos.band ? pos.band[0] : 0, Number(e.target.value) || 0])}
                    onBlur={e => saveBand(pos.band ? pos.band[0] : 0, Number(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="field">
                <label>JD</label>
                <textarea
                  className="ta" value={pos.jd}
                  onChange={e => setField('jd', e.target.value)}
                  onBlur={e => saveField('jd', e.target.value)}
                />
              </div>
            </div>

            {/* ----- 채용 사이트 ----- */}
            <div className="sec-h" style={{ marginTop: 26 }}>
              <h3>채용 사이트</h3>
              <span className="hint">여기서 켜면 회사 채용 페이지에 바로 올라갑니다</span>
            </div>
            <div className="sheet" style={{ padding: '16px 18px' }}>
              <div className="se-pub">
                <button
                  className={'sw' + (pos.pub !== false ? ' on' : '')}
                  aria-pressed={pos.pub !== false}
                  onClick={() => savePublic({ pub: pos.pub === false })}
                />
                <div>
                  <b>{pos.pub !== false ? '채용 사이트에 걸려 있습니다' : '채용 사이트에서 내려갔습니다'}</b>
                  <span>
                    {pos.st === 'open'
                      ? pos.pub !== false
                        ? '누구나 공고를 보고 지원할 수 있습니다.'
                        : '주소를 아는 사람이 직접 들어와도 열리지 않습니다. 진행 중인 후보자는 그대로입니다.'
                      : '공고 상태가 오픈이 아니라서, 켜 두어도 채용 사이트에는 보이지 않습니다.'}
                  </span>
                </div>
              </div>

              <div className="row3" style={{ marginTop: 14 }}>
                <div className="field">
                  <label>근무지</label>
                  <input
                    className="in" value={pos.loc ?? ''} placeholder="서울 강남"
                    onChange={e => setField('loc', e.target.value)}
                    onBlur={e => savePublic({ loc: e.target.value.trim() })}
                  />
                </div>
                <div className="field">
                  <label>경력 요건</label>
                  <input
                    className="in" value={pos.exp ?? ''} placeholder="경력 3년 이상"
                    onChange={e => setField('exp', e.target.value)}
                    onBlur={e => savePublic({ exp: e.target.value.trim() })}
                  />
                </div>
                <div className="field">
                  <label>마감일</label>
                  <input
                    className="in" type="date" value={pos.due ?? ''}
                    onChange={e => savePublic({ due: e.target.value })}
                  />
                </div>
              </div>
              <span className="hint" style={{ display: 'block', marginTop: 8 }}>
                마감일을 비워 두면 공고에 <b>상시 채용</b>으로 표시되고, 지원은 계속 받습니다.
              </span>

              <div className="se-url">
                <code>{`/careers/${pid}`}</code>
                <button
                  className="btn"
                  onClick={() => {
                    const url = `${window.location.origin}/careers/${pid}`
                    void navigator.clipboard.writeText(url).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1600)
                    }).catch(() => {})
                  }}
                >
                  <Icon id="i-link" className="ic-sm" />{copied ? '복사됨' : '공개 주소 복사'}
                </button>
                <a className="btn quiet" href={`/careers/${pid}`} target="_blank" rel="noreferrer">
                  지원자 화면으로 보기
                </a>
              </div>
            </div>
          </div>

          {/* ----- 오른쪽: 안내 ----- */}
          <div>
            <div className="sec-h"><h3>단계 구성이 하는 일</h3></div>
            <div className="sheet" style={{ padding: '15px 16px' }}>
              <InfoRow i="i-columns" t="파이프라인 열" d="여기서 만든 단계가 곧 보드의 열이 됩니다." />
              <InfoRow i="i-clock" t="기준 체류일" d="초과하면 카드가 주황(지연)으로 바뀝니다." />
              <InfoRow i="i-video" t="면접 길이" d="캘린더 교집합을 찾을 블록 길이입니다. 2시간이면 연속 2시간을 찾습니다." />
              <InfoRow i="i-users" t="면접관" d="EA 조율 대상이 한 명이라도 있으면 그 단계는 자동화에서 제외됩니다." />
            </div>
            <div className="note" style={{ marginTop: 14 }}>
              <h4><Icon id="i-info" className="ic-sm" />주의</h4>
              <ul>
                <li>후보자가 서 있는 단계는 삭제할 수 없습니다 — 카드에 몇 명인지 같이 적혀 있습니다.</li>
                <li><b>입사 · 불합격</b>은 종료 단계라 순서와 이름이 고정입니다.</li>
                <li>단계를 바꿔도 이미 지나간 후보자의 이력은 그대로 보존됩니다.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ===== 토스트 ===== */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div className="toast" key={t.id}>
            <Icon id="i-mark" className="ic" />
            <span dangerouslySetInnerHTML={{ __html: t.html }} />
          </div>
        ))}
      </div>
    </>
  )
}

function InfoRow({ i, t, d }: { i: string; t: string; d: string }) {
  return (
    <div style={{ display: 'flex', gap: 9, padding: '7px 0' }}>
      <Icon id={i} className="ic" />
      <div>
        <b style={{ fontSize: 12.5 }}>{t}</b>
        <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 1 }}>{d}</div>
      </div>
    </div>
  )
}
