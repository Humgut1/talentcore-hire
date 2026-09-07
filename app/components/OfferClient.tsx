'use client'

/* =========================================================
   오퍼 액션 패널 (실동작)
   ---------------------------------------------------------
   상세 화면 가운데에 들어가는 '지금 누를 수 있는 것'만 그린다.
   · 무엇을 누를 수 있는가는 lib/offer.ts 가 정한다 — 여기서 다시
     조건을 만들지 않는다(화면마다 규칙이 어긋나는 걸 막으려고).
   · 버튼은 무채색. 색은 상태(보류·밴드 초과·거절)에만 쓴다.
   · 서버 액션이 거부하면(차례 아님·사유 없음 등) 그 이유를 그대로 보여준다.
     화면에서만 막는 게 아니라 서버가 최종 판단이기 때문이다.
   ========================================================= */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import {
  DECLINE_REASONS, currentApprover, isHeld, isApproved, overBand, won,
  type DeclineCode, type Offer,
} from '../lib/offer'
import {
  saveOfferDraft, submitOfferForApproval, approveOffer, holdOffer,
  resumeOffer, sendOffer, respondOffer, type SeatView, type HandoffResult,
} from '../lib/actions'

/* 서버가 돌려준 거부 사유 → 사람 말. */
const REASON: Record<string, string> = {
  'no-offer': '오퍼를 찾지 못했습니다.',
  'not-draft': '초안일 때만 금액을 고칠 수 있습니다.',
  'not-your-turn': '지금 차례가 아닙니다. 화면을 새로고침해 주세요.',
  'need-memo': '보류 사유를 적어야 저장됩니다.',
  'not-approved': '승인이 끝나야 발송할 수 있습니다.',
  'not-sent': '아직 후보자에게 나가지 않은 오퍼입니다.',
  'need-reason': '거절 사유를 골라야 저장됩니다.',
}
/* DB 미설정·오퍼 표 없음은 '실패'가 아니다.
   화면(메모리)에는 반영되고 저장만 안 된 상태 — 데모에서는 이게 정상이다. */
const softFail = (r?: string) =>
  r === 'not-configured' ||
  !!(r && (r.indexOf('does not exist') >= 0 || r.indexOf('schema cache') >= 0))

const panelStyle: React.CSSProperties = { maxWidth: 900, marginTop: 12 }
const bodyStyle: React.CSSProperties = { padding: '14px 18px 18px' }

