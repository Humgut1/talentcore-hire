'use client'

/* =========================================================
   전형 판정 패널 (실동작)
   ---------------------------------------------------------
   후보자 상세 화면 위쪽에 들어가는 '지금 누를 수 있는 것'만 그린다.
   · 무엇을 누를 수 있고 평가가 어디까지 모였는지는 lib/decision.ts 가
     계산한다 — 여기서 조건을 다시 만들지 않는다.
   · 버튼은 무채색. 색은 상태(보류·불합격·이견)에만 쓴다.
   · 불합격 사유는 <우리가 거절> / <후보자가 이탈> 두 묶음으로 나눠 받는다.
     둘을 섞으면 퍼널에서 '기준이 빡센 것'과 '우리가 안 팔린 것'이 구분되지 않는다.
   · 통보 메일은 판정과 한 창에서 정한다 — 판정만 저장하고 통보를 잊는 일이 실제로 생긴다.
     '보내지 않음'은 언제든 고를 수 있지만, 그건 눌러서 고른 선택이어야 한다.
   ========================================================= */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import {
  SIDE_LABEL, SIDE_DESC, reasonsOf, rejectDef, rejectMailDraft,
  type DecisionView, type RejectCode, type RejectSide,
} from '../lib/decision'
import { VERDICT_LABEL } from '../lib/scorecard'
import { tplByCode } from '../lib/cand-mail'
import { advanceAndNotify, holdCand, rejectAndNotify, undoReject } from '../lib/actions'

/* 통보 메일 고르는 줄 — 보드의 일괄 처리 창과 같은 문구를 쓴다. */
const PASS_MAIL: [string | null, string, string][] = [
  ['doc-pass', '일정 조율 요청', '다음 전형 일정을 잡기 위해 가능한 시간을 여쭙습니다'],
  ['iv-info', '면접 안내', '이미 시간이 정해진 경우 — 확정된 일정을 안내합니다'],
  [null, '보내지 않음', '이미 전화·문자로 알렸거나, 본문을 직접 쓰고 싶은 경우'],
]
const RJ_MAIL: [string | null, string, string][] = [
  ['auto', '전형 결과 안내', '사유와 서 있던 단계에 맞춰 본문을 지어 보냅니다'],
  ['thanks', '지원 감사 · 인재풀 보관', '다음 공고에 다시 연락드릴 분에게'],
  [null, '보내지 않음', '이미 알렸거나, 통보하지 않기로 한 경우'],
]

function MailPick({ name, opts, v, set, busy }: {
  name: string; opts: [string | null, string, string][]
  v: string | null; set: (x: string | null) => void; busy: boolean
}) {
  return (
    <div className="mp" style={{ marginTop: 10 }}>
      {opts.map(([val, l, d]) => (
        <label key={val ?? 'none'} className={'mp-o' + (v === val ? ' on' : '')}>
          <input type="radio" name={name} checked={v === val} disabled={busy}
            onChange={() => set(val)} />
          <b>{l}</b><i>{d}</i>
        </label>
      ))}
    </div>
  )
}

function MailPv({ d }: { d: { subject: string; body: string } }) {
  return (
    <div className="mail-pv">
      <div className="mail-pv-h">나갈 메일 미리보기</div>
      <div className="mail-pv-s">{d.subject}</div>
      <div className="mail-pv-b">{d.body}</div>
    </div>
  )
}

const REASON: Record<string, string> = {
  'no-candidate': '후보자를 찾지 못했습니다.',
  'closed': '이미 종료된 전형입니다. 화면을 새로고침해 주세요.',
  'no-next': '다음 단계가 없습니다.',
  'no-rail': '이 공고에 불합격 단계가 없습니다. 공고 설정에서 확인해 주세요.',
  'need-memo': '보류 사유를 적어야 저장됩니다.',
  'need-reason': '불합격 사유를 골라야 저장됩니다.',
  'not-rejected': '불합격 상태가 아닙니다.',
  'offer-declined': '후보자가 오퍼를 거절한 건은 되돌릴 수 없습니다. 후보자의 답이기 때문입니다.',
}
/* DB 미설정·새 칸 없음은 '실패'가 아니다 — 화면에는 반영되고 저장만 안 된 상태. */
const softFail = (r?: string) =>
  r === 'not-configured' ||
  !!(r && (r.indexOf('does not exist') >= 0 || r.indexOf('schema cache') >= 0))

