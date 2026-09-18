'use client'

/* =========================================================
   공고 개설 (C-2) — 채용 사이클의 시작점
   ---------------------------------------------------------
   · 시작점은 두 갈래다 (Greenhouse "Start from template / Copy an existing job",
     Ashby 의 인터뷰 플랜 복사와 같은 구조):
       ① 템플릿 4종 중 하나   ② 이전 공고 복사(기본 정보 + 단계 + 면접관 + 자동화 규칙)
   · 고른 뒤 그 자리에서 단계를 고칠 수 있다 — 이름·종류·기준 체류일·면접 시간·방식,
     순서 이동, 추가·삭제. 첫 칸 '지원 접수'와 끝 레일(입사·불합격)은 고정이다.
   · 면접관 한 명 한 명을 고르는 일은 여기서 하지 않는다. 폼이 길어지면 개설 자체가
     미뤄진다 — 만들고 나면 곧장 설정 화면(/p/{id}/setup)으로 보낸다.
   · 색은 상태에만 — 선택된 카드는 색이 아니라 테두리·배경 농도로 표시한다.
   ========================================================= */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import type { Person, StageKind } from '../lib/data'
import { TEMPLATES, templateById, ramp, STAGE_MAX, type CustomStage } from '../lib/templates'
import { createPosition } from '../lib/actions'

const EMPS = ['정규직', '계약직', '파트타임', '인턴', '프리랜서', '파견']
const KIND_OPTS: { v: StageKind; l: string }[] = [
  { v: 'screen', l: '검토' }, { v: 'interview', l: '인터뷰' },
  { v: 'task', l: '과제' }, { v: 'offer', l: '오퍼' },
]
const DUR_OPTS = [30, 45, 60, 90, 120]
const MODE_OPTS = ['화상', '대면', '전화']
/* 설정 화면(StageEditor)의 추가 버튼과 같은 목록 */
const PRESETS: CustomStage[] = [
  { nm: '사전 과제', kind: 'task', sla: 5, dur: 0, mode: '비대면' },
  { nm: '컬처핏 인터뷰', kind: 'interview', sla: 4, dur: 60, mode: '화상' },
  { nm: '실무 인터뷰', kind: 'interview', sla: 5, dur: 90, mode: '대면' },
  { nm: '레퍼런스 체크', kind: 'screen', sla: 3, dur: 0, mode: '—' },
  { nm: '임원 면접', kind: 'interview', sla: 7, dur: 60, mode: '대면' },
]

export interface CopySource {
  id: string; title: string; dept: string; team: string; emp: string
  rec: string; hm: string; band: [number, number]; jd: string
  st: string; opened: string
  stages: CustomStage[]
}

type Row = CustomStage & { key: number }
let seq = 0
const withKeys = (list: CustomStage[]): Row[] => list.map(s => ({ ...s, key: ++seq }))
/* 템플릿 본문의 첫 칸(지원 접수)은 고정 줄로 따로 그린다 */
const fromTemplate = (id: string) => withKeys(templateById(id).body.filter(s => s.kind !== 'apply'))

const ST_LABEL: Record<string, string> = { open: '오픈', hold: '홀드', closed: '마감' }

