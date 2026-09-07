'use client'

/* =========================================================
   직원 명부 · 면접관 (T4)
   ---------------------------------------------------------
   이 화면 하나가 두 가지 일을 한다.
   · 지금 면접에 부를 수 있는 사람이 누구인지 본다(면접관 탭)
   · 그 사람을 전체 직원 명부에서 골라 켠다(전체 직원 탭)

   왜 전 직원을 다 가져오고 기본은 꺼 두는가:
     면접에 안 들어가는 사람까지 면접관 목록에 서면, 면접관 고르는 칸이
     100줄 넘게 되어 쓸모가 없어진다. 그렇다고 매니저·리크루터만 가져오면
     실무 면접관 한 명 추가할 때마다 인사팀에 전화해야 한다.
     Greenhouse·Ashby 가 쓰는 절충이 이거다 — 전원 데려오고, 채용 역할은
     ATS 안에서 준다.

   칸 소유권을 화면에서도 지킨다.
     자물쇠가 붙은 칸(이름·직함·부서·메일·재직여부)은 TalentCore 것이라
     여기서 못 고친다. 고치면 다음 동기화에 되돌아가서 더 헷갈린다.
     면접 역할·조율 방식·알림 채널·응답 기준만 여기서 고친다.

   디자인 규칙: 색은 상태에만. 버튼·태그는 전부 무채색이다.
   ========================================================= */
import { Fragment, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import { setPersonRoles, setPersonPrefs, syncDirectoryNow } from '../lib/actions'

/* 면접에 부를 수 있는 사람 = 이 역할 중 하나라도 달린 사람. */
const IV_ROLES = ['인터뷰어', '하이어링 매니저']
const ALL_ROLES = ['인터뷰어', '하이어링 매니저', '리크루터', '코디네이터']

const CH_LABEL: Record<string, string> = { slack: 'Slack', email: '이메일', both: 'Slack + 이메일' }
const CORE_ROLE_LABEL: Record<string, string> = {
  admin: '관리자', manager: '매니저', recruiter: '리크루터', employee: '직원',
}

export interface Row {
  id: string; nm: string; tt: string; dept: string; email: string | null
  roles: string[]; ea: boolean; eaNm: string; ch: string; sla: number; resp: string
  src: 'core' | 'hire'; active: boolean; empNo: string; coreRole: string
  cap: { saved: boolean; fits: number; thin: boolean } | null
}
export interface CoreLink { state: 'unconfigured' | 'configured'; url: string; last: string | null }

const isIv = (r: Row) => r.roles.some(x => IV_ROLES.includes(x))

/* DB 미설정·새 칸 없음은 '실패'가 아니다 — 화면에는 반영되고 저장만 안 된 상태. */
const softFail = (r?: string) =>
  r === 'not-configured' ||
  !!(r && (r.indexOf('does not exist') >= 0 || r.indexOf('schema cache') >= 0))

function ago(iso: string | null): string {
  if (!iso) return '아직 한 번도 안 맞춤'
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000)
  if (h < 1) return '방금 전'
  if (h < 24) return h + '시간 전'
  return Math.floor(h / 24) + '일 전'
}

const SYNC_ERR: Record<string, string> = {
  'core-not-configured': 'TalentCore 주소·열쇠가 설정되지 않았습니다 (.env.local).',
  'not-configured': 'DB가 연결되지 않아 맞춘 결과를 저장할 수 없습니다.',
  unauthorized: 'TalentCore 가 열쇠를 거절했습니다. 토큰을 다시 확인해 주세요.',
  unreachable: 'TalentCore 에 닿지 못했습니다. 서버가 떠 있는지 확인해 주세요.',
  'bad-response': 'TalentCore 응답을 읽지 못했습니다.',
}

