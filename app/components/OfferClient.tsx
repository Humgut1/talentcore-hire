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
  isCoreStep, coreStepOf,
  type DeclineCode, type Offer,
} from '../lib/offer'
import {
  saveOfferDraft, submitOfferForApproval, approveOffer, holdOffer,
  resumeOffer, sendOffer, respondOffer, withdrawOfferApproval, offerLetterLink,
  type SeatView, type HandoffResult,
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
  'bad-start': '입사일은 TalentCore 입사 가능일(월·수, 공휴일 제외) 중에서 골라야 합니다.',
  'not-approval': '승인 대기 중일 때만 결재를 내릴 수 있습니다.',
  /* 밴드 초과 오퍼는 TalentCore 결재를 받아야 한다 — 연결이 없으면 진행을 막는다.
     여기서 Hire 가 임의로 승인자를 만들어 붙이면 결재가 아니라 형식이 된다. */
  'core-off': 'TalentCore 가 연결돼 있지 않아 밴드 초과 결재를 올릴 수 없습니다. '
    + '밴드 안으로 금액을 낮추거나, 설정에서 TalentCore 연결을 먼저 맞춰주세요.',
  'core-fail': 'TalentCore 에 결재를 올리지 못했습니다. 잠시 뒤 다시 눌러주세요.',
}