export default function NewPosition(
  { people, depts, sources }: { people: Person[]; depts: string[]; sources: CopySource[] },
) {
  const router = useRouter()
  /* 퇴사자는 새 공고의 담당자로 세울 수 없다(T4 — TalentCore 재직 상태를 따른다). */
  const recruiters = people.filter(p => p.active !== false && p.roles.includes('리크루터'))
  const managers = people.filter(p => p.active !== false && p.roles.includes('하이어링 매니저'))

  const [title, setTitle] = useState('')
  const [dept, setDept] = useState(depts[0] || '')
  const [team, setTeam] = useState('')
  const [emp, setEmp] = useState(EMPS[0])
  const [rec, setRec] = useState(recruiters[0]?.nm || '')
  const [hm, setHm] = useState(managers[0]?.nm || '')
  const [lo, setLo] = useState('6000')
  const [hi, setHi] = useState('8000')
  const [jd, setJd] = useState('')

  const [mode, setMode] = useState<'tpl' | 'copy'>('tpl')
  const [tpl, setTpl] = useState(TEMPLATES[0].id)
  const [from, setFrom] = useState('')          // 복사해 온 공고 id
  const [rows, setRows] = useState<Row[]>(() => fromTemplate(TEMPLATES[0].id))
  const [edited, setEdited] = useState(false)   // 템플릿·복사본에서 손댄 적이 있는가

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const ready = title.trim().length > 0 && team.trim().length > 0 && rows.length > 0
  const src = sources.find(s => s.id === from)
  const deptOpts = dept && !depts.includes(dept) ? [dept, ...depts] : depts
  const recOpts = rec && !recruiters.some(u => u.nm === rec) ? [rec, ...recruiters.map(u => u.nm)] : recruiters.map(u => u.nm)
  const hmOpts = hm && !managers.some(u => u.nm === hm) ? [hm, ...managers.map(u => u.nm)] : managers.map(u => u.nm)
  const total = rows.length + 1
  const noOffer = !rows.some(r => r.kind === 'offer')

  function pickTemplate(id: string) {
    setTpl(id)
    setRows(fromTemplate(id))
    setEdited(false)
  }

  function pickSource(id: string) {
    setFrom(id)
    const s = sources.find(x => x.id === id)
    if (!s) return
    setTitle(s.title)
    setDept(s.dept)
    setTeam(s.team)
    setEmp(s.emp)
    setRec(s.rec)
    setHm(s.hm)
    setLo(String(s.band[0] || 0))
    setHi(String(s.band[1] || 0))
    setJd(s.jd)
    setRows(withKeys(s.stages))
    setEdited(false)
  }

  function switchMode(m: 'tpl' | 'copy') {
    if (m === mode) return
    setMode(m)
    if (m === 'tpl') { setFrom(''); pickTemplate(tpl) }
  }

  /* ---- 단계 편집 ---- */
  function patch(key: number, p: Partial<CustomStage>) {
    setEdited(true)
    setRows(list => list.map(r => {
      if (r.key !== key) return r
      const next = { ...r, ...p }
      /* 종류를 바꾸면 그 종류에 맞는 기본값으로 — 검토 단계에 '60분 · 화상'이 남으면 안 된다 */
      if (p.kind && p.kind !== r.kind) {
        if (p.kind === 'interview') { next.dur = r.dur || 60; next.mode = MODE_OPTS.includes(r.mode) ? r.mode : '화상' }
        else { next.dur = 0; next.mode = p.kind === 'task' ? '비대면' : '—'; next.ivs = [] }
      }
      return next
    }))
  }
  function move(key: number, d: -1 | 1) {
    setEdited(true)
    setRows(list => {
      const i = list.findIndex(r => r.key === key)
      const j = i + d
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function remove(key: number) {
    setEdited(true)
    setRows(list => list.filter(r => r.key !== key))
  }
  function add(p: CustomStage | null) {
    if (total >= STAGE_MAX) return
    setEdited(true)
    const base: CustomStage = p ?? { nm: '새 단계', kind: 'screen', sla: 3, dur: 0, mode: '—' }
    setRows(list => {
      /* 오퍼는 보통 맨 끝이라, 새 단계는 오퍼 앞에 넣는다 */
      const at = list.length && list[list.length - 1].kind === 'offer' ? list.length - 1 : list.length
      return [...list.slice(0, at), { ...base, key: ++seq }, ...list.slice(at)]
    })
  }

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setErr(null)
    const r = await createPosition({
      title, dept, team, emp, rec, hm,
      bandLo: Math.max(0, +lo || 0), bandHi: Math.max(0, +hi || 0),
      jd, template: tpl,
      stages: rows.map(({ key: _k, ...s }) => s),
      ...(mode === 'copy' && from ? { copyFrom: from } : {}),
    })
    if (!r.ok || !r.id) {
      setBusy(false)
      setErr(r.reason === 'no-title' ? '공고명을 입력해 주세요.' : `저장하지 못했습니다 — ${r.reason}`)
      return
    }
    /* 만든 직후 설정 화면으로. refresh 를 먼저 불러야 목록·사이드바가
       새 공고를 이미 아는 상태로 넘어간다. */
    router.refresh()
    router.push(`/p/${r.id}/setup`)
  }

  return (
    <>
      <header className="top">
        <div className="crumb">
          <Icon id="i-briefcase" className="ic-sm" /><Link href="/positions">공고</Link>
          <span className="sep">/</span>새 공고
        </div>
        <div className="h-row">
          <h1>공고 개설</h1>
          <div className="spacer">
            <Link className="btn quiet" href="/positions">취소</Link>
            <button className="btn solid" disabled={!ready || busy} onClick={submit}>
              <Icon id="i-plus" className="ic-sm" />{busy ? '만드는 중…' : '공고 만들기'}
            </button>
          </div>
        </div>
        <div className="meta">
          <i><Icon id="i-info" className="ic-sm" />만들면 곧바로 <b>공고 설정</b> 화면으로 이동합니다</i>
        </div>
      </header>

      <div className="stage">
        <div className="np-grid">
          {/* ---------- 왼쪽: 입력 ---------- */}
          <div style={{ minWidth: 0 }}>
            {/* ---------- 시작점 ---------- */}
            <div className="sec-h"><h3>시작점</h3></div>
            <div className="sheet" style={{ padding: '14px 16px' }}>
              <div className="np-seg" role="tablist">
                <button className={mode === 'tpl' ? 'on' : ''} onClick={() => switchMode('tpl')} aria-pressed={mode === 'tpl'}>
                  <Icon id="i-columns" className="ic-sm" />템플릿에서 시작
                </button>
                <button className={mode === 'copy' ? 'on' : ''} onClick={() => switchMode('copy')} aria-pressed={mode === 'copy'}>
                  <Icon id="i-copy" className="ic-sm" />이전 공고 복사
                </button>
              </div>
              {mode === 'copy' && (
                <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                  <label>복사할 공고</label>
                  <select className="sel" value={from} onChange={e => pickSource(e.target.value)}>
                    <option value="">공고 선택</option>
                    {sources.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.title} · {s.team || s.dept} · {ST_LABEL[s.st] || s.st} · {s.stages.length + 1}단계
                      </option>
                    ))}
                  </select>
                  <p className="np-hlp">
                    {src
                      ? <>기본 정보·단계·면접관·자동화 규칙을 가져왔습니다. 후보자와 지원 링크는 가져오지 않습니다.</>
                      : <>기본 정보·단계·면접관·자동화 규칙을 그대로 가져옵니다. 후보자와 지원 링크는 가져오지 않습니다.</>}
                  </p>
                </div>
              )}
            </div>

            <div className="sec-h" style={{ marginTop: 26 }}><h3>기본 정보</h3></div>
            <div className="sheet" style={{ padding: '16px 18px' }}>
              <div className="row2">
                <div className="field">
                  <label>공고명</label>
                  <input
                    className="in" value={title} autoFocus
                    placeholder="예) 백엔드 엔지니어 (시니어)"
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>고용형태</label>
                  <select className="sel" value={emp} onChange={e => setEmp(e.target.value)}>
                    {(EMPS.includes(emp) ? EMPS : [emp, ...EMPS]).map(x => <option key={x}>{x}</option>)}
                  </select>
                </div>
              </div>

              <div className="row2">
                <div className="field">
                  <label>부문</label>
                  <select className="sel" value={dept} onChange={e => setDept(e.target.value)}>
                    {deptOpts.map(x => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>팀</label>
                  <input
                    className="in" value={team} placeholder="예) 서버팀"
                    onChange={e => setTeam(e.target.value)}
                  />
                </div>
              </div>

              <div className="row2">
                <div className="field">
                  <label>담당 리크루터</label>
                  <select className="sel" value={rec} onChange={e => setRec(e.target.value)}>
                    {recOpts.map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>하이어링 매니저</label>
                  <select className="sel" value={hm} onChange={e => setHm(e.target.value)}>
                    {hmOpts.map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              <div className="row2">
                <div className="field">
                  <label>연봉 밴드 하한 (만원)</label>
                  <input className="in" type="number" min={0} step={100} value={lo}
                    onChange={e => setLo(e.target.value)} />
                </div>
                <div className="field">
                  <label>연봉 밴드 상한 (만원)</label>
                  <input className="in" type="number" min={0} step={100} value={hi}
                    onChange={e => setHi(e.target.value)} />
                </div>
              </div>

              <div className="field">
                <label>JD (직무 소개)</label>
                <textarea
                  className="ta" value={jd}
                  placeholder="어떤 일을 하는 공고인지 두세 줄로 적어 주세요. 지원 링크와 안내 메일에 그대로 쓰입니다."
                  onChange={e => setJd(e.target.value)}
                />
              </div>
            </div>

            {/* ---------- 전형 프로세스 ---------- */}
            <div className="sec-h" style={{ marginTop: 26 }}>
              <h3>전형 프로세스</h3>
              <span className="n">{total}단계</span>
              {edited && <span className="pill">직접 수정함</span>}
              <span className="hint">단계가 그대로 보드의 열이 됩니다 · 만든 뒤에도 공고 설정에서 바꿀 수 있습니다</span>
            </div>

            {mode === 'tpl' && (
              <div className="np-tpl" style={{ marginBottom: 12 }}>
                {TEMPLATES.map(x => (
                  <button
                    key={x.id}
                    className={'np-card' + (x.id === tpl ? ' on' : '')}
                    onClick={() => pickTemplate(x.id)}
                    aria-pressed={x.id === tpl}
                  >
                    <b>
                      <i className="np-ck">{x.id === tpl && <Icon id="i-mark" className="ic-sm" />}</i>
                      {x.nm}
                    </b>
                    <span>{x.why}</span>
                    <em>{x.body.length}단계</em>
                  </button>
                ))}
              </div>
            )}
            {mode === 'copy' && !src && (
              <div className="np-hlp" style={{ margin: '0 0 12px' }}>
                복사할 공고를 고르면 그 공고의 단계가 여기에 채워집니다. 고르기 전에는 표준 채용 단계로 시작합니다.
              </div>
            )}

            <div className="sheet np-list">
              <div className="np-row lock">
                <span className="np-no">1</span>
                <i className="se-sw" style={{ background: ramp(total, 0) }} />
                <b className="np-fixed">지원 접수</b>
                <span className="np-tag"><Icon id="i-lock" className="ic-sm" />첫 단계 고정</span>
              </div>
              {rows.map((r, i) => (
                <div className="np-row" key={r.key}>
                  <span className="np-no">{i + 2}</span>
                  <i className="se-sw" style={{ background: ramp(total, i + 1) }} />
                  <input
                    className="in np-nm" value={r.nm} maxLength={30} aria-label="단계 이름"
                    onChange={e => patch(r.key, { nm: e.target.value })}
                  />
                  <select className="sel np-kind" value={r.kind} aria-label="종류"
                    onChange={e => patch(r.key, { kind: e.target.value as StageKind })}>
                    {KIND_OPTS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
                  </select>
                  <label className="np-num" title="이 기간을 넘기면 지연으로 봅니다">
                    <span>기준</span>
                    <input className="in" type="number" min={1} max={60} value={r.sla}
                      onChange={e => patch(r.key, { sla: Math.max(1, Math.min(60, +e.target.value || 1)) })} />
                    <span>일</span>
                  </label>
                  {r.kind === 'interview' && (
                    <>
                      <select className="sel np-dur" value={r.dur} aria-label="면접 시간"
                        onChange={e => patch(r.key, { dur: +e.target.value })}>
                        {(DUR_OPTS.includes(r.dur) ? DUR_OPTS : [r.dur, ...DUR_OPTS]).map(d => <option key={d} value={d}>{d}분</option>)}
                      </select>
                      <select className="sel np-mode" value={r.mode} aria-label="방식"
                        onChange={e => patch(r.key, { mode: e.target.value })}>
                        {MODE_OPTS.map(m => <option key={m}>{m}</option>)}
                      </select>
                      {!!r.ivs?.length && (
                        <span className="np-tag" title="복사해 온 면접관 — 공고 설정에서 바꿀 수 있습니다">
                          <Icon id="i-users" className="ic-sm" />면접관 {r.ivs.length}명
                        </span>
                      )}
                    </>
                  )}
                  <span className="np-act">
                    <button className="btn quiet sm" title="위로" disabled={i === 0} onClick={() => move(r.key, -1)}>
                      <Icon id="i-chevron" className="ic-sm np-up" />
                    </button>
                    <button className="btn quiet sm" title="아래로" disabled={i === rows.length - 1} onClick={() => move(r.key, 1)}>
                      <Icon id="i-chevron" className="ic-sm" />
                    </button>
                    <button className="btn quiet sm" title="삭제" disabled={rows.length <= 1} onClick={() => remove(r.key)}>
                      <Icon id="i-x" className="ic-sm" />
                    </button>
                  </span>
                </div>
              ))}
              <button className="se-add" onClick={() => add(null)} disabled={total >= STAGE_MAX}>
                <Icon id="i-plus" className="ic-sm" />단계 추가
                {total >= STAGE_MAX && <span className="np-hlp" style={{ margin: '0 0 0 6px' }}>최대 {STAGE_MAX}단계</span>}
              </button>
            </div>

            <div className="preset">
              {PRESETS.map((pz, i) => (
                <button key={i} onClick={() => add(pz)} disabled={total >= STAGE_MAX}>
                  <Icon id="i-plus" className="ic-sm" />{pz.nm}
                </button>
              ))}
            </div>

            <div className="se-rails">
              <span className="se-rails-t"><Icon id="i-lock" className="ic-sm" />끝 단계 — 순서와 이름이 고정입니다</span>
              <span className="se-rail"><i className="se-sw" style={{ background: '#0a9459' }} /><b>입사</b></span>
              <span className="se-rail"><i className="se-sw" style={{ background: '#a8a8b2' }} /><b>불합격</b></span>
            </div>

            {noOffer && (
              <div className="note" style={{ marginTop: 14 }}>
                <h4><Icon id="i-alert" className="ic-sm" />오퍼 단계가 없습니다</h4>
                <ul><li>오퍼 초안·결재·오퍼레터가 이 단계에서 움직입니다. 없으면 마지막에 <b>오퍼</b> 단계를 자동으로 붙입니다.</li></ul>
              </div>
            )}

            {err && (
              <div className="note" style={{ marginTop: 14 }}>
                <h4><Icon id="i-alert" className="ic-sm" />저장 실패</h4>
                <ul><li>{err}</li></ul>
              </div>
            )}
          </div>

          {/* ---------- 오른쪽: 설명 ---------- */}
          <div style={{ minWidth: 0 }}>
            <div className="sec-h"><h3>이 다음에 할 일</h3></div>
            <div className="sheet" style={{ padding: '15px 16px' }}>
              <InfoRow i="i-users" t="면접관 지정" d="단계마다 누가 들어갈지 정합니다. 빈 시간은 그 사람들 일정으로 찾습니다." />
              <InfoRow i="i-link" t="지원 링크" d="채널별 링크를 만들면 어디서 들어온 지원인지 자동으로 기록됩니다." />
              <InfoRow i="i-zap" t="자동화 규칙" d="에스컬레이션 8종의 임계값을 이 공고에 맞게 조정합니다." />
            </div>

            <div className="note" style={{ marginTop: 14 }}>
              <h4><Icon id="i-info" className="ic-sm" />인력충원 요청으로 연 공고는</h4>
              <ul>
                <li>
                  TalentCore 에서 결재가 끝난 요청서의 포지션을 <b>[Hire 로 보내기]</b> 하면
                  공고가 자동으로 열립니다(공고명·부서·밴드·JD·면접관 채움).
                </li>
                <li>이 화면은 요청서 없이 직접 여는 경우입니다.</li>
              </ul>
            </div>

            <div className="note" style={{ marginTop: 14 }}>
              <h4><Icon id="i-info" className="ic-sm" />연봉 밴드를 왜 지금 받나요</h4>
              <ul>
                <li>후보자가 오퍼 단계로 넘어가면 <b>처우안 초안</b>이 이 밴드를 복사해 자동으로 만들어집니다.</li>
                <li>밴드를 넘는 금액을 쓰면 오퍼 화면이 경고를 띄웁니다.</li>
              </ul>
            </div>
          </div>
        </div>
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
