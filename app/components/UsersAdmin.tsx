'use client'

/* =========================================================
   사용자 · 권한 (H2)
   ---------------------------------------------------------
   TalentCore 계정으로 처음 들어온 사람은 '승인 대기'로 여기 쌓인다.
   HR Admin 이 역할을 골라 승인해야 Hire 에 들어온다.
   · 승인 대기를 맨 위에 — 이 화면에 오는 이유의 대부분이다.
   · 면접관 명부 연결: 평가를 '본인 이름으로만' 쓰게 하는 열쇠. 메일이 같으면 자동으로 이어진다.
   · 마지막 HR Admin 은 내리거나 막을 수 없다.
   ========================================================= */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import { approveUser, setUserRole, setUserSt, linkUserPerson } from '../lib/user-actions'
import { APP_ROLES, ROLE_LABEL, type AppRole } from '../lib/gate'
import type { AppUser } from '../lib/users'

const ROLE_DESC: Record<AppRole, string> = {
  admin: '전체 · 사용자 승인',
  recruiter: '공고·후보자 전체 운영',
  hm: '담당 공고 검토·판정',
  interviewer: '배정된 면접 평가',
}

const REASON: Record<string, string> = {
  'no-permission': 'HR Admin 만 바꿀 수 있습니다.',
  'last-admin': '마지막 HR Admin 입니다. 다른 사람을 먼저 HR Admin 으로 승인해 주세요.',
  'need-role': '역할을 골라야 승인됩니다.',
  'no-table': '사용자 명단 표가 없습니다(마이그레이션 015).',
  'not-configured': 'DB 가 설정돼 있지 않습니다.',
}

const CSS = `
.ua-row { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto; gap: 10px 14px;
          align-items: center; padding: 12px 16px; border-top: 1px solid var(--line); }
.ua-row:first-child { border-top: 0; }
.ua-nm { font-size: 13px; font-weight: 600; color: var(--t1); }
.ua-sub { font-size: 11.5px; color: var(--t3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ua-ctl { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.ua-sel { padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--canvas);
          color: var(--t1); font: inherit; font-size: 12.5px; max-width: 100%; }
.ua-acts { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.ua-empty { padding: 16px; font-size: 12.5px; color: var(--t3); }
.ua-roles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; }
.ua-roles div { padding: 10px 14px; border-left: 1px solid var(--line); font-size: 12px; color: var(--t3); }
.ua-roles div:first-child { border-left: 0; }
.ua-roles b { display: block; font-size: 12.5px; color: var(--t1); margin-bottom: 2px; }
@media (max-width: 760px) {
  .ua-row { grid-template-columns: minmax(0, 1fr); }
  .ua-acts { justify-content: flex-start; }
  .ua-roles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ua-roles div:nth-child(3) { border-left: 0; }
  .ua-roles div:nth-child(n+3) { border-top: 1px solid var(--line); }
}
`

type P = { id: string; nm: string; dept: string }

