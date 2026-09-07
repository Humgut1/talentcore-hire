'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from './IconSprite'
import {
  cands as staticCands, stagesOf, stageById, posById, personById,
  company, md, byRisk, LABEL,
  type Candidate, type Status, type Stage, type Position,
} from '../lib/data'
import { persistMove, persistCand, addCandidate, assignMeeting, meetingPicker, searchMeetingSlots, confirmMeeting,
  bulkAdvance, bulkReject, bulkMail } from '../lib/actions'
import { REJECT_REASONS, rejectDef, rejectMailDraft, type RejectCode } from '../lib/decision'
import { MAIL_TPLS, tplByCode } from '../lib/cand-mail'
import { mtgViews, type MtgView } from '../lib/meetings'
import BulkSend from './BulkSend'

const STATUS_KEYS: Status[] = ['esc', 'late', 'idle', 'done']

const SRC_OPTS = ['리멤버', '원티드', '링크드인', '자사채용', '추천']

interface Toast { id: number; html: string; undo?: () => void }

/* 서버 페이지가 DB에서 읽은 후보자/미팅을 props로 넘긴다.
   props가 없으면(예: 미연결) 정적 샘플 데이터로 동작한다. */
export default function Board(
  { pid = 'p1', initialCands, mtgs: mtgsProp, initialStages, pos }:
  { pid?: string; initialCands?: Candidate[]; mtgs?: MtgView[]; initialStages?: Stage[]; pos?: Position },
) {
  const PID = pid
  const [list, setList] = useState<Candidate[]>(initialCands ?? staticCands)
  const [filter, setFilter] = useState<Status | null>(null)
  const [hideIdle, setHideIdle] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(0)
  const dragId = useRef<string | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)

  /* 공고 정보는 서버가 준 것을 먼저 쓴다 — 새로 만든 공고는 클라이언트 번들에 없다. */
  const p = pos ?? posById(PID)
  const stages = initialStages ?? stagesOf(PID)
  /* 미팅은 저장된 상태가 아니라 '지금 계산한 상태'다(meetings.ts).
     서버가 계산해 넘겨주고, 여기서 지정·확정한 결과만 그 자리에서 덮어쓴다. */
  const [mtgs, setMtgs] = useState<MtgView[]>(mtgsProp ?? mtgViews(PID))
  const cols = stages.filter(sg => !sg.rail) // 후보자가 놓일 수 있는 단계(레일 제외)

  /* ---- 후보자 추가 모달 ---- */
  const [addStage, setAddStage] = useState<string | null>(null) // null=닫힘
  const emptyForm = { nm: '', yr: '', role: '', src: SRC_OPTS[0] }
  const [form, setForm] = useState(emptyForm)
  function openAdd(stageId?: string) {
    setForm(emptyForm)
    setAddStage(stageId ?? cols[0]?.id ?? 's1')
  }
  function submitAdd() {
    const nm = form.nm.trim()
    if (!nm || !addStage) return
    const sg = stageById(PID, addStage)
    const why = sg.kind === 'screen' ? 'HM 검토 요청 발송'
      : sg.kind === 'interview' ? `${sg.dur}분 블록 탐색 중`
      : sg.kind === 'offer' ? '오퍼 승인 대기' : ''
    const nc: Candidate = {
      id: crypto.randomUUID(), nm, p: PID, st: addStage, s: 'idle', d: 0,
      ap: '2026-08-12', en: '2026-08-12', why,
      src: form.src, yr: Number(form.yr) || 0, role: form.role.trim() || '—',
    }
    setList(l => [...l, nc])
    void addCandidate({
      id: nc.id, pid: PID, nm: nc.nm, st: nc.st, s: nc.s,
      yr: nc.yr, role: nc.role, src: nc.src, why: nc.why,
    })
    setAddStage(null)
    pushToast(`<b>${nm}</b> 후보자를 <b>${sg.nm}</b> 단계에 추가했습니다`)
  }

  /* ---- 후보자 서랍 ----
     카드를 누르면 주소가 바뀐다(?c=후보자). 서버가 그 사람에 대해 아는 전부를 한 번에 모아
     서랍 한 채로 내려보내고, 조율·판정·평가·오퍼·메일이 전부 그 안에서 끝난다.
     보드는 '누가 열렸는지'조차 들고 있지 않다 — 진실은 주소 하나뿐이라 링크로 넘길 수도 있다. */
  const router = useRouter()
  const path = usePathname()
  const openView = (id: string) => router.push(`${path}?c=${id}`, { scroll: false })

  /* ---- 함께 보내기(선착순) ----
     여러 후보자에게 **같은 자리**를 함께 내고 먼저 고른 분이 가져간다.
     고르는 일은 원래 보드에서 일어나므로 체크도 여기 있다 — 예전처럼 조율 화면으로 건너가지 않는다. */
  const [sel, setSel] = useState<string[]>([])
  const [bulk, setBulk] = useState(false)
  const toggleSel = (id: string) =>
    setSel(l => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]))

  /* ---- 한 번에 처리하기 ----
     합격·불합격·메일은 한 명일 때 쓰는 함수를 그대로 여러 번 부른다.
     불합격과 메일은 되돌릴 수 없어서(통보가 나간다) 확인 한 단계를 둔다. */
  const [ask, setAsk] = useState<null | 'pass' | 'reject' | 'mail'>(null)
  const [rjCode, setRjCode] = useState<string>(REJECT_REASONS[0]?.v ?? '')
  const [rjMemo, setRjMemo] = useState('')
  const [tpl, setTpl] = useState(MAIL_TPLS[0]?.v ?? '')
  const [busy, run] = useTransition()

  /* 통보 메일 — 판정과 한 창에서 정한다.
     판정만 저장하고 통보는 따로 보내게 두면, 떨어뜨린 사람이 아무 연락도 못 받은 채
     남는 일이 실제로 생긴다. 그래서 기본값은 '보낸다'이고, 끄는 것은 명시적인 선택이다.
     null = 보내지 않음 · 'auto' = 사유와 단계에 맞춰 본문을 지어서 보냄. */
  const [passMail, setPassMail] = useState<string | null>('doc-pass')
  const [rjMail, setRjMail] = useState<string | null>('auto')

  /* 처리한 사람은 열에서 사라지거나 다른 열로 옮겨간다.
     서버가 진실이므로 화면을 손으로 고치지 않고 그대로 다시 받아 온다. */
  const done = (label: string) => { setSel([]); setAsk(null); router.refresh(); pushToast(label) }
  /* 확인 창에 '누구를' 을 적어 준다 — 숫자만 보고 누르면 잘못 고른 걸 알 수 없다. */
  const selNames = (() => {
    const nms = sel.map(id => list.find(c => c.id === id)?.nm).filter(Boolean) as string[]
    return nms.length <= 4 ? nms.join(' · ') : `${nms.slice(0, 4).join(' · ')} 외 ${nms.length - 4}명`
  })()
  const report = (
    r: { ok: number; fail: { nm: string }[]; mail?: { sent: number; failed: number; why?: string } },
    verb: string,
  ) =>
    `<b>${r.ok}명</b> ${verb}` +
    (r.fail.length ? ` · ${r.fail.length}명은 처리하지 못했습니다 (${r.fail.slice(0, 3).map(f => f.nm).join(', ')}${r.fail.length > 3 ? ' 외' : ''})` : '') +
    /* 판정과 통보는 따로 말한다 — 메일이 못 나가도 판정은 이미 저장됐다. */
    (r.mail
      ? ` · 통보 메일 <b>${r.mail.sent}통</b> 발송` +
        (r.mail.failed
          ? `, <b>${r.mail.failed}통</b>은 나가지 못했습니다${r.mail.why === 'not-configured' ? ' (메일 발송이 아직 연결되지 않았습니다)' : ''}`
          : '')
      : '')

  function doPass() {
    run(async () => { const r = await bulkAdvance(sel, passMail); done(report(r, '다음 단계로 보냈습니다')) })
  }
  function doReject() {
    run(async () => {
      const r = await bulkReject(sel, rjCode, rjMemo, rjMail)
      done(report(r, '불합격 처리했습니다')); setRjMemo('')
    })
  }
  function doMail() {
    run(async () => { const r = await bulkMail(sel, tpl); done(report(r, '에게 메일을 보냈습니다')) })
  }

  /* ---- 나갈 메일 미리보기 ----
     본문을 짓는 함수가 순수 함수라 서버에 묻지 않고 여기서 그대로 만들 수 있다.
     고른 사람이 여러 명이면 첫 사람 기준으로 보여 준다 — 나머지는 이름과 단계만 바뀐다. */
  const pv = list.find(c => c.id === sel[0])
  const pvNext = (() => {
    if (!pv) return null
    const line = stages.filter(sg => !sg.rail)
    return line[line.findIndex(sg => sg.id === pv.st) + 1] ?? null
  })()
  /* 합격 통보의 기본값은 '다음 단계가 무엇이냐'에 달렸다.
     지원 접수 → 서류 검토처럼 안에서만 움직이는 경우엔 후보자에게 알릴 소식이 아니다.
     인터뷰·과제로 넘어갈 때만 기본으로 켠다. */
  const defaultPassMail = () => {
    const c = list.find(x => x.id === sel[0])
    if (!c) return null
    const line = stages.filter(sg => !sg.rail)
    const nx = line[line.findIndex(sg => sg.id === c.st) + 1]
    return nx && (nx.kind === 'interview' || nx.kind === 'task') ? 'doc-pass' : null
  }
  const passDraft = (() => {
    if (!pv || !passMail) return null
    const t = tplByCode(passMail)
    if (!t) return null
    return t.make({
      cand: pv.nm, pos: p.title, stage: pvNext?.nm ?? stageById(PID, pv.st).nm,
      rc: p.rec, company: 'TalentCore',
    })
  })()
  const rjDraft = (() => {
    if (!pv || !rjMail || !rjCode) return null
    if (rjMail !== 'auto') {
      const t = tplByCode(rjMail)
      return t ? t.make({
        cand: pv.nm, pos: p.title, stage: stageById(PID, pv.st).nm,
        rc: p.rec, company: 'TalentCore',
      }) : null
    }
    return rejectMailDraft({
      cand: pv.nm, pos: p.title, stage: stageById(PID, pv.st),
      code: rjCode as RejectCode, sender: p.rec,
    })
  })()

  /* ---- 마감된 사람 보기 ----
     예전에는 보드 오른쪽에 세로 레일 두 개(입사·불합격)가 붙어 있었다.
     하루 종일 보는 화면에서 자리만 차지하고 안이 보이지도 않아서 접었다.
     대신 '진행 중 / 입사 / 불합격' 셋 중 하나를 골라 보게 한다 —
     끝난 사람도 여전히 한 번의 클릭 거리에 있다. */
  const [view, setView] = useState<'live' | 'hired' | 'reject'>('live')

  /* ---- 토스트 ---- */
  /* ---------- 공고 미팅 (킥오프 · 디브리프) ----------
     한 드로어가 미팅의 단계(phase)에 따라 다른 얼굴을 보여준다.
     · attendees — 누가 들어갈지 아직 안 정해짐 → 사람을 고른다
     · time      — 사람은 정해졌고 시간이 없음 → 30분 교집합을 찾는다
     · manual    — 참석자에 EA 조율 대상이 있음 → 자동 탐색을 막고 안내만
     · set/done  — 확정됨 → 확정 정보와 뒤늦은 완료자 안내
     화면을 넷으로 쪼개지 않은 이유는, 사람 입장에서 이건 '미팅 하나 잡기'
     한 가지 일이고 중간에 단계가 바뀌기 때문이다. */
  const [mtgId, setMtgId] = useState<string | null>(null)
  const mtg = mtgs.find(m => m.id === mtgId) ?? null
  const [pool, setPool] = useState<{ uid: string; nm: string; tt: string; rel: boolean }[]>([])
  const [pick, setPick] = useState<string[]>([])
  /* 명부에 TalentCore 전 직원이 들어온 뒤로 이 목록이 백 줄을 넘는다(T4).
     잘라내면 태그 안 달린 협업 리더를 못 부르니, 자르는 대신 이름으로 걸러 찾게 한다. */
  const [mQ, setMQ] = useState('')
  const [mBusy, setMBusy] = useState(false)
  const [mSlots, setMSlots] = useState<{ date: string; start: number; end: number; label: string }[] | null>(null)
  const [mScan, setMScan] = useState(0)
  const [mSrc, setMSrc] = useState<'google' | 'manual'>('manual')
  const [mWide, setMWide] = useState(false)
  /* 이미 확정된 미팅에서 '참석자 바꾸기'로 돌아간 상태.
     phase 는 서버가 계산한 값이라 손댈 수 없어서, 고르기 화면만 덧씌운다. */
  const [mPick, setMPick] = useState(false)
  const mPhase = mtg ? (mPick ? 'attendees' : mtg.phase) : 'pending'

  function openMtg(v: MtgView) {
    setMtgId(v.id)
    setPool([]); setPick(v.uids); setMPick(false); setMQ('')
    setMSlots(null); setMWide(false); setMBusy(false)
    if (v.phase === 'attendees') {
      /* 후보 명단과 기본 체크는 서버가 계산한다 — 화면이 들고 있는 사람 목록은
         하이드레이션 이전 값일 수 있어서 여기서 다시 만들면 어긋난다. */
      setMBusy(true)
      meetingPicker(PID, v.id)
        .then(r => { setPool(r.pool); setPick(p => (p.length ? p : r.uids)) })
        .finally(() => setMBusy(false))
    } else if (v.phase === 'time') {
      runMtgSearch(v.id, false)
    }
  }
  const applyMtg = (view: MtgView) => setMtgs(list => list.map(m => (m.id === view.id ? view : m)))
  /* 이미 지정·확정된 미팅에서 참석자를 다시 고르러 돌아가는 길.
     phase 는 계산값이라 강제로 바꿀 수 없어서, 명단만 다시 불러오고
     슬롯 목록을 비워 화면이 고르기 단계처럼 보이게 한다. */
  function reopenPicker() {
    if (!mtg) return
    setMSlots(null); setMWide(false); setMPick(true)
    setPick(mtg.uids); setMQ('')
    setMBusy(true)
    meetingPicker(PID, mtg.id)
      .then(r => { setPool(r.pool); setPick(v => (v.length ? v : r.uids)) })
      .finally(() => setMBusy(false))
  }


  function saveAttendees() {
    if (!mtg || mBusy || !pick.length) return
    setMBusy(true)
    assignMeeting(PID, mtg.id, pick)
      .then(r => {
        if (!r.view) { pushToast('참석자를 저장하지 못했습니다 · 잠시 뒤 다시 시도해 주세요'); return }
        applyMtg(r.view); setMPick(false)
        pushToast(`<b>${r.view.nm}</b> 참석자 ${r.view.who.length}명을 지정했습니다`)
        if (r.view.phase === 'time') runMtgSearch(mtg.id, false)
      })
      .catch(() => pushToast('참석자를 저장하지 못했습니다 · 잠시 뒤 다시 시도해 주세요'))
      .finally(() => setMBusy(false))
  }

  function runMtgSearch(id: string, widen: boolean) {
    setMBusy(true); setMSlots(null); setMWide(widen)
    searchMeetingSlots(PID, id, widen)
      .then(r => {
        setMSlots(r.slots ?? [])
        setMScan(r.scanned ?? 0)
        setMSrc(r.source ?? 'manual')
      })
      .catch(() => setMSlots([]))
      .finally(() => setMBusy(false))
  }

  function confirmMtg(slot: { date: string; start: number; label: string }) {
    if (!mtg || mBusy) return
    setMBusy(true)
    confirmMeeting(PID, mtg.id, slot.date, slot.start)
      .then(r => {
        if (!r.view) { pushToast('확정하지 못했습니다 · 잠시 뒤 다시 시도해 주세요'); return }
        applyMtg(r.view)
        setMSlots(null)
        pushToast(`<b>${r.view.nm}</b> · ${slot.label} 확정 · 참석자 ${r.view.who.length}명에게 초대 발송`)
      })
      .catch(() => pushToast('확정하지 못했습니다 · 잠시 뒤 다시 시도해 주세요'))
      .finally(() => setMBusy(false))
  }

  function pushToast(html: string, undo?: () => void) {
    const id = ++toastSeq.current
    setToasts(t => [...t, { id, html, undo }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), undo ? 6000 : 3200)
  }
  function dismiss(id: number) { setToasts(t => t.filter(x => x.id !== id)) }

  /* ---- 단계 이동 (드롭) — 이동 즉시 다음 조율 자동 시작 ---- */
  function moveCandidate(id: string, to: string) {
    const c = list.find(x => x.id === id)
    if (!c || to === c.st) return
    const snapshot = list
    const from = c.st
    const sg = stageById(PID, to)
    const nc: Candidate = { ...c, st: to, d: 0, en: '2026-08-12', act: undefined }

    if (sg.kind === 'interview') {
      const eaBlocked = sg.ivs.some(uid => personById(uid)?.ea)
      if (eaBlocked) { nc.s = 'esc'; nc.why = 'EA 조율 · 자동화 제외'; nc.act = ['코디네이터 배정', '직접 조율'] }
      else { nc.s = 'idle'; nc.why = `${sg.dur}분 블록 탐색 중` }
    } else if (sg.kind === 'offer') { nc.s = 'idle'; nc.why = '오퍼 승인 대기' }
    else if (sg.kind === 'hired') { nc.s = 'done'; nc.why = '입사 확정' }
    else if (sg.kind === 'reject') { nc.s = 'done'; nc.why = '불합격 처리' }
    else if (sg.kind === 'screen') { nc.s = 'idle'; nc.why = 'HM 검토 요청 발송' }
    else { nc.s = 'idle'; nc.why = '' }

    setList(list.map(x => (x.id === id ? nc : x)))
    // DB 저장 (미연결이면 조용히 무시됨 — UI는 그대로 동작)
    void persistMove(id, to, nc.s, nc.why ?? null)

    const tail =
      sg.kind === 'interview'
        ? (nc.s === 'esc' ? ' · <b>EA 조율 대상이라 코디네이터로 넘겼습니다</b>' : ` · ${sg.dur}분 교집합 탐색을 시작했습니다`)
        : sg.kind === 'screen' ? ' · HM에게 검토를 요청했습니다'
        : sg.kind === 'reject' ? ' · 통보 메일 초안을 만들었습니다' : ''
    pushToast(`<b>${c.nm}</b> → ${sg.nm}${tail}`, () => {
      setList(snapshot)
      // 되돌리기도 DB에 반영
      void persistMove(id, from, c.s, c.why ?? null)
      pushToast(`되돌렸습니다 · ${stageById(PID, from).nm}`)
    })
  }

  /* ---- 카드 액션 처리 (data-do) ---- */
  function resolveCand(id: string) {
    const c = list.find(x => x.id === id)
    if (!c || !c.act) return
    const prev = { s: c.s, why: c.why }
    const snapshot = list
    const newWhy = `${c.act![0]} 실행됨`
    setList(list.map(x => (x.id === id ? { ...x, s: 'idle' as Status, why: newWhy } : x)))
    void persistCand(id, 'idle', newWhy)
    pushToast(`<b>${c.nm}</b> · ${prev.why} → 처리했습니다`, () => {
      setList(snapshot)
      void persistCand(id, prev.s, prev.why ?? null)
    })
  }

  /* ---- 미팅 바 ---- */
  const counts: Record<Status, number> = { esc: 0, late: 0, idle: 0, done: 0 }
  list.filter(c => c.p === PID).forEach(c => { counts[c.s]++ })
  mtgs.forEach(m => { counts[m.s]++ })

  /* ---- 보드 열 데이터 ---- */
  const filtered = list.filter(c => c.p === PID && (!filter || c.s === filter))
  const idleN = filtered.filter(c => c.s === 'idle' && !stageById(PID, c.st).rail).length
  const activeCount = list.filter(c => c.p === PID && !stageById(PID, c.st).rail).length

  /* 끝난 사람은 판정일 최신순 — 오래된 불합격까지 위로 올라오면 목록이 안 읽힌다. */
  const closedIn = (kind: 'hired' | 'reject') =>
    list.filter(c => c.p === PID && stageById(PID, c.st).kind === kind)
      .sort((a, b) => (b.decided ?? b.en ?? '').localeCompare(a.decided ?? a.en ?? ''))
  const hiredList = closedIn('hired')
  const rejectList = closedIn('reject')

  const st = ({ open: ['ok', '오픈'], hold: ['warn', '홀드'], closed: ['', '마감'] } as Record<string, string[]>)[p.st]
  const activeCands = list.filter(c => c.p === PID && !stageById(PID, c.st).rail)
  const risk = activeCands.filter(c => c.s === 'esc' || c.s === 'late').length

  const tabs: [string, string, string, number | null][] = [
    ['board', '파이프라인', 'i-columns', activeCands.length],
    ['progress', '진행 매트릭스', 'i-rows', null],
    ['setup', '공고 설정', 'i-sliders', null],
    ['auto', '자동화', 'i-zap', null],
    ['links', '지원 링크', 'i-link', null],
  ]

  return (
    <>
      {/* ===== 공고 헤더 ===== */}
      <header className="top">
        <div className="crumb">
          <Icon id="i-briefcase" className="ic-sm" /><Link href="/positions">공고</Link>
          <span className="sep">/</span>{p.dept}<span className="sep">/</span>{p.team}
        </div>
        <div className="h-row">
          <h1>{p.title}</h1>
          <span className={'pill ' + st[0]}><i className="dot" />{st[1]}</span>
          {risk > 0 && <span className="pill bad"><Icon id="i-alert" className="ic-sm" />사람 대기 {risk}</span>}
          <div className="spacer">
            <Link className="btn" href={`/p/${PID}/links`}><Icon id="i-link" className="ic-sm" />지원 링크</Link>
            <button className="btn br" onClick={() => openAdd()}><Icon id="i-plus" className="ic-sm" />후보자 추가</button>
          </div>
        </div>
        <div className="meta">
          <i><Icon id="i-users" className="ic-sm" />{p.dept} <b>{p.team}</b></i>
          <i><Icon id="i-user" className="ic-sm" />리크루터 <b>{p.rec}</b></i>
          <i><Icon id="i-star" className="ic-sm" />HM <b>{p.hm}</b></i>
          <i><Icon id="i-clock" className="ic-sm" />게시 <b>D+{p.ttf}</b></i>
          <i><Icon id="i-briefcase" className="ic-sm" />고용형태 <b>{p.emp}</b></i>
          {/* TalentCore 에서 넘어온 공고만 — 몇 자리를 채우는 공고인지, 어느 요청서에서 왔는지.
              색은 쓰지 않는다(상태가 아니라 출처 표시다). */}
          {(p.openings ?? 1) > 1 &&
            <i><Icon id="i-users" className="ic-sm" />채용 인원 <b>{p.openings}명</b></i>}
          {p.reqRef &&
            <i><Icon id="i-link" className="ic-sm" />TalentCore <b>{p.reqRef}</b></i>}
        </div>
        <nav className="tabs">
          {tabs.map(t => (
            <Link className={'tab' + (t[0] === 'board' ? ' on' : '')} href={`/p/${PID}/${t[0]}`} key={t[0]}>
              <Icon id={t[2]} className="ic-sm" />{t[1]}
              {t[3] != null && <span className="cnt">{t[3]}</span>}
            </Link>
          ))}
        </nav>
      </header>

      {/* ===== 미팅 바 ===== */}
      <div className="bar">
        <span className="bar-label"><Icon id="i-video" className="ic-sm" />공고 미팅</span>
        {mtgs.map(m => (
          <button
            className={'mtg s-' + m.s + (m.phase === 'pending' ? ' idle' : '')}
            key={m.id}
            onClick={() => openMtg(m)}
            title={m.note ?? m.v}
          >
            <i className="dot" />
            <span className="mtg-n">{m.nm}</span>
            <span className="mtg-v">{m.v}{m.ag !== '—' ? ' · ' + m.ag : ''}</span>
            {m.act ? <span className="mtg-a">{m.act[0]}</span> : null}
            {m.note ? <span className="mtg-b">!</span> : null}
          </button>
        ))}
        <div className="chips">
          {STATUS_KEYS.map(k => (
            <button className={'chip' + (filter === k ? ' on' : '')} key={k}
              onClick={() => setFilter(filter === k ? null : k)}>
              <i className={'dot d-' + k} />{LABEL[k]} <b>{counts[k]}</b>
            </button>
          ))}
        </div>
      </div>

      {/* ===== 보드 ===== */}
      <div className="stage">
        <div className="sec-h">
          <h3>후보자</h3>
          <div className="seg">
            {([['live', '진행 중', activeCount], ['hired', '입사', hiredList.length], ['reject', '불합격', rejectList.length]] as const)
              .map(([v, l, n]) => (
                <button className={'sg' + (view === v ? ' on' : '')} key={v} onClick={() => setView(v)}>
                  {l} <b>{n}</b>
                </button>
              ))}
          </div>
          {view === 'live' &&
            <span className="hint"><Icon id="i-grip" className="ic-sm" /> 카드를 끌어 단계를 옮깁니다 · 체크해서 여러 명을 한 번에</span>}
          <div className="right">
            {view === 'live' && (
              <button className="btn quiet" onClick={() => setHideIdle(v => !v)}>
                <Icon id="i-eye-off" className="ic-sm" />
                {hideIdle ? 'AI 진행 중 다시 보기' : `AI 진행 중 ${idleN}건 숨기기`}
              </button>
            )}
            <Link className="btn" href={`/p/${PID}/setup`}><Icon id="i-sliders" className="ic-sm" />단계 편집</Link>
          </div>
        </div>

        {view === 'live' ? (
        <div className="board">
          {stages.filter(sg => !sg.rail).map(sg => {
            const mine = filtered.filter(c => c.st === sg.id).sort(byRisk)
            const colRisk = mine.filter(c => c.s === 'esc' || c.s === 'late').length
            const shown = hideIdle ? mine.filter(c => c.s !== 'idle') : mine
            const hidden = mine.length - shown.length
            const dwell = mine.length ? (mine.reduce((a, c) => a + c.d, 0) / mine.length).toFixed(1) : '0.0'
            const over = +dwell > sg.sla * 1.4 && mine.length > 0
            return (
              <div className={'col' + (overStage === sg.id ? ' over' : '')} key={sg.id}
                onDragOver={e => { e.preventDefault(); setOverStage(sg.id) }}
                onDragLeave={() => setOverStage(s => (s === sg.id ? null : s))}
                onDrop={e => { e.preventDefault(); setOverStage(null); const id = dragId.current; if (id) moveCandidate(id, sg.id) }}>
                <div className="col-h">
                  <i className="sq" style={{ background: sg.color }} />
                  <h3>{sg.nm}</h3>
                  <span className="n">{mine.length}</span>
                  {colRisk > 0 && <span className="risk"><Icon id="i-alert" />{colRisk}</span>}
                  <button className="add" title="후보자 추가" onClick={() => openAdd(sg.id)}>
                    <Icon id="i-plus" className="ic-sm" />
                  </button>
                </div>
                <div className="col-b">
                  {shown.length
                    ? shown.map(c => (
                      <CardView key={c.id} c={c} dragId={dragId}
                        onResolve={resolveCand} onView={openView}
                        picked={sel.includes(c.id)} onPick={toggleSel} />
                    ))
                    : <div className="drop-hint">여기로 끌어 놓기</div>}
                  {hidden > 0 && <span className="col-hidden"><Icon id="i-eye-off" className="ic-sm" />AI {hidden}건</span>}
                </div>
                <div className={'col-f' + (over ? ' warn' : '')}>
                  <span>평균 체류 / 기준 {sg.sla}d</span><b>{dwell}d</b>
                </div>
              </div>
            )
          })}
        </div>
        ) : (
          /* 끝난 사람 — 카드로 볼 이유가 없다. 언제 · 어느 단계에서 · 왜 끝났는지만 한 줄씩. */
          <div className="sheet">
            {(view === 'hired' ? hiredList : rejectList).length ? (
              (view === 'hired' ? hiredList : rejectList).map(c => (
                <div className={'qr s-' + c.s} key={c.id} role="button" tabIndex={0}
                  onClick={() => openView(c.id)}
                  onKeyDown={e => { if (e.key === 'Enter') openView(c.id) }}>
                  <i className="dot" />
                  <span className="nm">{c.nm}</span>
                  <span className="pos">{c.yr}년차 · {company(c.role)}</span>
                  <span className="st">
                    <Icon id="i-columns" />{c.ex ? stageById(PID, c.ex).nm : '—'}에서
                  </span>
                  <span className="why">{c.rj ? rejectDef(c.rj).l : c.why}</span>
                  <span className="age">{c.decided ? md(c.decided) : '—'}</span>
                </div>
              ))
            ) : (
              <div className="zero-row">
                {view === 'hired' ? '아직 입사 확정된 분이 없습니다.' : '아직 불합격 처리된 분이 없습니다.'}
              </div>
            )}
          </div>
        )}

        <p className="disclaimer">※ 화면은 기능 설명을 위한 예시 데이터입니다. 실제 지표가 아닙니다.</p>
      </div>

      {/* ===== 후보자 추가 모달 ===== */}
      {addStage && (
        <>
          <div className="scrim" onClick={() => setAddStage(null)} />
          <div className="modal" role="dialog" aria-modal="true">
            <div className="drawer-h">
              <div>
                <h2>후보자 추가</h2>
                <div className="sub">{p.title} · {stageById(PID, addStage).nm} 단계</div>
              </div>
              <button className="x" onClick={() => setAddStage(null)}><Icon id="i-x" /></button>
            </div>
            <div className="drawer-b">
              <div className="field">
                <label>이름</label>
                <input className="in" autoFocus value={form.nm}
                  placeholder="예) 한지우"
                  onChange={e => setForm(f => ({ ...f, nm: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') submitAdd() }} />
              </div>
              <div className="row2">
                <div className="field">
                  <label>경력 연차</label>
                  <input className="in" type="number" min={0} value={form.yr}
                    placeholder="예) 7"
                    onChange={e => setForm(f => ({ ...f, yr: e.target.value }))} />
                </div>
                <div className="field">
                  <label>출처</label>
                  <select className="sel" value={form.src}
                    onChange={e => setForm(f => ({ ...f, src: e.target.value }))}>
                    {SRC_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>이력 요약</label>
                <input className="in" value={form.role}
                  placeholder="예) 백엔드 엔지니어 · 카카오"
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
              </div>
              <div className="field">
                <label>시작 단계</label>
                <select className="sel" value={addStage}
                  onChange={e => setAddStage(e.target.value)}>
                  {cols.map(sg => <option key={sg.id} value={sg.id}>{sg.nm}</option>)}
                </select>
              </div>
            </div>
            <div className="drawer-f">
              <button className="btn quiet" onClick={() => setAddStage(null)}>취소</button>
              <button className="btn solid" disabled={!form.nm.trim()} onClick={submitAdd}>
                <Icon id="i-plus" className="ic-sm" />추가
              </button>
            </div>
          </div>
        </>
      )}

      {/* 함께 보내기 — 고른 카드를 한 무리로 묶어 같은 자리를 낸다. */}
      {bulk && (
        <BulkSend cids={sel} onClose={() => setBulk(false)}
          onSent={() => { setBulk(false); setSel([]) }} />
      )}

      {/* ===== 공고 미팅 드로어 =====
           한 드로어가 미팅의 단계(phase)에 따라 다른 얼굴을 보여준다.
           화면을 넷으로 쪼개지 않은 이유는, 사람 입장에서 이건 '미팅 하나 잡기'
           한 가지 일이고 중간에 단계가 저절로 넘어가기 때문이다. */}
      {mtg && (
        <>
          <div className="scrim" onClick={() => setMtgId(null)} />
          <div className="drawer" role="dialog" aria-modal="true">
            <div className="drawer-h">
              <div>
                <h2>{mtg.nm}</h2>
                <div className="sub">
                  {p.title} · {mtg.dur}분
                  {mtg.who.length ? ' · ' + mtg.who.join(', ') : ''}
                </div>
              </div>
              <button className="x" onClick={() => setMtgId(null)}><Icon id="i-x" /></button>
            </div>

            <div className="drawer-b">
              {/* 왜 이 미팅이 지금 떴는지 — 트리거를 먼저 말한다. */}
              <div className={'mt-why' + (mtg.s === 'esc' ? ' esc' : '')}>
                <Icon id={mPhase === 'pending' ? 'i-clock' : mtg.s === 'esc' ? 'i-alert' : 'i-info'} className="ic-sm" />
                <span>
                  {mPhase !== 'pending' && mtg.fired && mtg.by
                    ? <><b>{mtg.by}</b> — 이 시점에 자동으로 열렸습니다{mtg.sinceD != null ? ' · ' + mtg.ag + ' 경과' : ''}</>
                    : mtg.v}
                </span>
              </div>

              {mPhase === 'pending' && (
                <div className="mt-note">
                  아직 열 때가 아닙니다. 조건이 채워지면 이 자리에 저절로 올라오고,
                  담당자에게 참석자 지정 요청이 갑니다.
                </div>
              )}

              {mPhase === 'attendees' && (
                <div className="mt-sec">
                  <div className="mt-h">
                    누가 들어가나요<span className="mt-h-x">{pick.length}명 선택</span>
                  </div>
                  <div className="mt-note">
                    {mtg.kind === 'kickoff'
                      ? '채용 담당자와 첫 인터뷰 면접관을 기본으로 잡아뒀습니다. 기준을 같이 맞출 사람이면 더하세요.'
                      : mtg.kind === 'debrief'
                        ? '이 공고의 면접에 들어간 사람을 기본으로 잡아뒀습니다.'
                        : '이 공고에 관계된 사람을 먼저 보여드립니다. 필요한 사람을 골라 주세요.'}
                  </div>
                  {mBusy && !pool.length ? (
                    <div className="sched-busy"><i className="spin" />명단을 불러오는 중…</div>
                  ) : (
                    <>
                      {pool.length > 12 && (
                        <input
                          className="mt-find"
                          value={mQ}
                          onChange={e => setMQ(e.target.value)}
                          placeholder={`이름·직함으로 찾기 (${pool.length}명)`}
                        />
                      )}
                    <div className="mt-pool">
                      {pool
                        /* 이미 고른 사람은 검색어와 상관없이 남긴다 — 걸러내는 순간
                           사라지면 '몇 명 골랐는지'와 화면이 어긋난다. */
                        .filter(x => {
                          const q = mQ.trim().toLowerCase()
                          if (!q) return true
                          return pick.indexOf(x.uid) >= 0 ||
                            x.nm.toLowerCase().includes(q) || x.tt.toLowerCase().includes(q)
                        })
                        .map(x => {
                        const on = pick.indexOf(x.uid) >= 0
                        return (
                          <button
                            className={'mt-p' + (on ? ' on' : '')}
                            key={x.uid}
                            onClick={() => setPick(v => on ? v.filter(u => u !== x.uid) : [...v, x.uid])}
                          >
                            <Icon id={on ? 'i-check-sq' : 'i-columns'} className="ic-sm" />
                            <span className="mt-p-n">{x.nm}</span>
                            <span className="mt-p-t">{x.rel ? '이 공고 관련' : x.tt}</span>
                          </button>
                        )
                      })}
                    </div>
                    </>
                  )}
                </div>
              )}

              {mPhase === 'manual' && (
                <>
                  <div className="sched-note esc">
                    <Icon id="i-alert" className="ic-sm" />
                    <b>{mtg.ea.join(', ')}</b> — EA(비서) 조율 대상이라 자동 탐색에서 빠집니다.
                  </div>
                  <div className="mt-note">
                    EA에게 직접 연락해 시간을 받은 뒤 확정하시거나, 참석자에서 빼고 자동으로 잡으세요.
                  </div>
                  <button className="btn full" onClick={() => reopenPicker()}>
                    <Icon id="i-users" className="ic-sm" />참석자 다시 고르기
                  </button>
                </>
              )}

              {(mPhase === 'time' || mSlots) && mPhase !== 'attendees' && (
                <div className="mt-sec">
                  <div className="mt-h">시간 찾기<span className="mt-h-x">{mtg.dur}분</span></div>
                  {mSlots && !mBusy && (
                    <div className={'src-tag src-' + mSrc}>
                      <i className="src-dot" />
                      {mSrc === 'google'
                        ? 'Google 캘린더 실시간 free-busy 기준'
                        : '수동 가용성(샘플) 기준 · Google 연결 시 실시간 전환'}
                    </div>
                  )}
                  {mBusy && <div className="sched-busy"><i className="spin" />참석자 {mtg.who.length}명의 빈 시간을 찾는 중…</div>}
                  {!mBusy && mSlots && mSlots.length > 0 && (
                    <>
                      <div className="sched-lead">
                        영업일 {mScan}일 범위에서 <b>{mSlots.length}개</b> 자리를 찾았습니다.
                      </div>
                      <div className="slots">
                        {mSlots.map((x, i) => (
                          <div className="slot" key={i}>
                            <span className="slot-l"><Icon id="i-clock" className="ic-sm" />{x.label}</span>
                            <button className="btn solid sm" onClick={() => confirmMtg(x)}>확정</button>
                          </div>
                        ))}
                      </div>
                      <div className="sched-gate"><Icon id="i-info" className="ic-sm" />AI는 <b>제안</b>까지 — 확정은 사람이 누릅니다.</div>
                    </>
                  )}
                  {!mBusy && mSlots && mSlots.length === 0 && (
                    <>
                      <div className="sched-note esc">
                        <Icon id="i-alert" className="ic-sm" />
                        영업일 {mScan}일 범위에 <b>전원이 되는 시간이 없습니다</b>{mWide ? ' (범위를 넓혀도)' : ''}.
                      </div>
                      <div className="sched-acts">
                        {!mWide && <button className="btn br" onClick={() => runMtgSearch(mtg.id, true)}><Icon id="i-zap" className="ic-sm" />범위 넓혀 재탐색</button>}
                        <button className="btn" onClick={() => reopenPicker()}>참석자 줄이기</button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {(mPhase === 'set' || mPhase === 'done') && !mSlots && !mBusy && (
                <div className="mt-sec">
                  <div className="mt-h">확정된 일정</div>
                  <div className="mt-set">
                    <Icon id="i-calendar" className="ic-sm" />
                    <b>{mtg.v}</b>
                    <span className="mt-set-w">{mtg.who.join(', ')}</span>
                  </div>
                  {mtg.note && (
                    <div className="sched-note esc">
                      <Icon id="i-alert" className="ic-sm" />{mtg.note}
                    </div>
                  )}
                  {mPhase === 'set' && (
                    <div className="sched-acts">
                      <button className="btn" onClick={() => runMtgSearch(mtg.id, false)}>
                        <Icon id="i-clock" className="ic-sm" />시간 다시 찾기
                      </button>
                      <button className="btn" onClick={() => reopenPicker()}>
                        <Icon id="i-users" className="ic-sm" />참석자 바꾸기
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="drawer-f">
              <button className="btn quiet" onClick={() => setMtgId(null)}>닫기</button>
              {mPhase === 'attendees' && (
                <button className="btn solid" disabled={mBusy || !pick.length} onClick={saveAttendees}>
                  <Icon id="i-check-circle" className="ic-sm" />
                  {mBusy ? '저장 중…' : pick.length + '명으로 지정'}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ===== 토스트 ===== */}
      {/* 고른 카드가 있으면 아래에 막대가 뜬다 — 조율은 여기서 시작한다. */}
      {sel.length > 0 && (
        <div className="pick-bar">
          <b>{sel.length}명 선택</b>
          <button className="pb-x" onClick={() => setSel([])} title="선택 해제"><Icon id="i-x" className="ic-sm" /></button>
          <i className="pb-sep" />
          <button className="btn" disabled={busy} onClick={() => { setPassMail(defaultPassMail()); setAsk('pass') }}>
            <Icon id="i-check-circle" className="ic-sm" />합격
          </button>
          <button className="btn" disabled={busy} onClick={() => setAsk('reject')}>
            <Icon id="i-x" className="ic-sm" />불합격
          </button>
          <button className="btn" disabled={busy} onClick={() => setAsk('mail')}>
            <Icon id="i-send" className="ic-sm" />메일
          </button>
          <button className="btn go" disabled={busy} onClick={() => setBulk(true)}>
            <Icon id="i-calendar" className="ic-sm" />일정 조율
          </button>
        </div>
      )}

      {/* ===== 여러 명 한 번에 — 확인 ===== */}
      {ask && (
        <>
          <div className="scrim" onClick={() => !busy && setAsk(null)} />
          <div className="modal" role="dialog" aria-modal="true">
            <div className="drawer-h">
              <div>
                <h2>{ask === 'pass' ? '다음 단계로 보내기' : ask === 'reject' ? '불합격 처리' : '메일 보내기'}</h2>
                <div className="sub">{selNames}</div>
              </div>
              <button className="x" onClick={() => setAsk(null)}><Icon id="i-x" /></button>
            </div>
            <div className="drawer-b">
              {ask === 'pass' && (
                <>
                  <p className="ask-p">
                    선택한 <b>{sel.length}명</b>을 각자 서 있는 단계의 <b>다음 단계</b>로 보냅니다.
                    단계마다 서 있는 자리가 다르면 각자 다른 단계로 갑니다.
                    오퍼 단계로 넘어가는 분은 처우안 초안이 함께 만들어집니다.
                  </p>
                  <div className="field">
                    <label>통보 메일</label>
                    <div className="mp">
                      {([
                        ['doc-pass', '일정 조율 요청', '다음 전형 일정을 잡기 위해 가능한 시간을 여쭙습니다'],
                        ['iv-info', '면접 안내', '이미 시간이 정해진 경우 — 확정된 일정을 안내합니다'],
                        [null, '보내지 않음', '이미 전화·문자로 알렸거나, 본문을 직접 쓰고 싶은 경우'],
                      ] as [string | null, string, string][]).map(([v, l, d]) => (
                        <label key={v ?? 'none'} className={'mp-o' + (passMail === v ? ' on' : '')}>
                          <input type="radio" name="passmail" checked={passMail === v}
                            onChange={() => setPassMail(v)} />
                          <b>{l}</b><i>{d}</i>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {ask === 'reject' && (
                <>
                  <p className="ask-p">
                    선택한 <b>{sel.length}명</b>을 같은 사유로 불합격 처리합니다.
                    사유는 안에서만 남고, 통보 메일에는 적히지 않습니다.
                  </p>
                  <div className="field">
                    <label>사유 (필수)</label>
                    <select className="in" value={rjCode} onChange={e => setRjCode(e.target.value)}>
                      {REJECT_REASONS.map(r => (
                        <option key={r.v} value={r.v}>{r.side === 'them' ? '후보자 이탈' : '불합격'} · {r.l}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>메모 (선택)</label>
                    <input className="in" value={rjMemo} placeholder="예) 요구 연봉 밴드 초과"
                      onChange={e => setRjMemo(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>통보 메일</label>
                    <div className="mp">
                      {([
                        ['auto', '전형 결과 안내', '사유와 서 있던 단계에 맞춰 본문을 지어 보냅니다'],
                        ['thanks', '지원 감사 · 인재풀 보관', '다음 공고에 다시 연락드릴 분에게'],
                        [null, '보내지 않음', '이미 알렸거나, 통보하지 않기로 한 경우'],
                      ] as [string | null, string, string][]).map(([v, l, d]) => (
                        <label key={v ?? 'none'} className={'mp-o' + (rjMail === v ? ' on' : '')}>
                          <input type="radio" name="rjmail" checked={rjMail === v}
                            onChange={() => setRjMail(v)} />
                          <b>{l}</b><i>{d}</i>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {ask === 'mail' && (
                <>
                  <p className="ask-p">
                    선택한 <b>{sel.length}명</b>에게 같은 템플릿으로 한 통씩 보냅니다.
                    본문은 사람마다 이름·단계를 넣어 다시 만듭니다.
                    받는 사람끼리 서로를 알 수 없습니다.
                  </p>
                  <div className="field">
                    <label>템플릿</label>
                    <select className="in" value={tpl} onChange={e => setTpl(e.target.value)}>
                      {MAIL_TPLS.map(t => <option key={t.v} value={t.v}>{t.l} — {t.d}</option>)}
                    </select>
                  </div>
                </>
              )}

              {/* 실제로 나갈 문장을 보여 준다. 여러 명이면 첫 사람 기준 — 나머지는 이름과 단계만 바뀐다. */}
              {(() => {
                const dr = ask === 'pass' ? passDraft : ask === 'reject' ? rjDraft : null
                if (!dr || !pv) return null
                return (
                  <div className="mail-pv">
                    <div className="mail-pv-h">
                      나갈 메일 미리보기
                      {sel.length > 1 ? <span> · {pv.nm} 님 기준, 나머지는 이름·단계만 바뀝니다</span> : null}
                    </div>
                    <div className="mail-pv-s">{dr.subject}</div>
                    <div className="mail-pv-b">{dr.body}</div>
                  </div>
                )
              })()}
            </div>
            <div className="drawer-f">
              <button className="btn" onClick={() => setAsk(null)} disabled={busy}>취소</button>
              <button className="btn solid" disabled={busy || (ask === 'reject' && !rjCode) || (ask === 'mail' && !tpl)}
                onClick={ask === 'pass' ? doPass : ask === 'reject' ? doReject : doMail}>
                {busy ? '처리 중…'
                  : ask === 'pass' ? `${sel.length}명 보내기${passMail ? ' + 메일' : ' (메일 없음)'}`
                  : ask === 'reject' ? `${sel.length}명 불합격${rjMail ? ' + 통보' : ' (통보 없음)'}`
                  : `${sel.length}명에게 보내기`}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="toast-wrap">
        {toasts.map(t => (
          <div className="toast" key={t.id}>
            <Icon id="i-check-circle" />
            <span dangerouslySetInnerHTML={{ __html: t.html }} />
            {t.undo && <button onClick={() => { t.undo!(); dismiss(t.id) }}>되돌리기</button>}
          </div>
        ))}
      </div>
    </>
  )
}

/* ---- 카드 ---- */
function CardView({ c, dragId, onResolve, onView, picked, onPick }: {
  c: Candidate; dragId: React.RefObject<string | null>
  onResolve: (id: string) => void; onView: (id: string) => void
  /* 체크는 '함께 보내기'용, 카드 본문은 서랍 열기용 — 한 장에서 두 가지를 한다. */
  picked: boolean; onPick: (id: string) => void
}) {
  const showReason = c.s !== 'idle' && c.why
  const showAct = (c.s === 'esc' || c.s === 'late') && c.act
  return (
    <div className={'card s-' + c.s + (picked ? ' picked' : '')} draggable data-c={c.id}
      onClick={() => onView(c.id)}
      onDragStart={e => { dragId.current = c.id; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={e => { dragId.current = null; e.currentTarget.classList.remove('dragging') }}>
      <div className="card-t">
        <span className={'card-ck' + (picked ? ' on' : '')} role="checkbox" aria-checked={picked}
          tabIndex={0} aria-label={`${c.nm} 선택`}
          onClick={e => { e.stopPropagation(); onPick(c.id) }}
          onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onPick(c.id) } }}>
          {picked ? '✓' : ''}
        </span>
        {/* 머리글자 — 열이 길어지면 이름을 글자로 읽기 전에 자리로 먼저 찾게 된다. */}
        <span className="card-av" aria-hidden="true">{c.nm.trim().slice(0, 1)}</span>
        <span className="card-id">
          <span className="nm">{c.nm}</span>
          <span className="card-sub">{c.yr}년차 · {company(c.role)}</span>
        </span>
        <span className="age" title={`이 단계에 머문 지 ${c.d}일`}><Icon id="i-clock" />{c.d}d</span>
      </div>
      {showReason && (
        <div className="card-r">
          <Icon id={c.s === 'esc' ? 'i-alert' : c.s === 'late' ? 'i-clock' : 'i-check-circle'} />{c.why}
        </div>
      )}
      <div className="card-f">
        <span className="in-date"><Icon id="i-calendar" />{md(c.ap)} 유입</span>
        <span className="src">{c.src}</span>
      </div>
      {showAct && (
        <div className="card-act">
          <button className="btn solid" onClick={e => { e.stopPropagation(); onResolve(c.id) }}>{c.act![0]}</button>
          <button className="btn" onClick={e => { e.stopPropagation(); onView(c.id) }}>보기</button>
        </div>
      )}
    </div>
  )
}
