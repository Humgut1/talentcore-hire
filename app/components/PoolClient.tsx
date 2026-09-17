'use client'

/* =========================================================
   인재풀
   ---------------------------------------------------------
   판단 규칙은 전부 lib/pool.ts 에 있다. 여기서는 그리기와 클릭만 한다.
   화면을 만들 때 지킨 것 셋:
   · 순위에는 반드시 근거를 붙인다. "왜 이 사람이 위에 있는지"를
     한 줄로 말하지 못하면 아무도 그 목록을 믿지 않는다.
   · 쿨링 기간(불합격 30일 이내)인 사람은 숨기지 않고 잠근다.
     숨기면 "왜 저 사람이 안 보이지"가 되고, 잠그면 "아, 아직이구나"가 된다.
   · 중복 지원(이름+전화번호)은 여기서 정리하지 않는다 — 후보자 화면에 이력으로만 보인다.
   디자인 규칙: 색은 상태에만. 등급·버튼은 전부 무채색이다.
   ========================================================= */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import { GRADE_LABEL, GRADE_DESC, COOL_D, type PoolGrade } from '../lib/pool'
import { recallToPosition } from '../lib/actions'

/* DB 미설정·새 칸 없음은 '실패'가 아니다 — 화면에는 반영되고 저장만 안 된 상태. */
const softFail = (r?: string) =>
  r === 'not-configured' ||
  !!(r && (r.indexOf('does not exist') >= 0 || r.indexOf('schema cache') >= 0))

const REASON: Record<string, string> = {
  'no-candidate': '지원건을 찾지 못했습니다. 새로고침해 주세요.',
  'no-stage': '이 공고에 지원 접수 단계가 없습니다.',
  'already-open': '이미 이 공고에 진행 중인 지원건이 있습니다.',
}

