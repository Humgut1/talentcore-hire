'use client'

/* =========================================================
   서류 검토 (HM 화면) — 한 명씩 세워두고 넘긴다
   ---------------------------------------------------------
   왜 이렇게 만들었는지는 lib/review.ts 머리말에 있다. 요지는 하나다:
   목록 → 상세 → 뒤로 를 왕복하게 만들면 HM 은 쌓인 서류를 안 본다.
   · 판정하면 그 사람은 큐에서 빠지고 다음 사람이 자동으로 올라온다.
   · 색은 상태에만 — 판정 버튼 셋은 전부 무채색이다. 기준 초과(빨강)만 색을 쓴다.
   · 저장은 후보자 상세와 같은 서버 액션을 쓴다. 규칙을 두 벌 만들지 않는다.
   ========================================================= */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import type { ReviewItem } from '../lib/review'
import { SIDE_LABEL, SIDE_DESC, reasonsOf, type RejectCode, type RejectSide } from '../lib/decision'
import { advanceCand, holdCand, rejectCand } from '../lib/actions'

const REASON: Record<string, string> = {
  'no-candidate': '후보자를 찾지 못했습니다.',
  'closed': '이미 종료된 전형입니다. 새로고침해 주세요.',
  'no-next': '다음 단계가 없습니다.',
  'no-rail': '이 공고에 불합격 단계가 없습니다.',
  'need-memo': '보류 사유를 적어야 저장됩니다.',
  'need-reason': '불합격 사유를 골라야 저장됩니다.',
}

/* DB 미설정·새 칸 없음은 '실패'가 아니다 — 화면에는 반영되고 저장만 안 된 상태. */
const softFail = (r?: string) =>
  r === 'not-configured' ||
  !!(r && (r.indexOf('does not exist') >= 0 || r.indexOf('schema cache') >= 0))