export default function OfferClient(
  { offer, candName, seats }: { offer: Offer; candName: string; seats?: SeatView | null },
) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  /* 한 번에 하나만 펼친다 — 보류 사유 / 거절 사유 입력. */
  const [open, setOpen] = useState<'' | 'hold' | 'decline'>('')

  // 초안 편집값
  const [level, setLevel] = useState(offer.level)
  const [base, setBase] = useState(String(offer.base))
  const [sign, setSign] = useState(String(offer.sign))
  const [start, setStart] = useState(offer.start ?? '')
  /* 어느 자리에 앉히는가 (T5). 이미 찬 카드는 고를 수 없다. */
  const [seat, setSeat] = useState(offer.openingCode ?? '')

  // 보류 · 거절 입력값
  const [memo, setMemo] = useState('')
  const [code, setCode] = useState<DeclineCode | ''>('')
  const [dMemo, setDMemo] = useState('')

  const cur = currentApprover(offer)
  const held = isHeld(offer)
  const approved = isApproved(offer)
  const draftBase = Number(base) || 0
  const draftOver = draftBase > offer.band[1]

  /* 액션 한 번 = 서버에 맡기고, 성공하면 서버 화면을 다시 그린다.
     낙관적 갱신을 하지 않는 이유: 승인 차례·상태 전이는 서버가 진짜 판단자다. */
  async function run(
    fn: () => Promise<{ ok: boolean; reason?: string; handoff?: HandoffResult }>,
    done: string,
  ) {
    if (busy) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await fn()
      if (!r.ok && !softFail(r.reason)) {
        setErr(REASON[r.reason ?? ''] ?? `저장하지 못했습니다 (${r.reason ?? '알 수 없는 오류'})`)
        return
      }
      setOpen(''); setMemo(''); setCode(''); setDMemo('')
      /* TalentCore 로 넘겼는지는 수락과 별개다 — 넘기지 못해도 수락은 남는다.
         무슨 일이 있었는지 한 줄로 말해 주지 않으면 아무도 모른다. */
      const h = r.handoff
      if (h?.sent) {
        setMsg(`${done} · TalentCore 입사 예정자로 넘겼습니다`
          + (h.seatCode ? ` (자리 ${h.seatCode})` : ' (정원 밖)')
          + (h.closedPosition ? ' · 마지막 자리가 차서 공고를 닫았습니다' : ''))
      } else if (h && h.reason !== 'not-configured') {
        setMsg(done)
        setErr(`수락은 기록했지만 TalentCore 로 넘기지 못했습니다 — ${h.detail ?? h.reason}. `
          + 'TalentCore /hires 에서 직접 등록해 주세요.')
      } else {
        setMsg(done)
      }
      router.refresh()
    } catch {
      setErr('저장하지 못했습니다. 잠시 뒤 다시 눌러주세요.')
    } finally {
      setBusy(false)
    }
  }

  /* ---------- 자리 선택 (T5) ----------
     한 요청서에서 레벨이 다른 카드가 나온다("L5 1명 · L3 2명").
     어느 카드에 앉히는지를 여기서 정해야 정원도 예산도 어긋나지 않는다.
     자리를 잡아 두는 시점은 '수락'이라, 여기서는 잡지 않고 남은 수만 알린다. */
  const seatOpts = (seats?.seats ?? []).filter(s => s.open || s.code === offer.openingCode)
  const chosen = seats?.seats.find(s => s.code === seat)
  const tight = !!seats && seats.state === 'ok' && seats.pending > seats.open

  const seatBlock = !seats || seats.state === 'not-configured' || seats.state === 'no-req' ? null : (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 6 }}>어느 자리에 앉히나</div>

      {seats.state === 'error' ? (
        <div style={{ fontSize: 11.5, color: 'var(--late)' }}>
          TalentCore 자리 대장을 읽지 못했습니다 ({seats.detail}). 자리 없이 진행하면
          합격자가 <b>정원 밖</b>으로 넘어갑니다.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="in sm" style={{ width: 320 }} value={seat} disabled={busy}
              onChange={e => setSeat(e.target.value)}>
              <option value="">— 자리 고르지 않음 (정원 밖) —</option>
              {seatOpts.map(s => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.level_label}
                  {s.band[1] ? ` · ${s.band[0].toLocaleString()}~${s.band[1].toLocaleString()}만원` : ''}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11.5, color: tight ? 'var(--late)' : 'var(--t3)' }}>
              남은 자리 <b>{seats.open}</b> · 진행 중 오퍼 <b>{seats.pending}</b>
            </span>
          </div>

          {seats.open === 0 && !seat ? (
            <div style={{ fontSize: 11.5, color: 'var(--esc)', marginTop: 6 }}>
              빈 자리가 없습니다. 이대로 수락되면 <b>정원 밖</b>으로 넘어갑니다 —
              TalentCore 에서 자리를 늘리는 결재를 먼저 올리세요.
            </div>
          ) : tight ? (
            <div style={{ fontSize: 11.5, color: 'var(--late)', marginTop: 6 }}>
              진행 중인 오퍼가 남은 자리보다 많습니다. 전원이 수락하면
              뒤에 수락한 사람은 <b>자리를 받지 못합니다</b>.
            </div>
          ) : chosen && draftBase && chosen.band[1] && draftBase > chosen.band[1] ? (
            <div style={{ fontSize: 11.5, color: 'var(--esc)', marginTop: 6 }}>
              이 자리의 밴드 상한 {chosen.band[1].toLocaleString()}만원을 넘습니다.
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 6 }}>
              자리는 <b>후보자가 수락할 때</b> 잡힙니다. 지금 골라 두면 수락 즉시
              그 카드로 TalentCore 에 넘어갑니다.
            </div>
          )}
        </>
      )}
    </div>
  )

  /* ---------- 상태별 본문 ---------- */
  let head = ''
  let body: React.ReactNode = null

  if (offer.st === 'draft') {
    head = '처우안 작성'
    body = (
      <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>직급</div>
            <input className="in sm" style={{ width: 150 }} value={level}
              onChange={e => setLevel(e.target.value)} disabled={busy} />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>기본 연봉 (만원)</div>
            <input className="in sm w-sm mono" inputMode="numeric" value={base}
              onChange={e => setBase(e.target.value.replace(/[^0-9]/g, ''))} disabled={busy} />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>사이닝 (만원)</div>
            <input className="in sm w-sm mono" inputMode="numeric" value={sign}
              onChange={e => setSign(e.target.value.replace(/[^0-9]/g, ''))} disabled={busy} />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>입사 예정일</div>
            <input className="in sm mono" type="date" style={{ width: 150 }} value={start}
              onChange={e => setStart(e.target.value)} disabled={busy} />
          </label>
        </div>

        {seatBlock}

        <div style={{ fontSize: 11.5, color: draftOver ? 'var(--esc)' : 'var(--t3)', marginTop: 10 }}>
          {draftOver
            ? <>밴드 상한 {won(offer.band[1])}을 <b>{won(draftBase - offer.band[1])}</b> 넘습니다 — 승인 요청 시 <b>본부 승인 단계가 자동으로 하나 추가</b>됩니다.</>
            : <>밴드 {won(offer.band[0])} ~ {won(offer.band[1])} 안입니다. 승인 단계는 {offer.chain.length}명입니다.</>}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          <button className="btn" disabled={busy}
            onClick={() => run(
              () => saveOfferDraft(offer.cid, {
                level: level.trim(), base: draftBase, sign: Number(sign) || 0, start,
                openingCode: seat,
              }),
              '처우안을 저장했습니다')}>
            <Icon id="i-check-sq" className="ic-sm" />저장
          </button>
          <button className="btn solid" disabled={busy || !level.trim() || !draftBase}
            onClick={() => run(async () => {
              const r = await saveOfferDraft(offer.cid, {
                level: level.trim(), base: draftBase, sign: Number(sign) || 0, start,
                openingCode: seat,
              })
              if (!r.ok && !softFail(r.reason)) return r
              return submitOfferForApproval(offer.cid)
            }, '승인 요청을 올렸습니다')}>
            승인 요청
          </button>
        </div>
      </>
    )
  } else if (offer.st === 'approval' && held) {
    const h = offer.chain.find(a => a.s === 'hold')!
    head = '보류 중'
    body = (
      <>
        <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.6 }}>
          <b style={{ color: 'var(--esc)' }}>{h.nm}</b> 님이 보류했습니다 — {h.memo}
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>
            보류가 풀릴 때까지 뒤 순서는 열리지 않습니다. 조건을 조정했다면 해제하고 다시 진행하세요.
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy}
            onClick={() => run(() => resumeOffer(offer.cid), '보류를 해제했습니다')}>
            보류 해제
          </button>
        </div>
      </>
    )
  } else if (offer.st === 'approval' && cur) {
    head = '승인'
    body = (
      <>
        <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
          지금 차례는 <b>{cur.nm}</b> ({cur.role}) 입니다.
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>
            아래 버튼은 <b>{cur.nm}</b> 님 이름으로 기록됩니다.
            {offer.chain.length > 1 && ' 앞사람이 처리해야 다음 순서가 열립니다.'}
          </div>
        </div>

        {open === 'hold' ? (
          <div style={{ marginTop: 12 }}>
            <textarea className="ta" placeholder="보류 사유 — 무엇이 해결되면 진행할 수 있는지 적어주세요"
              value={memo} onChange={e => setMemo(e.target.value)} disabled={busy} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn" disabled={busy || !memo.trim()}
                onClick={() => run(() => holdOffer(offer.cid, cur.uid, memo), '보류로 기록했습니다')}>
                보류 저장
              </button>
              <button className="btn quiet" disabled={busy} onClick={() => setOpen('')}>취소</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <button className="btn solid" disabled={busy}
              onClick={() => run(() => approveOffer(offer.cid, cur.uid), `${cur.nm} 승인으로 기록했습니다`)}>
              <Icon id="i-check-sq" className="ic-sm" />승인
            </button>
            <button className="btn" disabled={busy} onClick={() => setOpen('hold')}>보류</button>
          </div>
        )}
      </>
    )
  } else if (offer.st === 'approval' && approved) {
    head = '발송'
    body = (
      <>
        <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
          승인이 모두 끝났습니다. 지금 보내면 <b>{candName}</b> 님에게 오퍼가 전달된 것으로 기록됩니다.
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>
            발송된 시점부터 이 오퍼가 수락률 계산에 들어갑니다.
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn solid" disabled={busy}
            onClick={() => run(() => sendOffer(offer.cid), '오퍼를 발송한 것으로 기록했습니다')}>
            <Icon id="i-mail" className="ic-sm" />오퍼 발송
          </button>
        </div>
      </>
    )
  } else if (offer.st === 'sent') {
    head = '후보자 응답 기록'
    body = (
      <>
        <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
          {candName} 님의 답을 받으면 여기에 기록합니다. 기록하면 보드의 카드도 같이 이동합니다.
        </div>

        {open === 'decline' ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 6 }}>
              거절 사유 — 고르지 않으면 저장되지 않습니다
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DECLINE_REASONS.map(r => (
                <button key={r.v} type="button" title={r.d} disabled={busy}
                  className={`chip${code === r.v ? ' on' : ''}`}
                  onClick={() => setCode(r.v)}>
                  {r.l}
                </button>
              ))}
            </div>
            <textarea className="ta" style={{ marginTop: 10 }}
              placeholder="덧붙일 내용 (선택) — 나중에 같은 이유로 지지 않으려면 구체적일수록 좋습니다"
              value={dMemo} onChange={e => setDMemo(e.target.value)} disabled={busy} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn" disabled={busy || !code}
                onClick={() => run(
                  () => respondOffer(offer.cid, false, code || undefined, dMemo),
                  '거절로 기록했습니다')}>
                거절 기록
              </button>
              <button className="btn quiet" disabled={busy} onClick={() => setOpen('')}>취소</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <button className="btn solid" disabled={busy}
              onClick={() => run(() => respondOffer(offer.cid, true), '수락으로 기록했습니다')}>
              수락
            </button>
            <button className="btn" disabled={busy} onClick={() => setOpen('decline')}>거절</button>
          </div>
        )}
      </>
    )
  } else {
    /* 수락·거절이 끝난 오퍼 — 되돌리는 버튼은 두지 않는다.
       잘못 기록했으면 사람이 확인하고 고치는 게 맞다. */
    head = '종료된 오퍼'
    body = (
      <div style={{ fontSize: 12.5, color: 'var(--t3)' }}>
        {offer.st === 'accepted'
          ? `${candName} 님이 수락했습니다. 더 누를 것은 없습니다.`
          : `${candName} 님이 거절했습니다. 사유는 왼쪽에 남아 있습니다.`}
      </div>
    )
  }

  return (
    <div className="stage" style={{ padding: '12px 26px 0' }}>
      <div className="sheet" style={panelStyle}>
        <div className="sec-h" style={{ padding: '16px 18px 0' }}>
          <h3>{head}</h3>
          {overBand(offer) && offer.st !== 'draft'
            ? <span className="pill bad">밴드 초과</span> : null}
        </div>
        <div style={bodyStyle}>
          {body}
          {err ? (
            <div style={{ fontSize: 11.5, color: 'var(--esc)', marginTop: 10 }}>{err}</div>
          ) : msg ? (
            <div style={{ fontSize: 11.5, color: 'var(--done)', marginTop: 10 }}>{msg}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
