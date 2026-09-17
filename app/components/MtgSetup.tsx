'use client'

/* =========================================================
   공고 설정 — 내부 미팅 (킥오프 · 디브리프)
   ---------------------------------------------------------
   사용자 규칙: "참석자는 공고설정에서 변경."

   보드의 미팅 칩에서도 참석자를 고칠 수 있지만, 거기는 <그 미팅이 막혀
   있을 때> 지나가는 길이다. 막히지 않은 미팅의 참석자를 미리 손보려면
   들어갈 문이 없었다. 그래서 '이 공고를 어떻게 굴릴지'를 정하는 이 화면에 둔다.

   시간은 사람이 고르지 않는다 — 트리거가 켜지면 시스템이 전원 비는 첫 30분에
   밀어 넣는다(자동). 참석자를 바꾸면 전에 잡은 자리가 그 사람들에게는 맞지
   않으므로 [시간 다시 잡기]를 같이 둔다.

   색은 상태에만. 버튼은 무채색이고, 고른 사람만 인디고(= 내가 고른 것).
   ========================================================= */
import { useState } from 'react'
import { Icon } from './IconSprite'
import { assignMeeting, reautoMeeting } from '../lib/actions'
import type { MtgView, PoolRow } from '../lib/meetings'

/* 지금 무엇이 막혀 있는지 — 미팅 바와 같은 말을 쓴다(두 화면이 다르게 말하면 안 된다). */
const PHASE: Record<string, string> = {
  pending: '아직 열리지 않음',
  attendees: '참석자 미지정',
  time: '시간 미확정',
  manual: 'EA 조율 대상',
  set: '시간 확정',
  done: '지난 미팅',
}

function MtgCard({ pid, v0, pool }: { pid: string; v0: MtgView; pool: PoolRow[] }) {
  const [v, setV] = useState(v0)
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<string[]>(v0.uids)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const rows = q.trim()
    ? pool.filter(p => p.nm.indexOf(q.trim()) >= 0 || p.tt.indexOf(q.trim()) >= 0)
    : pool
  const toggle = (uid: string) =>
    setPick(s => (s.indexOf(uid) >= 0 ? s.filter(x => x !== uid) : [...s, uid]))

  async function save() {
    if (busy || !pick.length) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await assignMeeting(pid, v.id, pick)
      if (!r.view) { setErr('참석자를 저장하지 못했습니다.'); return }
      setV(r.view); setOpen(false)
      setMsg(`참석자 ${r.view.who.length}명을 저장했습니다.`)
    } catch { setErr('참석자를 저장하지 못했습니다.') } finally { setBusy(false) }
  }

  async function reauto() {
    if (busy) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await reautoMeeting(pid, v.id)
      if (r.view) setV(r.view)
      if (r.ok) setMsg('시간을 다시 잡았습니다.')
      else setErr(r.reason === 'done' ? '이미 지난 미팅입니다.' : `시간을 잡지 못했습니다 — ${r.reason ?? '알 수 없는 이유'}`)
    } catch { setErr('시간을 잡지 못했습니다.') } finally { setBusy(false) }
  }

  return (
    <div className="sheet" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13.5 }}>{v.nm}</b>
        <span style={{ fontSize: 11.5, color: 'var(--t4)' }}>{v.dur}분 · {PHASE[v.phase] ?? v.phase}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t2)', marginTop: 4, lineHeight: 1.6 }}>{v.v}</div>
      {v.note ? <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>{v.note}</div> : null}

      <div style={{ fontSize: 11.5, color: 'var(--t4)', marginTop: 12 }}>참석자</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
        {v.who.length
          ? v.who.map(n => <span className="chip" key={n}>{n}</span>)
          : (
            <span style={{ fontSize: 12, color: 'var(--t4)' }}>
              아직 정해지지 않았습니다 — {v.kind === 'kickoff' ? '1차 면접 합격자' : '최종 면접 완료자'}가
              나오면 기본값으로 채워집니다. 지금 직접 고를 수도 있습니다.
            </span>
          )}
      </div>
      {v.unknown.length ? (
        <div style={{ fontSize: 11.5, color: 'var(--late)', marginTop: 6 }}>
          명부에 없는 이름 {v.unknown.join(', ')} — 일정 탐색에서 빠집니다.
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn" disabled={busy}
          onClick={() => { setPick(v.uids.length ? v.uids : v.suggest); setQ(''); setOpen(!open) }}>
          <Icon id="i-users" className="ic-sm" />{open ? '고르기 닫기' : '참석자 바꾸기'}
        </button>
        <button className="btn" disabled={busy || v.phase === 'done' || !v.who.length} onClick={reauto}>
          시간 다시 잡기
        </button>
      </div>

      {open ? (
        <div style={{ marginTop: 12 }}>
          <input className="mt-find" placeholder="이름·직책으로 찾기" value={q}
            onChange={e => setQ(e.target.value)} disabled={busy} />
          <div className="mt-pool">
            {rows.map(p => (
              <button type="button" key={p.uid} disabled={busy}
                className={'mt-p' + (pick.indexOf(p.uid) >= 0 ? ' on' : '')}
                onClick={() => toggle(p.uid)}>
                <Icon id={pick.indexOf(p.uid) >= 0 ? 'i-check-sq' : 'i-columns'} className="ic-sm" />
                <span className="mt-p-n">{p.nm}</span>
                <span className="mt-p-t">{p.tt}{p.rel ? ' · 관련' : ''}</span>
              </button>
            ))}
            {rows.length ? null : (
              <div style={{ fontSize: 12, color: 'var(--t4)', padding: '8px 9px' }}>찾는 이름이 없습니다.</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
            <button className="btn solid" disabled={busy || !pick.length} onClick={save}>
              {pick.length}명으로 저장
            </button>
            <button className="btn quiet" disabled={busy} onClick={() => setOpen(false)}>취소</button>
            <span style={{ fontSize: 11, color: 'var(--t4)' }}>저장하면 시간은 다시 잡아야 합니다.</span>
          </div>
        </div>
      ) : null}

      {err ? <div style={{ fontSize: 11.5, color: 'var(--esc)', marginTop: 10 }}>{err}</div>
        : msg ? <div style={{ fontSize: 11.5, color: 'var(--done)', marginTop: 10 }}>{msg}</div>
          : null}
    </div>
  )
}

export default function MtgSetup({ pid, mtgs, pool }: { pid: string; mtgs: MtgView[]; pool: PoolRow[] }) {
  const list = mtgs.filter(m => m.kind !== 'other')
  return (
    <div id="mtg">
      <div className="sec-h" style={{ marginTop: 34 }}>
        <h3>내부 미팅</h3><span className="n">{list.length}건</span>
        <span className="hint">참석자는 여기서 정합니다. 시간은 전원이 비는 첫 30분으로 자동으로 잡힙니다</span>
      </div>
      {list.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 640 }}>
          {list.map(m => <MtgCard key={m.id} pid={pid} v0={m} pool={pool} />)}
        </div>
      ) : (
        <div className="sheet" style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--t3)', maxWidth: 640 }}>
          이 공고에는 킥오프·디브리프 미팅이 없습니다.
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--t4)', marginTop: 10, lineHeight: 1.7, maxWidth: 640 }}>
        킥오프는 1차 면접 합격자가 처음 나왔을 때, 디브리프는 최종 면접을 끝낸 사람이
        처음 생겼을 때 열립니다. 최종 합격·불합격은 디브리프 미팅 뒤에 채용 담당자가 기록합니다.
      </div>
    </div>
  )
}