export default function ReviewQueue(
  { items, who, whoTt, picker }:
  { items: ReviewItem[]; who: string; whoTt: string; picker: { id: string; nm: string; n: number }[] },
) {
  const router = useRouter()
  const [queue, setQueue] = useState<ReviewItem[]>(items)
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<string[]>([])
  const [open, setOpen] = useState<'' | 'hold' | 'reject'>('')
  const [memo, setMemo] = useState('')
  const [side, setSide] = useState<RejectSide>('us')
  const [code, setCode] = useState<RejectCode | ''>('')
  const [rMemo, setRMemo] = useState('')

  const cur: ReviewItem | undefined = queue[Math.min(i, queue.length - 1)]
  const over = queue.filter(x => x.over).length

  function reset() { setOpen(''); setMemo(''); setCode(''); setRMemo(''); setErr('') }

  /* 판정 → 큐에서 빼고, 같은 자리에 다음 사람이 올라온다. */
  async function run(fn: () => Promise<{ ok: boolean; reason?: string }>, line: string) {
    if (busy || !cur) return
    setBusy(true); setErr('')
    try {
      const r = await fn()
      if (!r.ok && !softFail(r.reason)) {
        setErr(REASON[r.reason ?? ''] ?? '저장하지 못했습니다 (' + (r.reason ?? '알 수 없는 오류') + ')')
        return
      }
      const id = cur.cid
      setQueue(q => q.filter(x => x.cid !== id))
      setI(x => Math.max(0, Math.min(x, queue.length - 2)))
      setDone(d => [line, ...d])
      reset()
      router.refresh()
    } catch {
      setErr('저장하지 못했습니다. 잠시 뒤 다시 눌러주세요.')
    } finally {
      setBusy(false)
    }
  }

  const chips = (
    <div className="chips" style={{ margin: '0 0 14px', gap: 6 }}>
      {picker.map(p => (
        <Link className={'chip' + (p.nm === who ? ' on' : '')} href={'/review?u=' + p.id} key={p.id}>
          {p.nm} <b>{p.n}</b>
        </Link>
      ))}
    </div>
  )

  const doneNote = done.length > 0 ? (
    <div className="sheet" style={{ marginTop: 14, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', marginBottom: 6 }}>
        방금 처리한 것 {done.length}건
      </div>
      {done.map((d, n) => (
        <div key={n} style={{ fontSize: 12, color: 'var(--t2)', padding: '2px 0' }}>{d}</div>
      ))}
    </div>
  ) : null

  return (
    <>
      <header className="top">
        <div className="crumb"><Icon id="i-check-sq" className="ic-sm" />내 화면</div>
        <div className="h-row">
          <h1>서류 검토</h1>
          <span className={'pill' + (queue.length ? '' : ' ok')}>{queue.length}명 대기</span>
          {over > 0 ? (
            <span className="pill bad"><Icon id="i-alert" className="ic-sm" />기준 초과 {over}명</span>
          ) : null}
        </div>
        <div className="meta">
          <i><Icon id="i-user" className="ic-sm" /><b>{who}</b> · {whoTt}</i>
          <i>판정하면 자동으로 다음 사람이 올라옵니다</i>
        </div>
      </header>

      <div className="stage">
        {chips}

        {!cur ? (
          <div className="zero" style={{ maxWidth: 760 }}>
            <Icon id="i-check-circle" className="ic-lg" />
            <b>{who} 님이 볼 서류가 없습니다</b>
            <span>비어 있는 게 정상입니다 — 새 지원이 서류 검토 단계에 오면 여기에 쌓입니다.</span>
            {doneNote}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: 18, alignItems: 'start', maxWidth: 1060 }}>

            {/* ---------- 왼쪽: 대기 줄 ---------- */}
            <div>
              <div className="sec-h"><h3>대기 줄</h3><span className="hint">{queue.length}명</span></div>
              <div className="sheet">
                {queue.map((x, n) => (
                  <button
                    key={x.cid}
                    onClick={() => { setI(n); reset() }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '10px 13px',
                      borderTop: n ? '1px solid var(--line)' : undefined,
                      background: x.cid === cur.cid ? 'var(--sunken)' : 'transparent',
                      boxShadow: x.cid === cur.cid ? 'inset 2px 0 0 var(--t1)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <b style={{ fontSize: 13, letterSpacing: '-.02em' }}>{x.nm}</b>
                      <span style={{
                        marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11,
                        color: x.over ? 'var(--esc)' : 'var(--t4)', fontWeight: x.over ? 700 : 400,
                      }}>{x.d}d</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t4)', marginTop: 1 }}>
                      {x.held ? <b style={{ color: 'var(--late)' }}>보류 · </b> : null}{x.pos}
                    </div>
                  </button>
                ))}
              </div>
              {doneNote}
            </div>

            {/* ---------- 오른쪽: 지금 볼 사람 ---------- */}
            <div>
              <div className="sec-h">
                <h3>{i + 1}번째 / {queue.length}명</h3>
                <span className="hint">{cur.pos} · {cur.stage}</span>
              </div>

              <div className="sheet" style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.03em' }}>{cur.nm}</h2>
                  <span className="pill">{cur.yr}년차</span>
                  {cur.over
                    ? <span className="pill bad"><Icon id="i-clock" className="ic-sm" />{cur.d}일째 · 기준 {cur.sla}일</span>
                    : <span className="pill">{cur.d}일째 · 기준 {cur.sla}일</span>}
                  {cur.held ? <span className="pill warn">보류 중</span> : null}
                  <Link className="btn quiet" style={{ marginLeft: 'auto' }} href={'/c/' + cur.cid}>
                    전체 상세
                  </Link>
                </div>

                <div className="kv" style={{ marginTop: 12 }}>
                  {cur.held ? <div><dt>보류 사유</dt><dd>{cur.why.replace('판정 보류 — ', '')}</dd></div> : null}
                  <div><dt>경력</dt><dd>{cur.role}</dd></div>
                  <div><dt>유입</dt><dd>{cur.src} · {cur.ap} 지원</dd></div>
                  <div><dt>공고</dt><dd>{cur.pos} <span style={{ color: 'var(--t4)' }}>({cur.dept})</span></dd></div>
                  <div>
                    <dt>같이 보는 사람</dt>
                    <dd>{cur.withMe.length
                      ? cur.withMe.join(' · ')
                      : <span style={{ color: 'var(--t4)' }}>없음 — 이 판정이 곧 결과입니다</span>}</dd>
                  </div>
                </div>

                {cur.jd ? (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--sunken)', borderRadius: 'var(--r-lg)', fontSize: 12, color: 'var(--t2)', lineHeight: 1.6 }}>
                    <b style={{ fontSize: 11, color: 'var(--t4)', display: 'block', marginBottom: 3 }}>이 자리가 찾는 사람</b>
                    {cur.jd}
                  </div>
                ) : null}

                {/* ---------- 판정 ---------- */}
                <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                  <button
                    className="btn solid" style={{ flex: 1, justifyContent: 'center' }} disabled={busy}
                    onClick={() => run(() => advanceCand(cur.cid), cur.nm + ' · 다음 단계로')}
                  >
                    <Icon id="i-check-circle" className="ic-sm" />다음 단계로
                  </button>
                  <button className="btn" disabled={busy} onClick={() => { const o = open; reset(); setOpen(o === 'hold' ? '' : 'hold') }}>
                    보류
                  </button>
                  <button className="btn" disabled={busy} onClick={() => { const o = open; reset(); setOpen(o === 'reject' ? '' : 'reject') }}>
                    불합격
                  </button>
                </div>

                {open === 'hold' ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="field" style={{ marginBottom: 8 }}>
                      <label>보류 사유 (필수)</label>
                      <textarea
                        className="ta" value={memo} autoFocus
                        placeholder="왜 지금 결정하지 않는지 한 줄로. 이 줄이 없으면 나중에 아무도 이유를 기억하지 못합니다."
                        onChange={e => setMemo(e.target.value)}
                      />
                    </div>
                    <button
                      className="btn solid" disabled={busy || !memo.trim()}
                      onClick={() => run(() => holdCand(cur.cid, memo), cur.nm + ' · 보류')}
                    >보류로 저장</button>
                  </div>
                ) : null}

                {open === 'reject' ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="seg" style={{ marginBottom: 10 }}>
                      {(['us', 'them'] as RejectSide[]).map(sd => (
                        <button key={sd} className={side === sd ? 'on' : ''}
                          onClick={() => { setSide(sd); setCode('') }}>{SIDE_LABEL[sd]}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--t3)', marginBottom: 4 }}>{SIDE_DESC[side]}</div>
                    <div className="preset">
                      {reasonsOf(side).map(r => (
                        <button key={r.v} onClick={() => setCode(r.v)} title={r.d}
                          style={code === r.v
                            ? { background: 'var(--t1)', color: '#fff', borderColor: 'var(--t1)' }
                            : undefined}>{r.l}</button>
                      ))}
                    </div>
                    <div className="field" style={{ margin: '12px 0 8px' }}>
                      <label>메모 (선택)</label>
                      <textarea className="ta" value={rMemo} style={{ minHeight: 56 }}
                        placeholder="어느 항목이 부족했는지 적어두면 나중에 JD 를 고칠 때 쓰입니다."
                        onChange={e => setRMemo(e.target.value)} />
                    </div>
                    <button
                      className="btn solid" disabled={busy || !code}
                      onClick={() => run(() => rejectCand(cur.cid, code as string, rMemo), cur.nm + ' · 불합격')}
                    >불합격으로 저장</button>
                    <div style={{ fontSize: 11.5, color: 'var(--t4)', marginTop: 6 }}>
                      통보 메일은 자동으로 나가지 않습니다. 초안은 후보자 상세에서 만듭니다.
                    </div>
                  </div>
                ) : null}

                {err ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--esc)', fontWeight: 600 }}>{err}</div>
                ) : null}
              </div>

              <div className="note" style={{ marginTop: 16 }}>
                <h4><Icon id="i-info" className="ic-sm" />이 화면을 쓰는 법</h4>
                <ul>
                  <li>판정하면 그 사람은 줄에서 빠지고 <b>다음 사람이 자동으로</b> 올라옵니다. 목록으로 돌아갈 필요가 없습니다.</li>
                  <li>줄은 <b>기준 체류일을 넘긴 사람</b>부터입니다. 서류에서 밀리면 그 아래 단계가 전부 같이 밀립니다.</li>
                  <li>애매하면 <b>보류</b>를 쓰세요. 합·불 둘로만 두면 &ldquo;일단 킵&rdquo;이 아무 데도 안 남습니다.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
