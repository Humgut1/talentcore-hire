'use client'
/* =========================================================
   Cadence — 후보자 서랍
   ---------------------------------------------------------
   이 화면이 제품의 등뼈다. 확정된 규칙 한 줄로 요약하면:
   **채용 담당자가 하루 종일 열어 두는 화면은 공고 보드 하나뿐이고,
     조율·판정·평가·오퍼·메일이 전부 후보자 카드를 벗어나지 않고 끝난다.**

   그래서 여기서 페이지 이동은 일어나지 않는다. 서랍은 주소(?c=)로만 열리고 닫힌다 —
   주소로 여는 이유는 두 가지다. ① 누군가에게 링크로 넘길 수 있다.
   ② 보드의 클라이언트 상태(끌어 놓는 중, 걸러 놓은 조건)가 살아 있다.

   담는 것은 '이 사람에 대해 아는 전부'이고, 그건 서버가 drawer.ts 에서 한 번에 모아 준다.
   서랍은 그걸 그리기만 한다 — 계산도, 판단도 여기서 하지 않는다.

   색은 상태에만. 탭·버튼은 무채색이고, 인디고는 '지금 보고 있는 것'에만 쓴다.
   ========================================================= */
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Icon } from './IconSprite'
import IvPanel from './IvPanel'
import DecisionClient from './DecisionClient'
import OfferClient from './OfferClient'
import { uploadDoc, removeDoc, openDoc, sendMail } from '../lib/drawer-actions'
import { createOffer } from '../lib/actions'
import { MAIL_TPLS, tplByCode } from '../lib/cand-mail'
import { ratingDef, isPositive } from '../lib/scorecard'
import type { DrawerData } from '../lib/drawer'

type Tab = 'now' | 'eval' | 'iv' | 'offer' | 'mail'

/* docs.ts 는 서버 전용(저장소에 손을 댄다)이라 이름표만 여기 둔다. */
const DOC_KINDS: { v: string; l: string }[] = [
  { v: 'resume', l: '이력서' },
  { v: 'portfolio', l: '포트폴리오' },
  { v: 'cert', l: '증빙·자격' },
  { v: 'etc', l: '기타' },
]
const docLabel = (v: string) => DOC_KINDS.find(k => k.v === v)?.l ?? '기타'

/* 조율이 자동으로 보낸 메일도 같은 기록에 쌓인다 — 사람이 쓴 것과 섞이되, 무엇이었는지는 보인다. */
const KIND_L: Record<string, string> = {
  'iv-pick': '면접 자리 안내', 'iv-confirm': '면접 확정 안내',
  'iv-confirm-part': '면접관 확정 안내', 'iv-decline': '면접관 불가 알림',
  'iv-expired': '가예약 만료 안내',
}
const kindLabel = (v: string) =>
  KIND_L[v] ?? MAIL_TPLS.find(t => t.v === v)?.l ?? '메일'

const sizeLabel = (n: number) =>
  !n ? '—' : n < 1024 ? `${n}B`
    : n < 1024 * 1024 ? `${Math.round(n / 1024)}KB`
      : `${(n / 1024 / 1024).toFixed(1)}MB`

/* 올라간 시각은 DB가 준 ISO 그대로가 아니라 사람이 읽는 표기로. */
const atLabel = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso
    : `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')} ` +
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const FAIL: Record<string, string> = {
  'no-file': '파일을 고르지 않았습니다.',
  'too-big': '20MB 를 넘는 파일은 올릴 수 없습니다.',
  'no-db': '파일 저장소가 아직 연결되지 않았습니다.',
  'not-configured': '메일 키가 없어 실제로 보내지는 못했습니다 — 기록에는 남았습니다.',
  'empty': '제목과 내용을 모두 채워 주세요.',
}