export default function UsersAdmin(
  { allowed, readOnly, state, users, people, selfId }:
  { allowed: boolean; readOnly: boolean; state: string; users: AppUser[]; people: P[]; selfId: string | null },
) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<Record<string, AppRole | ''>>({})

  const pending = users.filter(u => u.st === 'pending')
  const active = users.filter(u => u.st === 'active')
  const blocked = users.filter(u => u.st === 'blocked')
  const pnm = (id: string | null) => people.find(p => p.id === id)?.nm

  async function run(id: string, fn: () => Promise<{ ok: boolean; reason?: string; detail?: string }>) {
    if (busy || readOnly) return
    setBusy(id); setErr('')
    try {
      const r = await fn()
      if (!r.ok) { setErr(REASON[r.reason ?? ''] ?? '저장하지 못했습니다 (' + (r.detail || r.reason || '오류') + ')'); return }
      router.refresh()
    } catch {
      setErr(readOnly ? '데모에서는 바꿀 수 없습니다.' : '저장하지 못했습니다. 잠시 뒤 다시 눌러주세요.')
    } finally {
      setBusy('')
    }
  }

  const when = (s: string | null) => {
    if (!s) return '-'
    const d = new Date(s)
    const pad = (n: number) => String(n).padStart(2, '0')
    return (d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }

  const roleSel = (u: AppUser, value: AppRole | '', on: (v: AppRole) => void) => (
    <select className="ua-sel" value={value} disabled={!!busy || readOnly}
      onChange={e => on(e.target.value as AppRole)} aria-label={u.nm + ' 역할'}>
      {value === '' ? <option value="">역할 선택</option> : null}
      {APP_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  )

  const personSel = (u: AppUser) => (
    <select className="ua-sel" value={u.person_id ?? ''} disabled={!!busy || readOnly}
      onChange={e => run(u.id, () => linkUserPerson(u.id, e.target.value))} aria-label={u.nm + ' 면접관 명부 연결'}>
      <option value="">명부 연결 없음</option>
      {people.map(p => <option key={p.id} value={p.id}>{p.nm}{p.dept ? ' · ' + p.dept : ''}</option>)}
    </select>
  )

  const who = (u: AppUser, extra: string) => (
    <div style={{ minWidth: 0 }}>
      <div className="ua-nm">{u.nm}{u.id === selfId ? <span className="pill" style={{ marginLeft: 6 }}>나</span> : null}</div>
      <div className="ua-sub">{[u.dept, u.email].filter(Boolean).join(' · ') || '-'}</div>
      <div className="ua-sub">{extra}</div>
    </div>
  )

  const head = (
    <header className="top">
      <div className="crumb"><Icon id="i-sliders" /><Link href="/settings">설정</Link><span className="sep">/</span>사용자</div>
      <div className="h-row"><h1>사용자 · 권한</h1></div>
      <div className="meta"><i>TalentCore 계정으로 들어온 사람 · 승인 대기 <b>{pending.length}</b> · 사용 중 <b>{active.length}</b></i></div>
    </header>
  )

  if (!allowed) {
    return (
      <>
        {head}
        <div className="stage"><div className="sheet ua-empty">HR Admin 만 볼 수 있는 화면입니다.</div></div>
      </>
    )
  }

  return (
    <>
      <style>{CSS}</style>
      {head}
      <div className="stage"><div style={{ maxWidth: 900 }}>
        {state !== 'ok' ? (
          <div className="sheet ua-empty" style={{ marginBottom: 14, color: 'var(--esc)' }}>
            {REASON[state] ?? '사용자 명단을 읽지 못했습니다.'}
          </div>
        ) : null}
        {readOnly ? <div className="sheet ua-empty" style={{ marginBottom: 14 }}>데모에서는 보기만 됩니다.</div> : null}
        {err ? <div className="sc-err" style={{ marginBottom: 12 }}>{err}</div> : null}

        <div className="grp">
          <div className="sec-h"><h3>승인 대기</h3><small style={{ color: 'var(--t4)' }}>{pending.length}명</small></div>
          <div className="sheet">
            {!pending.length ? <div className="ua-empty">승인을 기다리는 사람이 없습니다.</div> : pending.map(u => (
              <div className="ua-row" key={u.id}>
                {who(u, '요청 ' + when(u.created_at))}
                <div className="ua-ctl">
                  {roleSel(u, pick[u.id] ?? '', v => setPick(s => ({ ...s, [u.id]: v })))}
                  {personSel(u)}
                </div>
                <div className="ua-acts">
                  <button className="btn solid sm" disabled={!!busy || readOnly || !pick[u.id]}
                    onClick={() => run(u.id, () => approveUser(u.id, pick[u.id] as AppRole))}>
                    {busy === u.id ? '저장 중' : '승인'}
                  </button>
                  <button className="btn quiet sm" disabled={!!busy || readOnly}
                    onClick={() => run(u.id, () => setUserSt(u.id, 'blocked'))}>거절</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grp">
          <div className="sec-h"><h3>사용 중</h3><small style={{ color: 'var(--t4)' }}>{active.length}명</small></div>
          <div className="sheet">
            {!active.length ? <div className="ua-empty">아직 없습니다. TalentCore 관리자 계정으로 처음 들어온 사람이 첫 HR Admin 이 됩니다.</div> : active.map(u => (
              <div className="ua-row" key={u.id}>
                {who(u, '마지막 로그인 ' + when(u.last_login) + (u.approved_by ? ' · 승인 ' + u.approved_by : ''))}
                <div className="ua-ctl">
                  {roleSel(u, u.role ?? '', v => run(u.id, () => setUserRole(u.id, v)))}
                  {personSel(u)}
                </div>
                <div className="ua-acts">
                  {u.person_id ? null : <span className="pill warn">명부 미연결</span>}
                  <button className="btn quiet sm" disabled={!!busy || readOnly}
                    onClick={() => run(u.id, () => setUserSt(u.id, 'blocked'))}>막기</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {blocked.length ? (
          <div className="grp">
            <div className="sec-h"><h3>막힘</h3><small style={{ color: 'var(--t4)' }}>{blocked.length}명</small></div>
            <div className="sheet">
              {blocked.map(u => (
                <div className="ua-row" key={u.id}>
                  {who(u, '마지막 로그인 ' + when(u.last_login))}
                  <div className="ua-ctl"><span className="pill bad">막힘</span></div>
                  <div className="ua-acts">
                    <button className="btn quiet sm" disabled={!!busy || readOnly}
                      onClick={() => run(u.id, () => setUserSt(u.id, 'pending'))}>승인 대기로</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grp">
          <div className="sec-h"><h3>역할</h3></div>
          <div className="sheet ua-roles">
            {APP_ROLES.map(r => <div key={r}><b>{ROLE_LABEL[r]}</b>{ROLE_DESC[r]}</div>)}
          </div>
          <div className="ev-note">역할을 바꾸거나 막으면 그 사람은 다음 화면 이동 때 로그아웃됩니다. 비밀번호 로그인은 관리자 비상 출입용으로 남아 있습니다.</div>
        </div>
      </div></div>
    </>
  )
}
