'use client'

/* =========================================================
   공고 설정 — 전형 단계 편집 (실동작)
   ---------------------------------------------------------
   · 단계 이름/체류일/면접 길이/면접관 지정, 드래그 순서 변경,
     프리셋·커스텀 추가, 삭제(진행 중 후보자 있으면 차단),
     그리고 공고 기본 정보 편집까지 한 화면에서 처리한다.
   · 낙관적 갱신: 화면 상태를 먼저 바꾸고, DB가 설정돼 있으면
     서버 액션으로 저장한다(미설정이면 조용히 화면만 유지).
   · 헤더를 JSX로 직접 그려, 공고명·팀·상태를 편집하면 즉시 반영된다.
   ========================================================= */
import { useRef, useState } from 'react'
import Link from 'next/link'
import { Icon } from './IconSprite'
import { KIND, type Stage, type Person, type Position } from '../lib/data'
import {
  persistStageEdit, persistStageLayout, persistAddStage,
  persistDeleteStage, persistPosition, savePositionBand, type NewStage,
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
    const { nm, sla, dur, ivs, auto } = p
    mark()
    void persistStageEdit(pid, id, { nm, sla, dur, ivs, auto }).catch(() => {})
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

  /* ---- 헤더용 파생값 ---- */
  const stMap: Record<string, string[]> =
    { open: ['ok', '오픈'], hold: ['warn', '홀드'], closed: ['', '마감'] }
  const stPill = stMap[pos.st] || stMap.open
  const tabs: [string, string, string][] = [
    ['board', '파이프라인', 'i-columns'],
    ['progress', '진행 매트릭스', 'i-rows'],
    ['setup', '공고 설정', 'i-sliders'],
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
              <span className="hint"><Icon id="i-grip" className="ic-sm" /> 끌어서 순서 변경 · 이름을 눌러 수정</span>
              <div className="right"><SaveTag /></div>
            </div>

            <div className="sheet">
              {stages.map((s, i) => {
                const drop = over?.id === s.id ? (over.pos === 'top' ? ' over-top' : ' over-bot') : ''
                return (
                  <div
                    key={s.id}
                    className={'se-row' + drop}
                    draggable={!s.rail}
                    data-s={s.id}
                    data-i={i}
                    onDragStart={() => { if (!s.rail) dragId.current = s.id }}
                    onDragOver={e => {
                      if (s.rail || !dragId.current) return
                      e.preventDefault()
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      const pos: 'top' | 'bot' = e.clientY < r.top + r.height / 2 ? 'top' : 'bot'
                      setOver(o => (o?.id === s.id && o.pos === pos ? o : { id: s.id, pos }))
                    }}
                    onDrop={() => onDrop(s.id)}
                    onDragEnd={() => { dragId.current = null; setOver(null) }}
                  >
                    {s.rail
                      ? <span className="se-grip" style={{ opacity: .25 }}><Icon id="i-lock" className="ic-sm" /></span>
                      : <span className="se-grip"><Icon id="i-grip" /></span>}
                    <i className="se-sw" style={{ background: s.color }} />
                    <input
                      className="se-name" value={s.nm} readOnly={s.rail}
                      onChange={e => setStages(l => l.map(x => (x.id === s.id ? { ...x, nm: e.target.value } : x)))}
                      onBlur={e => { if (!s.rail) patch(s.id, { nm: e.target.value.trim() || s.nm }) }}
                    />
                    <span className="se-kind">{KIND[s.kind]}</span>

                    {s.rail
                      ? <span className="se-f"><Icon id="i-lock" />고정 단계</span>
                      : (
                        <>
                          <label className="se-f" title="이 단계의 기준 체류일">
                            <Icon id="i-clock" />
                            <input
                              className="in sm w-xs" type="number" min={0} value={s.sla}
                              onChange={e => setStages(l => l.map(x => (x.id === s.id ? { ...x, sla: +e.target.value } : x)))}
                              onBlur={e => patch(s.id, { sla: Math.max(0, +e.target.value || 0) })}
                            />d
                          </label>

                          {s.kind === 'interview'
                            ? (
                              <>
                                <label className="se-f" title="면접 길이">
                                  <Icon id="i-video" />
                                  <select
                                    className="sel sm w-sm" value={s.dur}
                                    onChange={e => patch(s.id, { dur: +e.target.value })}
                                  >
                                    {DUR_OPTS.map(m => <option key={m} value={m}>{m}분</option>)}
                                  </select>
                                </label>

                                {/* 면접관 지정 */}
                                <div className="iv-pick">
                                  <Icon id="i-users" className="ic" />
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
                              </>
                            )
                            : (
                              <button
                                className="se-f as-btn" title="자동/수동 전환"
                                onClick={() => patch(s.id, { auto: !s.auto })}
                              >
                                <Icon id="i-zap" />{s.auto ? '자동' : '수동'}
                              </button>
                            )}
                        </>
                      )}

                    {!s.rail && (
                      <button className="se-del" title="단계 삭제" onClick={() => delStage(s.id)}>
                        <Icon id="i-trash" className="ic-sm" />
                      </button>
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
                <li>진행 중인 후보자가 있는 단계는 삭제할 수 없습니다.</li>
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