export default function CandDrawer({ d }: { d: DrawerData }) {
  const router = useRouter()
  const path = usePathname()
  const [tab, setTab] = useState<Tab>('now')
  const [msg, setMsg] = useState('')

  /* 다른 후보자로 갈아타면 탭과 안내문은 처음으로 — 앞사람의 흔적을 물려주지 않는다. */
  useEffect(() => { setTab('now'); setMsg('') }, [d.cid])

  const close = () => router.push(path, { scroll: false })
  const goIv = (ivId: string, wide?: boolean) =>
    router.push(`${path}?c=${d.cid}&iv=${ivId}${wide ? '&ivw=1' : ''}`, { scroll: false })

  /* Esc 로 닫는다 — 서랍은 하루에 수백 번 여닫는 물건이라 손이 마우스를 떠나면 안 된다. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') router.push(path, { scroll: false }) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [path, router])

  const TABS: { v: Tab; l: string; n?: number }[] = [
    { v: 'now', l: '개요', n: d.docs.length },
    { v: 'eval', l: '평가·판정', n: d.evals.length },
    { v: 'iv', l: '면접', n: d.ivRows.length },
    { v: 'offer', l: '오퍼' },
    { v: 'mail', l: '메일', n: d.mails.length },
  ]

  return (
    <>
      <div className="dw-back" onClick={close} />
      <aside className="dw" role="dialog" aria-modal="true" aria-label={`${d.nm} 후보자`}>
        <header className="dw-h">
          <span className="avatar lg br">{d.nm.charAt(0)}</span>
          <div className="dw-h-t">
            <div className="dw-h-r">
              <b>{d.nm}</b>
              <span className="pill" style={{ background: d.stage.color + '1a', color: d.stage.color }}>
                <i className="dot" />{d.stage.nm}
              </span>
              {d.status === 'esc' ? <span className="pill bad">{d.why}</span>
                : d.status === 'late' ? <span className="pill warn">{d.why}</span> : null}
            </div>
            <div className="dw-h-s">
              {d.role} · {d.yr}년차 · {d.pos.title} · {d.pos.dept} {d.pos.team}
            </div>
          </div>
          <button className="dw-x" onClick={close} aria-label="닫기">
            <Icon id="i-x" className="ic-sm" />
          </button>
        </header>

        {/* 왼쪽은 서류, 오른쪽은 일. 이력서를 새 창에 띄우고 돌아오는 왕복이 사라진다 —
            평가를 쓰는 동안에도 이력서가 옆에 계속 떠 있다. */}
        <div className="dw-main">
          <DocPane d={d} setMsg={setMsg} />
          <div className="dw-side">
            <nav className="dw-tabs">
              {TABS.map(t => (
                <button key={t.v} className={'dw-tab' + (tab === t.v ? ' on' : '')}
                  onClick={() => { setTab(t.v); setMsg('') }}>
                  {t.l}{t.n ? <i>{t.n}</i> : null}
                </button>
              ))}
            </nav>

            {msg ? <div className="dw-msg">{msg}</div> : null}

            <div className="dw-body">
              {tab === 'now' ? <OverviewTab d={d} setMsg={setMsg} /> : null}
              {tab === 'eval' ? <EvalTab d={d} /> : null}
              {tab === 'iv' ? <IvTab d={d} goIv={goIv} /> : null}
              {tab === 'offer' ? <OfferTab d={d} setMsg={setMsg} /> : null}
              {tab === 'mail' ? <MailTab d={d} setMsg={setMsg} /> : null}
            </div>
          </div>
        </div>
      </aside>
      <style>{CSS}</style>
    </>
  )
}

/* ---------- 서류 창 ----------
   이력서는 '첨부 파일'이 아니라 이 사람의 얼굴이다. 예전에는 파일 이름을 눌러
   새 창을 띄웠는데, 그러면 이력서를 보는 동안 후보자 화면이 뒤로 밀린다.
   그래서 서랍 왼쪽 절반을 통째로 뷰어로 준다.

   주소는 서버(drawer.ts)가 이미 서명해 붙여 보냈다 — 고르는 즉시 뜬다.
   PDF·이미지·글자 파일은 그 자리에서 읽히고, 워드·한글처럼 브라우저가
   못 그리는 형식만 '새 창에서 열기'로 물러선다. 못 그린다고 말하는 편이
   빈 화면을 띄워 두는 것보다 정직하다. */
type DocKindGuess = 'pdf' | 'image' | 'text' | 'none'
function guessKind(nm: string, mime?: string): DocKindGuess {
  const m = (mime || '').toLowerCase()
  const e = nm.toLowerCase().split('.').pop() || ''
  if (m === 'application/pdf' || e === 'pdf') return 'pdf'
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(e)) return 'image'
  if (m.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'html'].includes(e)) return 'text'
  return 'none'
}

