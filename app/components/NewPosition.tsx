'use client'

/* =========================================================
   공고 개설 (C-2) — 채용 사이클의 시작점
   ---------------------------------------------------------
   · 한 화면, 한 번의 제출. 단계는 여기서 짜지 않고 템플릿으로 고른다
     (근거는 lib/templates.ts 머리말).
   · 만들고 나면 곧장 설정 화면(/p/{id}/setup)으로 보낸다.
     거기서 면접관·체류일을 붙이는 게 다음에 할 일이기 때문이다.
   · 색은 상태에만 — 선택된 템플릿 카드는 색이 아니라 테두리·배경 농도로 표시한다.
   ========================================================= */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import type { Person } from '../lib/data'
import { TEMPLATES, templateById, ramp } from '../lib/templates'
import { createPosition } from '../lib/actions'

const EMPS = ['정규직', '계약직', '파트타임', '인턴', '프리랜서', '파견']
const KIND_LABEL: Record<string, string> = {
  apply: '접수', screen: '검토', interview: '인터뷰',
  task: '과제', offer: '오퍼', hired: '입사', reject: '불합격',
}

export default function NewPosition(
  { people, depts }: { people: Person[]; depts: string[] },
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
  const [tpl, setTpl] = useState(TEMPLATES[0].id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const t = templateById(tpl)
  const ready = title.trim().length > 0 && team.trim().length > 0

  async function submit() {
    if (!ready || busy) return
    setBusy(true)
    setErr(null)
    const r = await createPosition({
      title, dept, team, emp, rec, hm,
      bandLo: Math.max(0, +lo || 0), bandHi: Math.max(0, +hi || 0),
      jd, template: tpl,
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
          <i><Icon id="i-info" className="ic-sm" />만들면 곧바로 <b>단계 설정</b> 화면으로 이동합니다</i>
        </div>
      </header>

      <div className="stage">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 26, alignItems: 'start' }}>
          {/* ---------- 왼쪽: 입력 ---------- */}
          <div>
            <div className="sec-h"><h3>기본 정보</h3></div>
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
                    {EMPS.map(x => <option key={x}>{x}</option>)}
                  </select>
                </div>
              </div>

              <div className="row2">
                <div className="field">
                  <label>부문</label>
                  <select className="sel" value={dept} onChange={e => setDept(e.target.value)}>
                    {depts.map(x => <option key={x}>{x}</option>)}
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
                    {recruiters.map(u => <option key={u.id}>{u.nm}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>하이어링 매니저</label>
                  <select className="sel" value={hm} onChange={e => setHm(e.target.value)}>
                    {managers.map(u => <option key={u.id}>{u.nm}</option>)}
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
                  placeholder="이 자리가 무엇을 하는 자리인지 두세 줄로 적어 주세요. 지원 링크와 안내 메일에 그대로 쓰입니다."
                  onChange={e => setJd(e.target.value)}
                />
              </div>
            </div>

            {/* ---------- 전형 프로세스 템플릿 ---------- */}
            <div className="sec-h" style={{ marginTop: 26 }}>
              <h3>전형 프로세스</h3>
              <span className="n">{t.body.length}단계</span>
              <span className="hint">고른 단계가 그대로 보드의 열이 됩니다 · 나중에 바꿀 수 있습니다</span>
            </div>
            <div className="np-tpl">
              {TEMPLATES.map(x => (
                <button
                  key={x.id}
                  className={'np-card' + (x.id === tpl ? ' on' : '')}
                  onClick={() => setTpl(x.id)}
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

            <div className="sheet np-flow">
              {t.body.map((s, i) => (
                <span className="np-step" key={i}>
                  <i className="se-sw" style={{ background: ramp(t.body.length, i) }} />
                  {s.nm}
                  <em>{KIND_LABEL[s.kind]}{s.dur ? ` · ${s.dur}분` : ''}</em>
                </span>
              ))}
              <span className="np-arrow"><Icon id="i-chevron" className="ic-sm" /></span>
              <span className="np-step rail"><i className="se-sw" style={{ background: '#0a9459' }} />입사</span>
              <span className="np-step rail"><i className="se-sw" style={{ background: '#a8a8b2' }} />불합격</span>
            </div>

            {err && (
              <div className="note" style={{ marginTop: 14 }}>
                <h4><Icon id="i-alert" className="ic-sm" />저장 실패</h4>
                <ul><li>{err}</li></ul>
              </div>
            )}
          </div>

          {/* ---------- 오른쪽: 설명 ---------- */}
          <div>
            <div className="sec-h"><h3>이 다음에 할 일</h3></div>
            <div className="sheet" style={{ padding: '15px 16px' }}>
              <Row i="i-users" t="면접관 지정" d="단계마다 누가 들어갈지 정합니다. 캘린더 교집합은 그 사람들 걸로 찾습니다." />
              <Row i="i-clock" t="기준 체류일" d="단계별로 며칠을 넘기면 지연으로 볼지 정합니다." />
              <Row i="i-link" t="지원 링크" d="채널별 링크를 만들면 어디서 들어온 지원인지 자동으로 기록됩니다." />
              <Row i="i-zap" t="자동화 규칙" d="에스컬레이션 8종의 임계값을 이 공고에 맞게 조정합니다." />
            </div>

            <div className="note" style={{ marginTop: 14 }}>
              <h4><Icon id="i-info" className="ic-sm" />채용 요청은 어디에 있나요</h4>
              <ul>
                <li>
                  <b>정원·예산 결재(채용 요청)</b>는 조직과 인건비를 들고 있는
                  <b> TalentCore</b>에서 처리합니다.
                </li>
                <li>
                  Hire는 <b>승인이 끝난 요청</b>을 받아 공고를 여는 쪽입니다.
                  연결 전까지는 여기서 직접 공고를 만듭니다.
                </li>
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

function Row({ i, t, d }: { i: string; t: string; d: string }) {
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