const hint: React.CSSProperties = { fontSize: 11.5, color: 'var(--t3)', marginTop: 4 }
const line: React.CSSProperties = { fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.6 }

export default function DecisionClient({
  view, cid, cand, pos, sender, rj,
}: {
  view: DecisionView; cid: string; cand: string; pos: string; sender: string
  /* 이미 종료된 카드의 사유 — 종료 문구를 '우리가 거절'과 '후보자 이탈'로 갈라 쓴다. */
  rj?: RejectCode
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState<'' | 'pass' | 'hold' | 'reject'>('')
  /* 합격 통보의 기본값은 다음 단계가 무엇이냐에 달렸다 — 안에서만 움직이는 이동
     (지원 접수 → 서류 검토)은 후보자에게 알릴 소식이 아니다. */
  const [passMail, setPassMail] = useState<string | null>(
    view.next && (view.next.kind === 'interview' || view.next.kind === 'task') ? 'doc-pass' : null,
  )
  const [rjMail, setRjMail] = useState<string | null>('auto')

  const [memo, setMemo] = useState('')
  const [side, setSide] = useState<RejectSide>('us')
  const [code, setCode] = useState<RejectCode | ''>('')
  const [rMemo, setRMemo] = useState('')

  /* done 을 함수로도 받는다 — 서버가 '무슨 일까지 했는지'(오퍼 초안 자동 생성 등)를
     돌려주는 경우가 있어서, 그 결과에 맞는 문장을 보여주려는 것. */
  async function run<T extends { ok: boolean; reason?: string }>(
    fn: () => Promise<T>, done: string | ((r: T) => string),
  ) {
    if (busy) return
    setBusy(true); setErr(''); setMsg('')
    try {
      const r = await fn()
      if (!r.ok && !softFail(r.reason)) {
        setErr(REASON[r.reason ?? ''] ?? `저장하지 못했습니다 (${r.reason ?? '알 수 없는 오류'})`)
        return
      }
      setOpen(''); setMemo(''); setCode(''); setRMemo('')
      setMsg(typeof done === 'function' ? done(r) : done)
      router.refresh()
    } catch {
      setErr('저장하지 못했습니다. 잠시 뒤 다시 눌러주세요.')
    } finally {
      setBusy(false)
    }
  }

  /* 통보 초안 — 사유(또는 템플릿)를 고른 뒤에만 만들어진다.
     본문을 짓는 함수가 순수 함수라, 서버에 묻지 않고 고르는 즉시 바뀐다. */
  const mk = (v: string) => {
    const t = tplByCode(v)
    return t ? t.make({ cand, pos, stage: view.cur.nm, rc: sender, company: 'TalentCore' }) : null
  }
  const draft = !code || !rjMail ? null
    : rjMail === 'auto' ? rejectMailDraft({ cand, pos, stage: view.cur, code, sender })
      : mk(rjMail)
  const passDraft = !passMail || !view.next ? null : (() => {
    const t = tplByCode(passMail)
    return t ? t.make({ cand, pos, stage: view.next.nm, rc: sender, company: 'TalentCore' }) : null
  })()

  /* 판정과 통보는 따로 말한다 — 메일이 못 나가도 판정은 이미 저장됐다. */
  const mailTail = (m?: { ok: boolean; reason?: string } | null) =>
    !m ? '' : m.ok ? ' · 통보 메일을 보냈습니다'
      : m.reason === 'not-configured' ? ' · 통보 메일은 나가지 못했습니다 (메일 발송이 아직 연결되지 않았습니다)'
        : ' · 통보 메일은 나가지 못했습니다'

  /* ---------- 평가 현황 한 줄 ---------- */
  const evalLine = !view.gradable ? null : (
    <div style={{ ...line, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span>
        평가 <b>{view.submitted}</b>
        {view.expected ? ` / ${view.expected}건` : '건'}
      </span>
      <span style={{
        fontWeight: 600,
        color: view.verdict === 'pass' ? 'var(--done)'
          : view.verdict === 'fail' ? 'var(--esc)'
            : view.verdict === 'split' ? 'var(--late)' : 'var(--t4)',
      }}>
        {VERDICT_LABEL[view.verdict]}
      </span>
      {view.ready ? null : <span className="pill warn">평가 미완</span>}
    </div>
  )

  /* ---------- 상태별 본문 ---------- */
  let head = '판정'
  let body: React.ReactNode = null

  if (view.closed && view.cur.kind === 'hired') {
    head = '입사 확정'
    body = <div style={line}>{cand} 님은 입사로 마무리됐습니다. 더 누를 것은 없습니다.</div>
  } else if (view.closed) {
    const gone = rj ? rejectDef(rj).side === 'them' : false
    head = gone ? '후보자 이탈' : '종료된 전형'
    body = (
      <>
        <div style={line}>
          {gone
            ? <>{cand} 님이 <b>전형을 그만뒀습니다</b>. 우리 판단이 아니라 후보자의 결정입니다.</>
            : <>{cand} 님은 <b>불합격</b>으로 종료됐습니다. 사유는 아래에 남아 있습니다.</>}
          <div style={hint}>
            잘못 눌렀다면 되돌릴 수 있습니다 — 되돌린 기록도 함께 남습니다.
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy}
            onClick={() => run(() => undoReject(cid), '판정을 되돌렸습니다')}>
            판정 되돌리기
          </button>
        </div>
      </>
    )
  } else if (view.cur.kind === 'offer') {
    head = '오퍼 진행 중'
    body = (
      <>
        <div style={line}>
          이 단계의 판정은 <b>오퍼 화면</b>에서 이뤄집니다. 수락·거절을 기록하면
          카드가 입사 / 불합격으로 자동 이동합니다.
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          <a className="btn solid" href={`/o/${cid}`}>
            <Icon id="i-flag" className="ic-sm" />오퍼 화면으로
          </a>
          <button className="btn" disabled={busy} onClick={() => setOpen(open === 'reject' ? '' : 'reject')}>
            전형 종료
          </button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        {evalLine}
        <div style={{ ...hint, marginTop: 8 }}>
          {view.next
            ? <>다음 단계는 <b>{view.next.nm}</b> 입니다. 넘기면 체류일이 0일로 초기화되고 일정 조율이 다시 시작됩니다.</>
            : '이 단계가 마지막입니다.'}
        </div>
        {view.notes.map((n, i) => (
          <div key={i} style={{ fontSize: 11.5, color: 'var(--late)', marginTop: 6 }}>{n}</div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn solid" disabled={busy || !view.next}
            onClick={() => setOpen(open === 'pass' ? '' : 'pass')}>
            <Icon id="i-check-sq" className="ic-sm" />다음 단계로
          </button>
          <button className="btn" disabled={busy}
            onClick={() => setOpen(open === 'hold' ? '' : 'hold')}>보류</button>
          <button className="btn" disabled={busy}
            onClick={() => setOpen(open === 'reject' ? '' : 'reject')}>불합격</button>
        </div>
      </>
    )
  }

  /* ---------- 펼침: 합격 ----------
     한 번 더 누르게 한 것은 메일이 실제로 나가기 때문이다. 무엇이 나가는지 보고 누른다. */
  const passBox = open === 'pass' ? (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>
        {cand} 님을 <b>{view.next?.nm}</b> 단계로 보냅니다. 함께 나갈 메일을 고르세요.
      </div>
      <MailPick name="dc-pass" opts={PASS_MAIL} v={passMail} set={setPassMail} busy={busy} />
      {passDraft ? <MailPv d={passDraft} /> : null}
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button className="btn solid" disabled={busy || !view.next}
          onClick={() => run(() => advanceAndNotify(cid, passMail), r =>
            `${r.to ?? view.next?.nm ?? '다음 단계'} 단계로 보냈습니다` +
            (r.offerMade ? ' · 처우안 초안을 만들어 뒀습니다' : '') + mailTail(r.mail))}>
          {passMail ? '보내고 메일 발송' : '보내기 (메일 없음)'}
        </button>
        <button className="btn quiet" disabled={busy} onClick={() => setOpen('')}>취소</button>
      </div>
    </div>
  ) : null

  /* ---------- 펼침: 보류 ---------- */
  const holdBox = open === 'hold' ? (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 6 }}>
        보류 사유 — 무엇이 정해지면 다시 볼 수 있는지 적어주세요. 처리함에 올라갑니다.
      </div>
      <textarea className="ta" placeholder="예) 다른 후보 최종 결과를 본 뒤 결정. 8/20까지."
        value={memo} onChange={e => setMemo(e.target.value)} disabled={busy} />
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn" disabled={busy || !memo.trim()}
          onClick={() => run(() => holdCand(cid, memo), '보류로 기록했습니다')}>보류 저장</button>
        <button className="btn quiet" disabled={busy} onClick={() => setOpen('')}>취소</button>
      </div>
    </div>
  ) : null

  /* ---------- 펼침: 불합격 ----------
     사유를 바꾸면 아래 초안도 그 자리에서 바뀐다. 내부 사유 코드는 본문에 쓰지 않는다. */
  const rejectBox = open === 'reject' ? (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {(['us', 'them'] as RejectSide[]).map(s => (
          <button key={s} type="button" disabled={busy}
            className={`chip${side === s ? ' on' : ''}`}
            onClick={() => { setSide(s); setCode('') }}>
            {SIDE_LABEL[s]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 8 }}>{SIDE_DESC[side]}</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {reasonsOf(side).map(r => (
          <button key={r.v} type="button" title={r.d} disabled={busy}
            className={`chip${code === r.v ? ' on' : ''}`}
            onClick={() => setCode(r.v)}>
            {r.l}
          </button>
        ))}
      </div>
      {code ? (
        <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 8 }}>{rejectDef(code).d}</div>
      ) : (
        <div style={{ fontSize: 11.5, color: 'var(--t4)', marginTop: 8 }}>
          사유를 고르지 않으면 저장되지 않습니다 — 화면뿐 아니라 서버에서도 막습니다.
        </div>
      )}

      <textarea className="ta" style={{ marginTop: 10 }}
        placeholder="덧붙일 내용 (선택) — 구체적일수록 다음 채용에서 쓸모가 있습니다"
        value={rMemo} onChange={e => setRMemo(e.target.value)} disabled={busy} />

      <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 12 }}>통보 메일</div>
      <MailPick name="dc-rj" opts={RJ_MAIL} v={rjMail} set={setRjMail} busy={busy} />
      {draft ? <MailPv d={draft} /> : null}

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button className="btn" disabled={busy || !code}
          onClick={() => run(() => rejectAndNotify(cid, code, rMemo, rjMail),
            r => '전형을 종료로 기록했습니다' + mailTail(r.mail))}>
          {(side === 'them' ? '이탈로 기록' : '불합격 기록') + (rjMail ? ' + 통보' : '')}
        </button>
        <button className="btn quiet" disabled={busy} onClick={() => setOpen('')}>취소</button>
      </div>
    </div>
  ) : null

  return (
    <div className="stage" style={{ padding: '16px 26px 0' }}>
      <div className="sheet" style={{ maxWidth: 900 }}>
        <div className="sec-h" style={{ padding: '16px 18px 0' }}>
          <h3>{head}</h3>
          <small style={{ color: 'var(--t4)' }}>{view.cur.nm}</small>
        </div>
        <div style={{ padding: '12px 18px 18px' }}>
          {body}
          {passBox}
          {holdBox}
          {rejectBox}
          {err ? <div style={{ fontSize: 11.5, color: 'var(--esc)', marginTop: 10 }}>{err}</div>
            : msg ? <div style={{ fontSize: 11.5, color: 'var(--done)', marginTop: 10 }}>{msg}</div>
              : null}
        </div>
      </div>
    </div>
  )
}