function DocPane({ d, setMsg }: { d: DrawerData; setMsg: (s: string) => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  /* 기본으로 펼치는 것은 이력서. 없으면 가장 최근에 올라온 것. */
  const auto = d.docs.find(f => f.kind === 'resume') ?? d.docs[0]
  const cur = d.docs.find(f => f.id === openId) ?? auto
  const kind = cur ? guessKind(cur.nm, cur.mime) : 'none'

  /* 다른 후보자로 갈아타면 고르기를 처음으로 — 앞사람 파일 id 가 남아 있으면 안 뜬다. */
  useEffect(() => { setOpenId(null) }, [d.cid])

  const upload = (f: File, k: string) => start(async () => {
    const fd = new FormData()
    fd.set('cid', d.cid); fd.set('kind', k); fd.set('by', d.sender); fd.set('file', f)
    const r = await uploadDoc(fd)
    setMsg(r.ok ? `${f.name} 을(를) 올렸습니다.`
      : (FAIL[r.reason ?? ''] ?? `올리지 못했습니다 (${r.reason ?? '알 수 없음'})`))
    if (file.current) file.current.value = ''
    router.refresh()
  })

  const pop = () => {
    if (cur?.url) window.open(cur.url, '_blank', 'noopener')
    else setMsg('파일 주소를 만들지 못했습니다 — 잠시 뒤 다시 열어 주세요.')
  }

  /* 끌어다 놓기 — 이력서는 대개 메일 첨부에서 바로 끌어온다.
     '올리기'를 눌러 탐색기를 여는 길보다 이쪽이 손이 덜 간다. */
  const [over, setOver] = useState(false)

  return (
    <div className={'dv' + (over ? ' over' : '')}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={e => { if (e.currentTarget === e.target) setOver(false) }}
      onDrop={e => {
        e.preventDefault(); setOver(false)
        const f = e.dataTransfer.files?.[0]
        if (f) upload(f, d.docs.length ? 'etc' : 'resume')
      }}>
      <div className="dv-h">
        <Icon id="i-file" className="ic-sm" />
        {d.docs.length ? (
          <>
            <div className="dv-tabs">
              {d.docs.map(f => (
                <button key={f.id} className={'dv-t' + (cur?.id === f.id ? ' on' : '')}
                  title={`${f.nm} · ${sizeLabel(f.size)} · ${atLabel(f.at)}`}
                  onClick={() => setOpenId(f.id)}>
                  {docLabel(f.kind)}
                </button>
              ))}
            </div>
            <button className="btn quiet" onClick={pop} title="새 창에서 열기">
              <Icon id="i-link" className="ic-sm" />크게
            </button>
          </>
        ) : <span className="dv-none-h">제출서류</span>}
        <button className="btn" disabled={pending} onClick={() => file.current?.click()}>
          <Icon id="i-clip" className="ic-sm" />올리기
        </button>
        <input ref={file} type="file" hidden
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, d.docs.length ? 'etc' : 'resume') }} />
      </div>

      <div className="dv-b">
        {!cur ? (
          <div className="dv-empty">
            <Icon id="i-file" />
            <b>아직 올라온 서류가 없습니다</b>
            <p>이력서를 올리면 이 자리에서 바로 펼쳐집니다.<br />
              파일을 이 창에 끌어다 놓아도 됩니다.</p>
            <button className="btn solid" disabled={pending} onClick={() => file.current?.click()}>
              <Icon id="i-clip" className="ic-sm" />이력서 올리기
            </button>
          </div>
        ) : !cur.url ? (
          <div className="dv-empty">
            <Icon id="i-alert" />
            <b>파일을 여는 주소를 만들지 못했습니다</b>
            <p>저장소 연결을 확인해 주세요.</p>
          </div>
        ) : kind === 'image' ? (
          <img className="dv-img" src={cur.url} alt={cur.nm} />
        ) : kind === 'none' ? (
          <div className="dv-empty">
            <Icon id="i-file" />
            <b>{cur.nm}</b>
            <p>브라우저가 바로 펼칠 수 없는 형식입니다.<br />
              PDF 로 올리면 이 자리에서 그대로 읽힙니다.</p>
            <button className="btn solid" onClick={pop}>
              <Icon id="i-link" className="ic-sm" />새 창에서 열기
            </button>
          </div>
        ) : (
          <iframe className="dv-f" src={cur.url} title={cur.nm} />
        )}
      </div>

      {cur ? (
        <div className="dv-f-bar">
          <span className="dv-nm">{cur.nm}</span>
          <span className="dv-m">{sizeLabel(cur.size)} · {atLabel(cur.at)}</span>
        </div>
      ) : null}
    </div>
  )
}