export default function Directory({ rows: rows0, link }: { rows: Row[]; link: CoreLink }) {
  const router = useRouter()
  const [tab, setTab] = useState<'iv' | 'all' | 'off'>('iv')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState('')      // 편집 패널이 열린 사람
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()
  /* 서버가 다시 계산해 줄 때까지 화면에서 먼저 반영한다 — router.refresh() 를
     기다리는 동안 방금 켠 사람이 그대로 꺼져 보이면 두 번 누른다. */
  const [patch, setPatch] = useState<Record<string, Partial<Row>>>({})

  const rows = useMemo(
    () => rows0.map(r => (patch[r.id] ? { ...r, ...patch[r.id] } : r)),
    [rows0, patch],
  )

  const live = rows.filter(r => r.active)
  const ivs = live.filter(isIv)
  const off = rows.filter(r => !r.active)
  const base = tab === 'iv' ? ivs : tab === 'off' ? off : live

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return base
    return base.filter(r =>
      r.nm.toLowerCase().includes(k) || r.dept.toLowerCase().includes(k) ||
      r.tt.toLowerCase().includes(k) || (r.email || '').toLowerCase().includes(k) ||
      r.empNo.toLowerCase().includes(k))
  }, [base, q])

  const run = (id: string, fn: () => Promise<{ ok: boolean; reason?: string }>, mine: Partial<Row>) => {
    setBusy(id); setErr('')
    setPatch(p => ({ ...p, [id]: { ...p[id], ...mine } }))
    fn().then(r => {
      if (!r.ok && !softFail(r.reason)) setErr(r.reason || '저장하지 못했습니다.')
      setBusy('')
      start(() => router.refresh())
    })
  }

  const toggleIv = (r: Row) => {
    const next = isIv(r)
      ? r.roles.filter(x => !IV_ROLES.includes(x))
      : [...r.roles, '인터뷰어']
    run(r.id, () => setPersonRoles(r.id, next), { roles: next })
  }

  const sync = () => {
    setBusy('__sync'); setErr(''); setMsg('')
    syncDirectoryNow().then(r => {
      setBusy('')
      if (!r.ok) { setErr(SYNC_ERR[r.reason || 'bad-response'] || '동기화하지 못했습니다.'); return }
      setPatch({})
      setMsg('직원 ' + r.read + '명을 읽었습니다 — 새로 ' + r.added + '명 · 정보 갱신 ' + r.updated + '명'
        + (r.deactivated ? ' · 퇴사 처리 ' + r.deactivated + '명' : '')
        + (r.reactivated ? ' · 복직 ' + r.reactivated + '명' : ''))
      start(() => router.refresh())
    })
  }

  const lock = (t: string) => (
    <span title={t} style={{ color: 'var(--t4)', marginLeft: 4 }}>
      <Icon id="i-shield" className="ic-sm" />
    </span>
  )

  return (
    <>
      <header className="top">
        <div className="crumb"><Icon id="i-user" className="ic-sm" />채용</div>
        <div className="h-row">
          <h1>면접관</h1>
          <span className="pill">면접관 {ivs.length}명</span>
          <span className="pill">전체 직원 {live.length}명</span>
          {!!off.length && <span className="pill">비활성 {off.length}명</span>}
          <div className="spacer">
            {link.state === 'configured'
              ? <button className="btn" onClick={sync} disabled={busy === '__sync'}>
                  <Icon id="i-refresh" className="ic-sm" />
                  {busy === '__sync' ? '맞추는 중…' : '지금 동기화'}
                </button>
              : <span className="pill">TalentCore 연동 안 됨</span>}
          </div>
        </div>
        <div className="meta">
          {link.state === 'configured'
            ? <>
                <i><Icon id="i-link" className="ic-sm" />TalentCore <b>{link.url}</b></i>
                <i><Icon id="i-clock" className="ic-sm" />마지막 동기화 <b>{ago(link.last)}</b> · 하루 한 번 자동</i>
              </>
            : <i><Icon id="i-info" className="ic-sm" />
                TalentCore 직원 명부를 당겨오려면 <b>.env.local</b> 에 CORE_URL · CORE_API_TOKEN 을 넣어야 합니다.
              </i>}
          <i><Icon id="i-shield" className="ic-sm" />
            이름·직함·부서·메일·재직여부는 <b>TalentCore 가 주인</b>이라 여기서 고칠 수 없습니다.
            면접 역할·조율 방식·알림 채널·응답 기준은 <b>Hire 것</b>입니다.
          </i>
        </div>
      </header>

      <div className="stage">
        {!!err &&
          <div className="sheet" style={{ padding: '12px 16px', marginBottom: 10, color: 'var(--esc)' }}>{err}</div>}
        {!!msg &&
          <div className="sheet" style={{ padding: '12px 16px', marginBottom: 10 }}>{msg}</div>}

        <div className="sec-h" style={{ marginBottom: 10 }}>
          <div className="seg">
            <button className={tab === 'iv' ? 'on' : ''} onClick={() => setTab('iv')}>면접관 {ivs.length}</button>
            <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>전체 직원 {live.length}</button>
            {!!off.length &&
              <button className={tab === 'off' ? 'on' : ''} onClick={() => setTab('off')}>비활성 {off.length}</button>}
          </div>
          <div className="spacer">
            <input
              className="sel" style={{ minWidth: 220 }} value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="이름 · 부서 · 사번으로 찾기"
            />
          </div>
        </div>

        {tab === 'all' &&
          <p className="hint" style={{ margin: '0 0 10px' }}>
            TalentCore 에서 온 직원은 <b>면접 안 함</b> 상태로 들어옵니다.
            면접에 부를 사람만 여기서 켜 주세요 — 켠 사람만 공고 설정의 면접관 목록에 나타납니다.
          </p>}
        {tab === 'off' &&
          <p className="hint" style={{ margin: '0 0 10px' }}>
            TalentCore 에서 재직 상태가 풀린 사람입니다. 새 면접에는 배정되지 않지만
            <b> 과거 면접 기록에는 그대로 남습니다</b>. 복직하면 다음 동기화에서 저절로 돌아옵니다.
          </p>}

        <div className="sheet">
          <table className="tb">
            <thead>
              {tab === 'iv'
                ? <tr>
                    <th>이름</th><th>역할 태그</th><th>조율 방식</th><th>알림 채널</th>
                    <th className="num">응답 제한</th><th className="num">평균 응답</th>
                    <th>앞으로 2주</th><th></th>
                  </tr>
                : <tr>
                    <th>이름</th><th>부서 · 직함</th><th>사번</th><th>TalentCore 역할</th>
                    <th>면접</th><th></th>
                  </tr>}
            </thead>
            <tbody>
              {!shown.length &&
                <tr><td colSpan={8} style={{ color: 'var(--t3)', padding: '18px 0', textAlign: 'center' }}>
                  {q ? '찾는 사람이 없습니다.' : '아직 아무도 없습니다.'}
                </td></tr>}

              {shown.map(u => {
                const capCell = !u.cap
                  ? <span style={{ color: 'var(--t4)' }}>—</span>
                  : !u.cap.saved
                    ? <span className="pill"><Icon id="i-mail" className="ic-sm" />미제출</span>
                    : u.cap.fits === 0
                      ? <span className="pill bad"><Icon id="i-alert" className="ic-sm" />빈 시간 없음</span>
                      : u.cap.thin
                        ? <span className="pill warn">{u.cap.fits}건 · 여유 적음</span>
                        : <span style={{ color: 'var(--t2)' }}>60분 최대 <b>{u.cap.fits}</b>건</span>

                return (
                  <Fragment key={u.id}>
                    <tr>
                      <td className="strong">
                        {u.nm}
                        {u.src === 'core' && lock('TalentCore 직원 — 이름·직함·부서는 여기서 못 고칩니다')}
                        <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 2 }}>{u.tt} · {u.dept}</div>
                      </td>

                      {tab === 'iv' ? <>
                        <td>{u.roles.map(r =>
                          <span key={r} className="pill" style={{ marginRight: 4 }}>{r}</span>)}</td>
                        <td>{u.ea
                          ? <span className="pill bad">
                              <Icon id="i-shield" className="ic-sm" />EA 조율{u.eaNm ? ' (' + u.eaNm + ')' : ''}
                            </span>
                          : <span style={{ color: 'var(--t3)' }}>직접 연락</span>}</td>
                        <td style={{ color: 'var(--t2)' }}>{CH_LABEL[u.ch] || u.ch}</td>
                        <td className="num">{u.sla}h</td>
                        <td className="num" style={u.resp !== '—' && parseFloat(u.resp) > 8
                          ? { color: 'var(--late)', fontWeight: 600 } : undefined}>{u.resp}</td>
                        <td>{capCell}</td>
                        <td style={{ textAlign: 'right' }}>
                          <a className={'btn' + (u.cap && !u.cap.saved ? '' : ' quiet')}
                             href={'/avail/' + u.id} target="_blank" rel="noopener"
                             title="이 면접관이 직접 여는 화면입니다">
                            <Icon id="i-calendar" className="ic-sm" />
                            {u.cap && !u.cap.saved ? '가용시간 요청' : '가용시간'}
                          </a>
                          <button className="btn quiet" style={{ marginLeft: 6 }}
                                  onClick={() => setOpen(open === u.id ? '' : u.id)}>
                            <Icon id="i-sliders" className="ic-sm" />편집
                          </button>
                        </td>
                      </> : <>
                        <td style={{ color: 'var(--t2)' }}>{u.dept} · {u.tt}</td>
                        <td className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>{u.empNo || '—'}</td>
                        <td style={{ color: 'var(--t2)' }}>
                          {u.src === 'core'
                            ? (CORE_ROLE_LABEL[u.coreRole] || u.coreRole || '—')
                            : <span className="pill">Hire 등록</span>}
                        </td>
                        <td>{isIv(u)
                          ? <span className="pill"><Icon id="i-check-circle" className="ic-sm" />면접관</span>
                          : <span style={{ color: 'var(--t3)' }}>면접 안 함</span>}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className={'btn' + (isIv(u) ? ' quiet' : '')}
                                  disabled={busy === u.id || !u.active}
                                  onClick={() => toggleIv(u)}>
                            {busy === u.id ? '…' : isIv(u) ? '면접관 해제' : '면접관으로 지정'}
                          </button>
                        </td>
                      </>}
                    </tr>

                    {open === u.id && tab === 'iv' &&
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--sunken)', padding: '14px 16px' }}>
                          <EditRow
                            u={u} busy={busy === u.id}
                            onClose={() => setOpen('')}
                            onSave={(prefs, roles) => {
                              run(u.id, async () => {
                                const a = await setPersonRoles(u.id, roles)
                                const b = await setPersonPrefs(u.id, prefs)
                                return a.ok ? b : a
                              }, { roles, ea: prefs.ea, eaNm: prefs.ea ? prefs.eaNm : '', ch: prefs.ch, sla: prefs.sla })
                              setOpen('')
                            }}
                          />
                        </td>
                      </tr>}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="note">
          <ul>
            <li><b>면접관으로 지정</b>한 사람만 공고 설정·일정 조율의 면접관 목록에 나타납니다.
              전 직원을 목록에 세우지 않는 이유가 이것입니다.</li>
            <li>EA 플래그가 켜진 면접관이 낀 <b>모든 스케줄링</b>은 자동화에서 완전히 제외되고 즉시 코디네이터로 갑니다.
              직급으로 자동 감지하지 않고 <b>HR이 직접</b> 켭니다.</li>
            <li><b>가용시간</b> 버튼은 면접관이 계정 없이 여는 링크입니다. 링크를 보내 직접 채우게 하면,
              시간 후보를 메일로 주고받는 왕복이 사라집니다.</li>
            <li>퇴사자는 <b>지우지 않고 잠급니다</b>. 지우면 그 사람이 봤던 과거 면접 기록에서 이름이 사라집니다.</li>
          </ul>
        </div>
        {pending && <span className="hint">갱신 중…</span>}
      </div>
    </>
  )
}