interface Row {
  id: string; nm: string; role: string; yr: number; src: string
  grade: PoolGrade; why: string; gotTo: string; posTitle: string
  sinceD: number; ready: boolean; hold: string | null
}
export default function PoolClient(
  { pid, posTitle, wide, picker, rows }: {
    pid: string
    posTitle: string
    wide: boolean
    picker: { id: string; nm: string; hold: boolean }[]
    rows: Row[]
  },
) {
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState<string[]>([])
  /* 처리한 것은 서버가 다시 계산해 줄 때까지 화면에서 먼저 뺀다.
     router.refresh() 를 기다리는 동안 이미 누른 줄이 남아 있으면 두 번 누른다. */
  const [gone, setGone] = useState<string[]>([])

  const list = rows.filter(r => gone.indexOf('r:' + r.id) < 0)
  const gold = list.filter(r => r.grade === 'gold').length
  const held = list.filter(r => !r.ready).length

  async function run(
    key: string, gk: string,
    fn: () => Promise<{ ok: boolean; reason?: string }>,
    line: string,
  ) {
    if (busy) return
    setBusy(key); setErr('')
    try {
      const r = await fn()
      if (!r.ok && !softFail(r.reason)) {
        setErr(REASON[r.reason ?? ''] ?? '저장하지 못했습니다 (' + (r.reason ?? '알 수 없는 오류') + ')')
        return
      }
      setGone(g => [...g, gk])
      setDone(d => [line, ...d])
      router.refresh()
    } catch {
      setErr('저장하지 못했습니다. 잠시 뒤 다시 눌러주세요.')
    } finally {
      setBusy('')
    }
  }

  /* ---------- 인재풀 ---------- */
  const pool = (
    <>
      <div className="chips" style={{ margin: '0 0 12px', gap: 6, flexWrap: 'wrap' }}>
        {picker.map(x => (
          <Link
            className={'chip' + (x.id === pid ? ' on' : '')}
            href={'/pool?p=' + x.id + (wide ? '&all=1' : '')}
            key={x.id}
          >
            {x.nm}{x.hold ? ' · 보류' : ''}
          </Link>
        ))}
        <Link
          className={'chip' + (wide ? ' on' : '')}
          href={'/pool?p=' + pid + (wide ? '' : '&all=1')}
          style={{ marginLeft: 'auto' }}
        >
          <Icon id="i-filter" className="ic-sm" />
          {wide ? '직무 맞는 사람만' : '직무 무관 전체'}
        </Link>
      </div>

      <div className="pl-lead">
        <Icon id="i-info" className="ic-sm" />
        <span>
          <b>{posTitle}</b> 자리에 다시 부를 만한 과거 지원자입니다.
          {wide
            ? ' 직무가 겹치지 않는 사람까지 보고 있습니다 — 자리 성격이 바뀌었을 때만 쓰세요.'
            : ' 지금은 직무가 겹치는 사람만 보고 있습니다.'}
          {' '}불합격 {COOL_D}일이 지나지 않은 사람은 잠겨 있습니다.
        </span>
      </div>

      {!list.length ? (
        <div className="zero" style={{ maxWidth: 760 }}>
          <Icon id="i-users" className="ic-lg" />
          <b>다시 부를 만한 사람이 없습니다</b>
          <span>
            {wide
              ? '이 공고로 꺼내 쓸 과거 지원자가 아직 없습니다.'
              : '직무가 겹치는 사람이 없습니다. 위에서 “직무 무관 전체”를 켜 보세요.'}
          </span>
        </div>
      ) : (
        <div className="pl-rows">
          {list.map(r => (
            <div className={'pl-r' + (r.ready ? '' : ' lock')} key={r.id}>
              <div className="pl-g" title={GRADE_DESC[r.grade]}>{GRADE_LABEL[r.grade]}</div>
              <div className="pl-m">
                <div className="pl-n">
                  <Link href={'/c/' + r.id}>{r.nm}</Link>
                  <span className="pl-yr">{r.yr}년차</span>
                  <span className="pl-role">{r.role}</span>
                </div>
                <div className="pl-w">
                  {r.why}<span className="pl-sep">/</span>{r.posTitle}<span className="pl-sep">/</span>{r.gotTo}<span className="pl-sep">/</span>{r.src}
                </div>
                {r.hold ? (
                  <div className="pl-hold"><Icon id="i-lock" className="ic-sm" />{r.hold}</div>
                ) : null}
              </div>
              <div className="pl-d">{r.sinceD}일 전</div>
              <button
                className="btn sm"
                disabled={!r.ready || busy === 'r' + r.id}
                title={r.ready ? undefined : (r.hold ?? undefined)}
                onClick={() => run(
                  'r' + r.id, 'r:' + r.id,
                  () => recallToPosition(r.id, pid),
                  `${r.nm} — ${posTitle} 지원 접수로 올림`,
                )}
              >
                {busy === 'r' + r.id ? '올리는 중…' : '이 공고로 올리기'}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )

  return (
    <>
      <header className="top">
        <div className="crumb"><Icon id="i-users" className="ic-sm" />채용</div>
        <div className="h-row">
          <h1>인재풀</h1>
          <span className="pill">{list.length}명</span>
          {gold > 0 ? <span className="pill">은메달 {gold}명</span> : null}
          {held > 0 ? <span className="pill"><Icon id="i-lock" className="ic-sm" />대기 {held}명</span> : null}
        </div>
        <div className="meta">
          <i>지원건은 지우지 않습니다 — 다시 올리면 <b>새 지원건</b>이 만들어지고 과거 기록은 그대로 남습니다</i>
        </div>
      </header>

      <div className="stage">

        {err ? <div className="pl-err"><Icon id="i-alert" className="ic-sm" />{err}</div> : null}

        {pool}

        {done.length > 0 ? (
          <div className="sheet" style={{ marginTop: 16, padding: '12px 14px', maxWidth: 760 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t4)', marginBottom: 6 }}>
              방금 처리한 것 {done.length}건
            </div>
            {done.map((d, n) => (
              <div key={n} style={{ fontSize: 12, color: 'var(--t2)', padding: '2px 0' }}>{d}</div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  )
}