/* ---------- 개요 — 프로필 · 제출서류 · 다른 지원 · 타임라인 ---------- */
function OverviewTab({ d, setMsg }: { d: DrawerData; setMsg: (s: string) => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [kind, setKind] = useState('resume')
  const file = useRef<HTMLInputElement>(null)

  const pick = (f: File) => start(async () => {
    const fd = new FormData()
    fd.set('cid', d.cid); fd.set('kind', kind); fd.set('by', d.sender); fd.set('file', f)
    const r = await uploadDoc(fd)
    setMsg(r.ok ? `${f.name} 을(를) 올렸습니다.`
      : (FAIL[r.reason ?? ''] ?? `올리지 못했습니다 (${r.reason ?? '알 수 없음'})`))
    if (file.current) file.current.value = ''
    router.refresh()
  })

  const open = (p: string) => start(async () => {
    const r = await openDoc(p)
    if (r.ok && r.url) window.open(r.url, '_blank', 'noopener')
    else setMsg('파일을 열지 못했습니다.')
  })

  const drop = (id: string, nm: string) => start(async () => {
    const r = await removeDoc(id)
    setMsg(r.ok ? `${nm} 을(를) 지웠습니다.` : '지우지 못했습니다.')
    router.refresh()
  })

  return (
    <>
      {d.dup ? (
        <div className="dw-dup">
          <Icon id="i-copy" className="ic-sm" />
          <div>
            <b>같은 사람의 지원건일 수 있습니다</b>
            <span>{d.dup.title} 지원건 · {d.dup.note}{d.dup.n > 1 ? ` 외 ${d.dup.n - 1}건` : ''}</span>
          </div>
          <Link className="btn" href="/pool">인재풀에서 확인</Link>
        </div>
      ) : null}

      {d.rj ? (
        <div className="dw-rj">
          <div className="dw-rj-h"><b>전형 종료 사유</b><span className="pill bad">{d.rj.l}</span>
            <small>{d.rj.side}</small></div>
          <p>{d.rj.d}</p>
          {d.rj.exStage
            ? <p>마지막 단계 — <b>{d.rj.exStage}</b>{d.rj.decided ? ` · ${d.rj.decided} 판정` : ''}</p>
            : null}
          {d.rj.memo ? <p className="dw-rj-m">{d.rj.memo}</p> : null}
        </div>
      ) : null}

      <Sec t="프로필" />
      <div className="dw-kv">
        <span>경력</span><b>{d.yr}년</b>
        <span>유입 경로</span><b>{d.src}</b>
        <span>유입일</span><b>{d.ap} ({d.apAgo}일 전)</b>
        <span>현재 단계</span><b>{d.stage.nm} · {d.days}일째</b>
        <span>메일</span><b>{d.email ?? '— 등록되지 않음'}</b>
        <span>담당</span><b>{d.pos.rec} · HM {d.pos.hm}</b>
      </div>

      <Sec t="제출서류" n={d.docs.length} right={
        <>
          <select className="dw-sel sm" value={kind} aria-label="서류 종류"
            onChange={e => setKind(e.target.value)}>
            {DOC_KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
          </select>
          <button className="btn" disabled={pending} onClick={() => file.current?.click()}>
            <Icon id="i-clip" className="ic-sm" />올리기
          </button>
          <input ref={file} type="file" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) pick(f) }} />
        </>
      } />
      {d.docs.length
        ? <div className="dw-hintline">파일은 왼쪽 창에서 바로 읽습니다 — 여기서는 종류를 바꿔 올리거나 지웁니다.</div>
        : null}
      {d.docs.length ? (
        <div className="dw-docs">
          {d.docs.map(f => (
            <div className="dw-doc" key={f.id}>
              <Icon id="i-file" className="ic-sm" />
              <button className="dw-doc-n" disabled={pending} onClick={() => open(f.path)}
                title="새 창에서 열기">{f.nm}</button>
              <span className="dw-doc-m">{docLabel(f.kind)} · {sizeLabel(f.size)} · {atLabel(f.at)}</span>
              <button className="dw-doc-x" disabled={pending}
                onClick={() => drop(f.id, f.nm)} aria-label={`${f.nm} 지우기`}>
                <Icon id="i-x" className="ic-sm" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="dw-none">
          아직 올라온 서류가 없습니다. 올리면 왼쪽 창에서 바로 펼쳐집니다.
        </div>
      )}

      {d.others.length ? (
        <>
          <Sec t="다른 지원 내역" n={d.others.length} />
          <div className="dw-others">
            {d.others.map(o => (
              <div className="dw-other" key={o.id}>
                <b>{o.title}</b>
                <span className={'dw-o-st' + (o.live ? ' live' : '')}>{o.stage}</span>
                <em>{o.ap} · {o.src}</em>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <Sec t="전형 타임라인" right={<span className="hint">모든 값은 발생 시점에 자동 기록됩니다</span>} />
      <div className="tl">
        {d.timeline.map((t, i) => (
          <div className={'tl-i ' + (t.s || '')} key={i}>
            <b>{t.b}</b><span className="t">{t.t}</span><p>{t.p}</p>
          </div>
        ))}
      </div>
    </>
  )
}

/* ---------- 평가·판정 ---------- */
function EvalTab({ d }: { d: DrawerData }) {
  return (
    <>
      <DecisionClient
        view={d.decision} cid={d.cid} cand={d.nm} pos={d.pos.title} sender={d.sender}
        {...(d.rj ? { rj: d.rj.code } : {})}
      />
      <Sec t="평가" n={d.evals.length} right={
        d.evals.length ? <Link className="btn quiet" href={`/e/${d.cid}`}>나란히 비교</Link> : null
      } />
      {d.evals.length ? (
        <div className="dw-evals">
          {d.evals.map((e, i) => (
            <div className="dw-ev" key={i}>
              <div className="dw-ev-h">
                <span className="avatar">{e.iv.charAt(0)}</span>
                <div><b>{e.iv}</b><em>{e.role} · {e.st} · {e.at}</em></div>
                <span className={'pill ' + (isPositive(e.overall) ? 'ok' : 'bad')}>
                  {ratingDef(e.overall).l}
                </span>
              </div>
              <div className="dw-ev-i">
                {e.items.map((it, k) => (
                  <span key={k}>{it[0]}{' '}
                    <b className={isPositive(it[1]) ? 'good' : 'bad'}>{ratingDef(it[1]).l}</b>
                  </span>
                ))}
              </div>
              {e.memo ? <p>{e.memo}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="dw-none">아직 평가가 없습니다. 면접이 끝나면 평가지 작성 요청이 자동으로 나갑니다.</div>
      )}
    </>
  )
}

/* ---------- 면접(조율) ---------- */
function IvTab({ d, goIv }: { d: DrawerData; goIv: (id: string, w?: boolean) => void }) {
  if (!d.ivRows.length) return (
    <div className="dw-none">
      아직 면접이 없습니다. 이 후보자를 면접 단계로 옮기면 자리가 자동으로 세워집니다.
    </div>
  )
  return (
    <>
      {d.ivRows.length > 1 ? (
        <div className="dw-rounds">
          {d.ivRows.map(r => (
            <button key={r.id} className={'dw-round' + (r.id === d.ivSel ? ' on' : '')}
              onClick={() => goIv(r.id)}>
              <i className={'dw-rd ' + r.s} />{r.round}차
            </button>
          ))}
        </div>
      ) : null}
      <IvPanel rows={d.ivRows} {...(d.ivSel ? { sel: d.ivSel } : {})}
        detail={d.ivDetail} log={d.ivLog} nav={goIv} />
    </>
  )
}

/* ---------- 오퍼 ---------- */
function OfferTab({ d, setMsg }: { d: DrawerData; setMsg: (s: string) => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (d.offer) return <OfferClient offer={d.offer} candName={d.nm} seats={d.seats} />
  return (
    <div className="dw-start">
      <b>아직 처우안이 없습니다</b>
      <p>
        지금 만들면 공고의 급여 밴드 가운데 값으로 초안이 잡히고, 하이어링 매니저가 승인 줄의 첫 칸에 들어갑니다.
        금액·직급·자리는 만든 뒤에 고칠 수 있습니다.
      </p>
      <button className="btn solid" disabled={pending} onClick={() => start(async () => {
        const r = await createOffer(d.cid)
        if (!r.ok) setMsg(r.reason === 'exists' ? '이미 처우안이 있습니다.' : '처우안을 만들지 못했습니다.')
        router.refresh()
      })}>처우안 만들기</button>
    </div>
  )
}

/* ---------- 메일 ----------
   AI 는 쓰지 않는다(확정). 템플릿을 고르면 문장이 채워지고, 사람이 고쳐서 보낸다.
   회사 이름으로 나가는 글이라, 사람이 읽고 손댄 문장만 내보내는 편이 낫다. */
function MailTab({ d, setMsg }: { d: DrawerData; setMsg: (s: string) => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [code, setCode] = useState('')
  const [sub, setSub] = useState('')
  const [body, setBody] = useState('')
  const [open, setOpen] = useState('')

  /* 자리가 이미 정해진 면접이 있으면 그 시각을 템플릿에 그대로 넣는다 —
     '확정된 시간을 적어 주세요' 같은 빈칸을 사람이 다시 채우게 두지 않는다. */
  const fx = d.ivRows.find(r => r.id === d.ivSel && r.fixed) ?? d.ivRows.find(r => r.fixed)

  const load = (v: string) => {
    setCode(v)
    const t = tplByCode(v)
    if (!t) { setSub(''); setBody(''); return }
    const m = t.make({
      cand: d.nm, pos: d.pos.title, stage: d.stage.nm, rc: d.sender, company: 'TalentCore',
      ...(fx ? { when: fx.fixed, dur: fx.totalMin } : {}),
    })
    setSub(m.subject); setBody(m.body)
  }

  const send = () => start(async () => {
    const r = await sendMail({ cid: d.cid, kind: code || 'etc', subject: sub, body })
    setMsg(r.ok ? `${d.email ?? '후보자'} 에게 보냈습니다.`
      : (FAIL[r.reason ?? ''] ?? `보내지 못했습니다 (${r.reason ?? '알 수 없음'})`))
    if (r.ok) { setCode(''); setSub(''); setBody('') }
    router.refresh()
  })

  return (
    <>
      <Sec t="메일 쓰기" right={
        d.mailReady ? <span className="hint">보내는 사람 · {d.sender}</span>
          : <span className="pill warn">메일 키가 없어 실제로는 나가지 않습니다</span>
      } />
      {!d.email
        ? <div className="dw-none">이 후보자의 메일 주소가 없습니다 — 보내도 기록만 남습니다.</div>
        : null}
      <select className="dw-sel" value={code} aria-label="템플릿" onChange={e => load(e.target.value)}>
        <option value="">템플릿 고르기…</option>
        {MAIL_TPLS.map(t => <option key={t.v} value={t.v}>{t.l} — {t.d}</option>)}
      </select>
      <input className="dw-in" placeholder="제목" value={sub} onChange={e => setSub(e.target.value)} />
      <textarea className="dw-ta" rows={12} placeholder="내용" value={body}
        onChange={e => setBody(e.target.value)} />
      <div className="dw-mail-f">
        <span className="hint">받는 사람 · {d.email ?? '—'}</span>
        <button className="btn solid" disabled={pending || !sub.trim() || !body.trim()} onClick={send}>
          <Icon id="i-send" className="ic-sm" />보내기
        </button>
      </div>

      <Sec t="주고받은 기록" n={d.mails.length}
        right={<span className="hint">보낸 것도, 못 보낸 것도 남습니다</span>} />
      {d.mails.length ? (
        <div className="dw-mails">
          {d.mails.map(m => (
            <div key={m.id}>
              <button className="dw-ml-h" onClick={() => setOpen(open === m.id ? '' : m.id)}>
                <i className={'dw-ml-dot' + (m.ok ? ' ok' : '')} />
                <b>{m.subject}</b>
                <em>{kindLabel(m.kind)} · {m.at}
                  {m.ok ? '' : ` · 미발송${m.reason ? ` (${m.reason})` : ''}`}</em>
                <span>{open === m.id ? '접기' : '펼치기'}</span>
              </button>
              {open === m.id ? <pre className="dw-ml-b">{m.body}</pre> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="dw-none">아직 주고받은 메일이 없습니다.</div>
      )}
    </>
  )
}

function Sec({ t, n, right }: { t: string; n?: number; right?: React.ReactNode }) {
  return (
    <div className="sec-h dw-sec">
      <h3>{t}</h3>
      {n != null ? <span className="n">{n}건</span> : null}
      {right ? <div className="right">{right}</div> : null}
    </div>
  )
}

const CSS = `
/* 후보자 창 — 오른쪽 서랍이 아니라 화면 한가운데 뜨는 팝업이다.
   서랍은 좁아서 이력서를 함께 띄울 수 없었고, 옆으로 밀린 위치 탓에
   '보드의 곁다리'처럼 읽혔다. 지금은 이 창 하나가 곧 그 사람이다. */
.dw-back { position: fixed; inset: 0; background: rgba(23,23,28,.42);
  backdrop-filter: blur(2px); z-index: 50; animation: dw-fade .14s ease-out; }
.dw { position: fixed; inset: 0; margin: auto; z-index: 51;
  width: min(1240px, 95vw); height: min(880px, 92vh);
  background: var(--canvas); border-radius: var(--r-2xl); overflow: hidden;
  box-shadow: var(--sh-4); display: flex; flex-direction: column;
  animation: dw-rise .16s cubic-bezier(.2,.8,.25,1); }
@keyframes dw-fade { from { opacity: 0 } }
@keyframes dw-rise { from { opacity: 0; transform: translateY(8px) scale(.99) } }
@media (prefers-reduced-motion: reduce) { .dw, .dw-back { animation: none } }

/* 아래는 두 칸. 왼쪽 서류, 오른쪽 일. */
.dw-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 480px); }
.dw-side { min-width: 0; min-height: 0; display: flex; flex-direction: column;
  border-left: 1px solid var(--line); }
/* 좁은 화면에서는 서류 창을 접고 예전처럼 한 칸으로 — 반쪽짜리 이력서는 안 읽힌다. */
@media (max-width: 1080px) {
  .dw-main { grid-template-columns: 1fr; }
  .dw-side { border-left: 0; }
  .dv { display: none; }
}

/* ---- 서류 창 ---- */
.dv { position: relative; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--sunken); }
.dv.over::after { content: '여기에 놓으면 올라갑니다'; position: absolute; inset: 8px; z-index: 3;
  display: grid; place-items: center; border: 1.5px dashed var(--brand-rim); border-radius: var(--r-lg);
  background: var(--brand-soft); color: var(--brand-deep); font-size: 12.5px; font-weight: 600;
  pointer-events: none; }
.dv-h { flex: none; display: flex; align-items: center; gap: 7px; padding: 9px 12px;
  border-bottom: 1px solid var(--line); background: var(--canvas); }
.dv-h > .ic { color: var(--t4); flex: none; }
.dv-none-h { font-size: 12px; font-weight: 600; color: var(--t3); margin-right: auto; }
.dv-tabs { display: flex; gap: 2px; min-width: 0; overflow-x: auto; margin-right: auto;
  scrollbar-width: none; }
.dv-tabs::-webkit-scrollbar { display: none; }
.dv-t { flex: none; padding: 4px 10px; border: 0; border-radius: 999px; cursor: pointer;
  font: inherit; font-size: 11.5px; font-weight: 600; color: var(--t3); background: none; }
.dv-t:hover { background: var(--hover); color: var(--t1); }
.dv-t.on { background: var(--brand-soft); color: var(--brand-deep); }
.dv-b { flex: 1; min-height: 0; overflow: auto; display: flex; }
.dv-f { flex: 1; width: 100%; border: 0; background: #fff; }
.dv-img { margin: auto; max-width: 100%; height: auto; padding: 16px; }
.dv-empty { margin: auto; padding: 40px 28px; text-align: center; max-width: 340px;
  display: flex; flex-direction: column; align-items: center; gap: 8px; }
.dv-empty > .ic { width: 26px; height: 26px; color: var(--t4); margin-bottom: 2px; }
.dv-empty b { font-size: 13.5px; font-weight: 650; letter-spacing: -0.02em; }
.dv-empty p { font-size: 12px; color: var(--t3); line-height: 1.7; }
.dv-empty .btn { margin-top: 6px; }
.dv-f-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 7px 12px;
  border-top: 1px solid var(--line); background: var(--canvas); }
.dv-nm { font-size: 11.5px; font-weight: 600; color: var(--t2); min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dv-m { margin-left: auto; flex: none; font-size: 10.5px; color: var(--t4);
  font-variant-numeric: tabular-nums; }
.dw-hintline { font-size: 11.5px; color: var(--t4); margin: -4px 0 8px; }

.dw-h { display: flex; align-items: center; gap: 12px; padding: 15px 18px 14px;
  border-bottom: 1px solid var(--line); flex: none; }
.dw-h-t { min-width: 0; flex: 1; }
.dw-h-r { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dw-h-r b { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
.dw-h-s { font-size: 11.5px; color: var(--t3); margin-top: 3px; }
.dw-x { flex: none; width: 30px; height: 30px; display: grid; place-items: center; cursor: pointer;
  border: 0; border-radius: var(--r-sm); background: none; color: var(--t3); }
.dw-x:hover { background: var(--hover); color: var(--t1); }
.dw-tabs { display: flex; gap: 2px; padding: 0 14px; border-bottom: 1px solid var(--line); flex: none; }
.dw-tab { position: relative; padding: 10px 12px; border: 0; background: none; cursor: pointer;
  font: inherit; font-size: 12.5px; font-weight: 600; color: var(--t3); }
.dw-tab:hover { color: var(--t1); }
.dw-tab.on { color: var(--brand-deep); }
.dw-tab.on::after { content: ''; position: absolute; left: 8px; right: 8px; bottom: -1px;
  height: 2px; background: var(--brand); border-radius: 2px 2px 0 0; }
.dw-tab i { font-style: normal; font-size: 10.5px; color: var(--t4); margin-left: 5px;
  font-variant-numeric: tabular-nums; }
.dw-msg { padding: 9px 18px; font-size: 12.5px; color: var(--t2); background: var(--sunken);
  border-bottom: 1px solid var(--line); flex: none; }
.dw-body { flex: 1; overflow-y: auto; padding: 16px 18px 40px; }
.dw-sec { margin: 20px 0 10px; }
.dw-body > .dw-sec:first-child { margin-top: 0; }
.dw-kv { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 7px 12px; font-size: 12.5px; }
.dw-kv span { color: var(--t3); }
.dw-kv b { font-weight: 600; }
.dw-none { font-size: 12.5px; color: var(--t3); line-height: 1.65; padding: 14px 16px;
  background: var(--sunken); border-radius: var(--r-md); }
.dw-sel, .dw-in, .dw-ta { width: 100%; font: inherit; font-size: 12.5px; color: var(--t1);
  background: var(--canvas); border-radius: var(--r-sm); padding: 9px 11px;
  border: 1px solid var(--line-firm); margin-bottom: 8px; }
.dw-ta { line-height: 1.7; resize: vertical; }
.dw-sel.sm { width: auto; margin: 0; padding: 5px 8px; font-size: 11.5px; }
.dw-docs, .dw-others, .dw-mails { display: flex; flex-direction: column; gap: 1px; }
.dw-doc { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--r-sm);
  font-size: 12.5px; color: var(--t3); }
.dw-doc:hover { background: var(--hover); }
.dw-doc-n { border: 0; background: none; font: inherit; font-size: 12.5px; font-weight: 600;
  color: var(--t1); cursor: pointer; padding: 0; text-align: left; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dw-doc-n:hover { text-decoration: underline; }
.dw-doc-m { margin-left: auto; font-size: 11px; color: var(--t4); white-space: nowrap; }
.dw-doc-x { flex: none; border: 0; background: none; color: var(--t4); cursor: pointer;
  padding: 2px; border-radius: 4px; }
.dw-doc-x:hover { color: var(--esc); background: var(--esc-bg); }
.dw-other { display: flex; align-items: baseline; gap: 9px; padding: 8px 10px; font-size: 12.5px; }
.dw-other b { font-weight: 600; }
.dw-o-st { font-size: 11px; color: var(--t4); }
.dw-o-st.live { color: var(--done); font-weight: 600; }
.dw-other em { margin-left: auto; font-style: normal; font-size: 11px; color: var(--t4); }
.dw-dup { display: flex; align-items: center; gap: 10px; padding: 11px 13px; margin-bottom: 14px;
  border-radius: var(--r-md); background: var(--sunken); box-shadow: inset 0 0 0 1px var(--line-firm); }
.dw-dup b { display: block; font-size: 12.5px; }
.dw-dup span { font-size: 11.5px; color: var(--t3); }
.dw-dup .btn { margin-left: auto; flex: none; }
.dw-rj { padding: 13px 15px; margin-bottom: 16px; border-radius: var(--r-md);
  background: var(--canvas); box-shadow: inset 0 0 0 1px var(--esc-rim); }
.dw-rj-h { display: flex; align-items: center; gap: 8px; }
.dw-rj-h b { font-size: 13px; }
.dw-rj-h small { color: var(--t4); font-size: 11px; }
.dw-rj p { font-size: 11.5px; color: var(--t3); margin-top: 7px; line-height: 1.6; }
.dw-rj p.dw-rj-m { font-size: 12.5px; color: var(--t2); }
.dw-evals { display: flex; flex-direction: column; gap: 10px; }
.dw-ev { padding: 12px 14px; border-radius: var(--r-md); background: var(--sunken); }
.dw-ev-h { display: flex; align-items: center; gap: 9px; }
.dw-ev-h b { font-size: 12.5px; }
.dw-ev-h em { display: block; font-style: normal; font-size: 11px; color: var(--t4); }
.dw-ev-h .pill { margin-left: auto; }
.dw-ev-i { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 9px; font-size: 11.5px; color: var(--t3); }
.dw-ev-i b.good { color: var(--done); }
.dw-ev-i b.bad { color: var(--esc); }
.dw-ev p { font-size: 12px; color: var(--t2); margin-top: 8px; line-height: 1.6; }
.dw-rounds { display: flex; gap: 6px; margin-bottom: 14px; }
.dw-round { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; cursor: pointer;
  border: 0; border-radius: 999px; background: var(--sunken); font: inherit; font-size: 12px;
  font-weight: 600; color: var(--t2); }
.dw-round.on { background: var(--brand-soft); color: var(--brand-deep); }
.dw-rd { width: 6px; height: 6px; border-radius: 50%; background: var(--idle); }
.dw-rd.esc { background: var(--esc); } .dw-rd.late { background: var(--late); } .dw-rd.done { background: var(--done); }
.dw-start { padding: 26px 22px; text-align: center; background: var(--sunken); border-radius: var(--r-lg); }
.dw-start b { font-size: 14px; }
.dw-start p { font-size: 12.5px; color: var(--t3); line-height: 1.7; margin: 8px auto 16px; max-width: 420px; }
.dw-mail-f { display: flex; align-items: center; gap: 10px; }
.dw-mail-f .btn { margin-left: auto; }
.dw-ml-h { display: flex; align-items: baseline; gap: 8px; width: 100%; padding: 8px 10px;
  border: 0; border-radius: var(--r-sm); background: none; font: inherit; cursor: pointer; text-align: left; }
.dw-ml-h:hover { background: var(--hover); }
.dw-ml-h b { font-size: 12.5px; font-weight: 600; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; }
.dw-ml-h em { font-style: normal; font-size: 11px; color: var(--t4); white-space: nowrap; }
.dw-ml-h span { margin-left: auto; font-size: 11px; color: var(--t4); flex: none; }
.dw-ml-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; background: var(--esc);
  align-self: center; }
.dw-ml-dot.ok { background: var(--done); }
.dw-ml-b { margin: 0 10px 10px; padding: 12px 14px; background: var(--sunken); border-radius: var(--r-md);
  font-family: inherit; font-size: 12px; line-height: 1.7; color: var(--t2);
  white-space: pre-wrap; word-break: break-word; max-height: 360px; overflow: auto; }
@media (max-width: 820px) { .dw { width: 100vw; } }
`