/* ---- 한 사람 편집 — Hire 소유 칸만 있다 ---- */
function EditRow(
  { u, busy, onSave, onClose }: {
    u: Row
    busy: boolean
    onSave: (prefs: { ea: boolean; eaNm: string; ch: string; sla: number }, roles: string[]) => void
    onClose: () => void
  },
) {
  const [roles, setRoles] = useState<string[]>(u.roles)
  const [ea, setEa] = useState(u.ea)
  const [eaNm, setEaNm] = useState(u.eaNm)
  const [ch, setCh] = useState(u.ch)
  const [sla, setSla] = useState(String(u.sla))

  const flip = (r: string) =>
    setRoles(v => (v.includes(r) ? v.filter(x => x !== r) : [...v, r]))

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-end' }}>
        <div>
          <div className="hint" style={{ marginBottom: 4 }}>역할 태그</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ALL_ROLES.map(r =>
              <button key={r} className={'btn' + (roles.includes(r) ? ' solid' : ' quiet')}
                      onClick={() => flip(r)}>{r}</button>)}
          </div>
        </div>
        <div>
          <div className="hint" style={{ marginBottom: 4 }}>조율 방식</div>
          <button className={'btn' + (ea ? ' solid' : ' quiet')} onClick={() => setEa(v => !v)}>
            {ea ? 'EA 가 조율' : '직접 연락'}
          </button>
        </div>
        {ea &&
          <div>
            <div className="hint" style={{ marginBottom: 4 }}>비서 이름</div>
            <input className="sel" style={{ width: 120 }} value={eaNm}
                   onChange={e => setEaNm(e.target.value)} placeholder="김비서" />
          </div>}
        <div>
          <div className="hint" style={{ marginBottom: 4 }}>알림 채널</div>
          <select className="sel" value={ch} onChange={e => setCh(e.target.value)}>
            <option value="slack">Slack</option>
            <option value="email">이메일</option>
            <option value="both">Slack + 이메일</option>
          </select>
        </div>
        <div>
          <div className="hint" style={{ marginBottom: 4 }}>응답 제한(시간)</div>
          <input className="sel" style={{ width: 80 }} type="number" min={1} max={168}
                 value={sla} onChange={e => setSla(e.target.value)} />
        </div>
        <div className="spacer" style={{ display: 'flex', gap: 6 }}>
          <button className="btn quiet" onClick={onClose}>취소</button>
          <button className="btn solid" disabled={busy}
                  onClick={() => onSave({ ea, eaNm, ch, sla: Number(sla) || u.sla }, roles)}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {u.src === 'core'
          ? '이름 · 직함 · 부서 · 메일 · 재직여부는 TalentCore 에서 고칩니다. 여기서 바꿔도 다음 동기화에 되돌아갑니다.'
          : 'Hire 에서 직접 등록한 사람입니다. TalentCore 동기화가 이 사람을 건드리지 않습니다.'}
      </p>
    </div>
  )
}