const WD = ['일', '월', '화', '수', '목', '금', '토']
/* 2026-09-21 → 2026.09.21 (월) */
const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return isNaN(d.getTime()) ? iso : `${iso.replace(/-/g, '.')} (${WD[d.getDay()]})`
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
  /* 스톡옵션은 조건만 적는다 — 수량과 행사가. 현재가치는 계산하지 않는다.
     베스팅·클리프·안내 문구는 회사 공통이라 TalentCore 설정에 있다. */
  const [eqUnits, setEqUnits] = useState(offer.equityUnits ? String(offer.equityUnits) : '')
  const [eqStrike, setEqStrike] = useState(offer.equityStrike ? String(offer.equityStrike) : '')
  /* 어느 자리에 앉히는가 (T5). 이미 찬 카드는 고를 수 없다. */
  const [seat, setSeat] = useState(offer.openingCode ?? '')
  /* 후보자에게 보낸 오퍼레터 주소 — 메일이 못 나갔을 때 직접 보내라고 꺼내준다. */
  const [link, setLink] = useState('')

  // 보류 · 거절 입력값
  const [memo, setMemo] = useState('')
  const [code, setCode] = useState<DeclineCode | ''>('')
  const [dMemo, setDMemo] = useState('')

  /* 입사 가능일은 TalentCore 가 정한다. 연결이 없으면 예전처럼 날짜를 직접 고른다. */
  const rule = seats?.startRule ?? null

  const cur = currentApprover(offer)
  /* 밴드 초과 결재는 TalentCore 결재함에서 눌린다. 여기서는 어디까지 왔는지만 보여준다. */
  const core = coreStepOf(offer)
  const coreWaiting = offer.st === 'approval' && !!cur && isCoreStep(cur)
  const coreRejected = !!core && core.s === 'hold'
  const held = isHeld(offer)
  const approved = isApproved(offer)
  const draftBase = Number(base) || 0
  const draftOver = draftBase > offer.band[1]

  /* 액션 한 번 = 서버에 맡기고, 성공하면 서버 화면을 다시 그린다.
     낙관적 갱신을 하지 않는 이유: 승인 차례·상태 전이는 서버가 진짜 판단자다. */
  async function run(
    fn: () => Promise<{ ok: boolean; reason?: string; detail?: string; handoff?: HandoffResult }>,
    done: string,
  ) {
    if (busy) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await fn()
      if (!r.ok && !softFail(r.reason)) {
        setErr((REASON[r.reason ?? ''] ?? `저장하지 못했습니다 (${r.reason ?? '알 수 없는 오류'})`)
          + (r.detail ? ` (${r.detail})` : ''))
        return
      }
      setOpen(''); setMemo(''); setCode(''); setDMemo('')
      /* TalentCore 로 넘겼는지는 수락과 별개다 — 넘기지 못해도 수락은 남는다.
         무슨 일이 있었는지 한 줄로 말해 주지 않으면 아무도 모른다. */
      const h = r.handoff
      if (h?.sent) {
        setMsg(`${done} · TalentCore 입사 예정자로 넘겼습니다`
          + (h.seatCode ? ` (포지션 ${h.seatCode})` : ' (정원 밖)')
          + (h.closedPosition ? ' · 마지막 포지션이 차서 공고를 닫았습니다' : ''))
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

  /* 초안 화면의 입력값 한 벌 — [저장]과 [승인 요청]이 같은 값을 보낸다. */
  const draftPatch = () => ({
    level: level.trim(), base: draftBase, sign: Number(sign) || 0, start,
    openingCode: seat,
    equityUnits: Number(eqUnits) || 0,
    equityStrike: Number(eqStrike) || 0,
  })

  /* 발송은 '상태 바꾸기'가 아니라 '메일 보내기'다 — 나갔는지 못 나갔는지를
     반드시 말해 준다. 못 나갔어도 오퍼는 되돌리지 않고(후보자에게 두 번
     보내는 사고를 막는다) 담당자가 링크를 복사해 직접 보낼 수 있게 한다. */
  async function doSend() {
    if (busy) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await sendOffer(offer.cid)
      if (!r.ok && !softFail(r.reason)) {
        setErr(REASON[r.reason ?? ''] ?? `발송하지 못했습니다 (${r.reason ?? '알 수 없는 오류'})`)
        return
      }
      if (r.url) setLink(r.url)
      if (r.mailed) {
        setMsg('오퍼레터를 보냈습니다 — 후보자가 링크에서 바로 수락·거절할 수 있습니다')
      } else {
        setMsg('오퍼를 발송으로 기록했습니다')
        setErr(r.mailReason === 'not-configured'
          ? '메일 키가 없어 메일은 나가지 않았습니다 — 아래 오퍼레터 주소를 복사해 직접 보내주세요.'
          : r.mailReason === 'no-address'
            ? '후보자 메일 주소가 없어 메일은 나가지 않았습니다 — 아래 주소를 복사해 직접 보내주세요.'
            : `메일을 보내지 못했습니다 (${r.mailReason ?? '원인 미상'}) — 아래 주소를 복사해 직접 보내주세요.`)
      }
      router.refresh()
    } catch {
      setErr('발송하지 못했습니다. 잠시 뒤 다시 눌러주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function showLink() {
    if (busy) return
    setBusy(true)
    try {
      const r = await offerLetterLink(offer.cid)
      setLink(r.url)
      if (!r.url) setErr('오퍼레터 주소를 만들지 못했습니다 — 서버 설정(세션 비밀값)을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  const linkBox = link ? (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>
        후보자에게 보낼 오퍼레터 주소 (60일)
      </div>
      <input className="in sm" readOnly value={link} style={{ width: '100%', maxWidth: 520 }}
        onFocus={e => e.currentTarget.select()} />
    </div>
  ) : null

  /* ---------- 자리 선택 (T5) ----------
     한 요청서에서 레벨이 다른 카드가 나온다("L5 1명 · L3 2명").
     어느 카드에 앉히는지를 여기서 정해야 정원도 예산도 어긋나지 않는다.
     자리를 잡아 두는 시점은 '수락'이라, 여기서는 잡지 않고 남은 수만 알린다. */
  const seatOpts = (seats?.seats ?? []).filter(s => s.open || s.code === offer.openingCode)
  const chosen = seats?.seats.find(s => s.code === seat)
  const tight = !!seats && seats.state === 'ok' && seats.pending > seats.open

  const seatBlock = !seats || seats.state === 'not-configured' || seats.state === 'no-req' ? null : (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 6 }}>어느 포지션에 앉히나</div>

      {seats.state === 'error' ? (
        <div style={{ fontSize: 11.5, color: 'var(--late)' }}>
          TalentCore 포지션 대장을 읽지 못했습니다 ({seats.detail}). 포지션 없이 진행하면
          합격자가 <b>정원 밖</b>으로 넘어갑니다.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="in sm" style={{ width: 320 }} value={seat} disabled={busy}
              onChange={e => setSeat(e.target.value)}>
              <option value="">— 포지션 고르지 않음 (정원 밖) —</option>
              {seatOpts.map(s => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.level_label}
                  {s.band[1] ? ` · ${s.band[0].toLocaleString()}~${s.band[1].toLocaleString()}만원` : ''}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11.5, color: tight ? 'var(--late)' : 'var(--t3)' }}>
              남은 포지션 <b>{seats.open}</b> · 진행 중 오퍼 <b>{seats.pending}</b>
            </span>
          </div>

          {seats.open === 0 && !seat ? (
            <div style={{ fontSize: 11.5, color: 'var(--esc)', marginTop: 6 }}>
              빈 포지션이 없습니다. 이대로 수락되면 <b>정원 밖</b>으로 넘어갑니다 —
              TalentCore 에서 헤드카운트를 늘리는 결재를 먼저 올리세요.
            </div>
          ) : tight ? (
            <div style={{ fontSize: 11.5, color: 'var(--late)', marginTop: 6 }}>
              진행 중인 오퍼가 남은 포지션보다 많습니다. 전원이 수락하면
              뒤에 수락한 사람은 <b>포지션을 받지 못합니다</b>.
            </div>
          ) : chosen && draftBase && chosen.band[1] && draftBase > chosen.band[1] ? (
            <div style={{ fontSize: 11.5, color: 'var(--esc)', marginTop: 6 }}>
              이 포지션의 밴드 상한 {chosen.band[1].toLocaleString()}만원을 넘습니다.
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 6 }}>
              포지션은 <b>후보자가 수락할 때</b> 잡힙니다. 지금 골라 두면 수락 즉시
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
    head = coreRejected ? '처우안 수정 (반려됨)' : '처우안 작성'
    body = (
      <>
        {coreRejected ? (
          <div style={{
            fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.6, marginBottom: 14,
            padding: '10px 12px', borderLeft: '2px solid var(--esc)', background: 'var(--sunken)',
          }}>
            <b style={{ color: 'var(--esc)' }}>TalentCore 에서 반려되었습니다</b>
            {core?.memo ? <> — {core.memo}</> : null}
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>
              조건을 고쳐 다시 올리면 새 결재가 올라갑니다 — 앞선 승인도 다시 받습니다.
            </div>
          </div>
        ) : null}

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
            <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>
              입사 예정일{rule?.label ? ` (${rule.label}만)` : ''}
            </div>
            {rule ? (
              <select className="in sm mono" style={{ width: 170 }} value={start}
                onChange={e => setStart(e.target.value)} disabled={busy}>
                <option value="">미정</option>
                {start && !rule.dates.includes(start)
                  ? <option value={start}>{dayLabel(start)} · 규칙 밖</option> : null}
                {rule.dates.map(d => <option key={d} value={d}>{dayLabel(d)}</option>)}
              </select>
            ) : (
              <input className="in sm mono" type="date" style={{ width: 150 }} value={start}
                onChange={e => setStart(e.target.value)} disabled={busy} />
            )}
          </label>
        </div>

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 6 }}>스톡옵션 (선택)</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ marginBottom: 0 }}>
              <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>수량 (주)</div>
              <input className="in sm w-sm mono" inputMode="numeric" value={eqUnits}
                onChange={e => setEqUnits(e.target.value.replace(/[^0-9]/g, ''))} disabled={busy} />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>1주 행사가 (원)</div>
              <input className="in sm w-sm mono" inputMode="numeric" value={eqStrike}
                onChange={e => setEqStrike(e.target.value.replace(/[^0-9]/g, ''))} disabled={busy} />
            </label>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 6, lineHeight: 1.6 }}>
            베스팅·클리프·안내 문구는 TalentCore 설정(오퍼레터)에서 회사 공통으로 정합니다.
            <b> 현재가치는 적지 않습니다</b> — 비상장 주식은 근거 있는 값을 낼 수 없고,
            숫자를 적으면 회사가 그 가치를 보장한 것으로 읽힙니다.
          </div>
        </div>

        {rule && start && rule.orientation.start ? (
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 8 }}>
            첫날 {rule.orientation.start}~{rule.orientation.end}{' '}
            {rule.orientation.roomName || rule.orientation.room} 오리엔테이션 — TalentCore 에서 자동으로 잡힙니다
          </div>
        ) : null}

        {seatBlock}

        <div style={{ fontSize: 11.5, color: draftOver ? 'var(--esc)' : 'var(--t3)', marginTop: 10 }}>
          {draftOver
            ? <>밴드 상한 {won(offer.band[1])}을 <b>{won(draftBase - offer.band[1])}</b> 넘습니다 — 승인 요청을 누르면 <b>TalentCore 오퍼 결재</b>가 올라갑니다(결재선·대결은 TalentCore 규칙을 따릅니다).</>
            : <>밴드 {won(offer.band[0])} ~ {won(offer.band[1])} 안입니다. 승인 단계는 {offer.chain.length}명입니다.</>}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          <button className="btn" disabled={busy}
            onClick={() => run(() => saveOfferDraft(offer.cid, draftPatch()),
              '처우안을 저장했습니다')}>
            <Icon id="i-check-sq" className="ic-sm" />저장
          </button>
          <button className="btn solid" disabled={busy || !level.trim() || !draftBase}
            onClick={() => run(async () => {
              const r = await saveOfferDraft(offer.cid, draftPatch())
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
  } else if (coreWaiting && cur) {
    /* 여기서는 누를 수 없다 — 승인·반려는 TalentCore 결재함에서 눌린다.
       Hire 가 할 수 있는 건 '내려서 조건을 다시 짜는 것'뿐이다. */
    head = 'TalentCore 결재 대기'
    body = (
      <>
        <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.6 }}>
          밴드 초과 오퍼라 <b>TalentCore 오퍼 결재</b>로 올라갔습니다 — {cur.role}.
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>
            승인·반려는 TalentCore 의 <b>오퍼 결재</b> 화면에서 누릅니다. 이 화면은 결과를
            받아 적기만 합니다 — 결재가 끝나면 여기서 오퍼를 발송할 수 있습니다.
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn" disabled={busy}
            onClick={() => run(() => withdrawOfferApproval(offer.cid), '결재를 내리고 초안으로 되돌렸습니다')}>
            결재 내리기
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
          <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn solid" disabled={busy}
              onClick={() => run(() => approveOffer(offer.cid, cur.uid), `${cur.nm} 승인으로 기록했습니다`)}>
              <Icon id="i-check-sq" className="ic-sm" />승인
            </button>
            <button className="btn" disabled={busy} onClick={() => setOpen('hold')}>보류</button>
            {/* 뒤에 TalentCore 결재가 걸려 있으면, 조건을 다시 짜려면 먼저 내려야 한다. */}
            {core ? (
              <button className="btn quiet" disabled={busy}
                onClick={() => run(() => withdrawOfferApproval(offer.cid), '결재를 내리고 초안으로 되돌렸습니다')}>
                결재 내리기
              </button>
            ) : null}
          </div>
        )}
      </>
    )
  } else if (offer.st === 'approval' && approved) {
    head = '발송'
    body = (
      <>
        <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
          승인이 모두 끝났습니다. 지금 보내면 <b>{candName}</b> 님에게 오퍼레터 메일이 나갑니다.
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>
            메일에는 조건 요약과 전용 링크가 들어가고, 후보자는 그 링크에서 직접 수락·거절합니다.
            문안(인사말·복리후생·서명자)은 TalentCore 설정을 따릅니다.
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn solid" disabled={busy} onClick={doSend}>
            <Icon id="i-mail" className="ic-sm" />오퍼레터 발송
          </button>
        </div>
        {linkBox}
      </>
    )
  } else if (offer.st === 'sent') {
    head = '후보자 응답 기록'
    body = (
      <>
        <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>
          {candName} 님이 오퍼레터 링크에서 직접 답하면 자동으로 기록됩니다.
          전화나 메일로 답을 받았을 때만 아래에서 대신 기록하세요.
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }}>
            기록하면 보드의 카드도 같이 이동합니다.
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn quiet" disabled={busy} onClick={showLink}>오퍼레터 주소 보기</button>
        </div>
        {linkBox}

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
