'use client'
/* =========================================================
   Cadence — 함께 보내기(선착순 벌크)
   ---------------------------------------------------------
   보드에서 후보자 카드 여러 장을 고르고 [일정 조율]을 누르면 여기가 열린다.
   예전에는 조율 화면 왼쪽 목록에서 체크했지만, 고르는 일은 원래 보드에서 일어난다.

   확정된 규칙 셋을 화면이 그대로 지킨다.
     ① 한 무리에게 **같은 자리**를 낸다 — 먼저 고른 사람이 가져간다(선착순).
     ② 후보자에게는 다른 지원자의 존재를 절대 드러내지 않는다.
     ③ 자리 수 < 후보자 수 면 **아예 못 보낸다**(하드 블록). 1.5배 미만이면 넛지만.
   그래서 누르기 전에 무리마다 "몇 명 · 자리 몇 개"가 먼저 뜬다.
   ========================================================= */
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ivIdsOfCands, ivBulkView, ivSendBulk } from '../lib/iv-actions'
import type { BulkGroup } from '../lib/iv-actions'

const FAIL: Record<string, string> = {
  'no-interview': '면접 기록을 찾지 못했습니다.',
  'no-interviewer': '면접관이 지정되지 않았습니다 — 공고 단계 설정에서 먼저 지정하세요.',
  'coordinator': '비서를 통해 잡는 분이 포함돼 있어 자동 발송을 막았습니다.',
  'empty': '가능한 자리를 찾지 못했습니다.',
  'week-cap': '주간 상한을 넘어 막혔습니다.',
  'senior-ack': '고위 면접관 확인이 먼저 필요합니다.',
}

export default function BulkSend({
  cids, onClose, onSent,
}: {
  /** 보드에서 고른 후보자들. 비면 아무것도 그리지 않는다. */
  cids: string[]
  onClose: () => void
  onSent: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [groups, setGroups] = useState<BulkGroup[] | null>(null)
  const [skip, setSkip] = useState<{ nm: string; why: string }[]>([])
  const [ack, setAck] = useState(false)
  const [msg, setMsg] = useState('')
  const [ids, setIds] = useState<string[]>([])

  /* 열리자마자 한 번 훑는다 — 사람이 [보내기]를 누르기 전에 막힐 이유가 먼저 떠야 한다. */
  useEffect(() => {
    let alive = true
    start(async () => {
      const r = await ivIdsOfCands(cids)
      if (!alive) return
      setIds(r.ids); setSkip(r.skip)
      setGroups(r.ids.length ? await ivBulkView(r.ids) : [])
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cids.join(',')])

  const blocked = !groups || !groups.length || groups.some(g => !g.gate.ok)

  const send = () => start(async () => {
    const r = await ivSendBulk(ids, ack)
    if (!r.ok && r.reason === 'senior-ack') {
      setGroups(await ivBulkView(ids)); setAck(true); return
    }
    if (r.ok) {
      router.refresh()
      onSent()
      return
    }
    setMsg(FAIL[r.reason ?? ''] ?? `보내지 못했습니다 (${r.reason ?? '알 수 없음'})`)
  })

  const seniors = [...new Set((groups ?? []).flatMap(g => g.ack))]

  return (
    <div className="bs-modal" onClick={onClose}>
      <div className="bs-dlg" onClick={e => e.stopPropagation()}>
        <b>{ack ? '고위 면접관이 포함돼 있습니다' : `후보자 ${cids.length}명에게 함께 보내기`}</b>
        <p>
          {ack
            ? `${seniors.join(' · ')} 님이 포함돼 있습니다. 이대로 보낼까요?`
            : '한 무리에게 같은 자리를 함께 냅니다 — 먼저 고른 분이 가져갑니다. 후보자 화면에는 다른 지원자가 드러나지 않고, 나간 자리는 그냥 목록에서 사라집니다.'}
        </p>

        {groups === null ? (
          <div className="bs-wait">자리를 훑는 중입니다…</div>
        ) : (
          <div className="bs-list">
            {groups.map(g => (
              <div className={'bs-g' + (g.gate.ok ? '' : ' bad')} key={g.key}>
                <div className="bs-g-h">
                  <b>{g.posTitle} · {g.stageNm}</b>
                  <span className="bs-g-n">{g.cands.length}명 · 자리 {g.gate.seats}개</span>
                </div>
                <div className="bs-g-c">{g.cands.join(' · ')}</div>
                <div className={'bs-g-m' + (g.gate.ok ? '' : ' bad')}>{g.gate.msg}</div>
                {g.gate.warn.map((w, i) => <div className="bs-g-w" key={i}>{w}</div>)}
                {g.labels.length ? <div className="bs-g-s">{g.labels.join(' / ')}</div> : null}
              </div>
            ))}
            {groups.length === 0 ? <div className="bs-g-m bad">보낼 수 있는 건이 없습니다.</div> : null}
            {skip.length ? (
              <div className="bs-skip">
                제외됨 — {skip.map(s => `${s.nm}(${s.why})`).join(' · ')}
              </div>
            ) : null}
          </div>
        )}

        {msg ? <div className="bs-msg">{msg}</div> : null}

        <div className="bs-f">
          <button className="btn quiet" onClick={onClose}>닫기</button>
          <button className="btn solid" disabled={pending || blocked} onClick={send}>
            {ack ? '확인했습니다 · 보내기' : '보내기'}
          </button>
        </div>
      </div>
      <style>{CSS}</style>
    </div>
  )
}

const CSS = `
.bs-modal { position: fixed; inset: 0; background: rgba(23,23,28,.34); display: grid;
  place-items: center; z-index: 70; padding: 20px; }
.bs-dlg { background: var(--canvas); border-radius: var(--r-lg); padding: 18px 20px;
  width: min(620px, 100%); box-shadow: var(--sh-4); }
.bs-dlg > b { font-size: 14px; }
.bs-dlg > p { font-size: 12.5px; color: var(--t3); margin: 6px 0 14px; line-height: 1.6; }
.bs-wait { font-size: 12.5px; color: var(--t3); padding: 18px 0 22px; text-align: center; }
.bs-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px;
  max-height: 46vh; overflow-y: auto; }
.bs-g { padding: 10px 12px; border-radius: var(--r-md); background: var(--sunken); }
.bs-g.bad { box-shadow: inset 0 0 0 1px var(--esc); }
.bs-g-h { display: flex; align-items: baseline; gap: 8px; }
.bs-g-h b { font-size: 12.5px; }
.bs-g-n { margin-left: auto; font-size: 11px; color: var(--t3); font-variant-numeric: tabular-nums; }
.bs-g-c { font-size: 12px; color: var(--t2); margin-top: 3px; }
.bs-g-m { font-size: 12px; color: var(--t2); margin-top: 6px; line-height: 1.55; }
.bs-g-m.bad { color: var(--esc); font-weight: 600; }
.bs-g-w { font-size: 11.5px; color: var(--late); margin-top: 4px; line-height: 1.5; }
.bs-g-s { font-size: 11px; color: var(--t3); margin-top: 6px; font-variant-numeric: tabular-nums; }
.bs-skip { font-size: 11.5px; color: var(--t3); padding: 2px 2px 0; line-height: 1.55; }
.bs-msg { font-size: 12.5px; color: var(--esc); margin-bottom: 12px; }
.bs-f { display: flex; justify-content: flex-end; gap: 8px; }
`
