'use client'

/* =========================================================
   인재풀 · 중복 정리
   ---------------------------------------------------------
   판단 규칙은 전부 lib/pool.ts 에 있다. 여기서는 그리기와 클릭만 한다.
   화면을 만들 때 지킨 것 셋:
   · 순위에는 반드시 근거를 붙인다. "왜 이 사람이 위에 있는지"를
     한 줄로 말하지 못하면 아무도 그 목록을 믿지 않는다.
   · 쿨링 기간(불합격 30일 이내)인 사람은 숨기지 않고 잠근다.
     숨기면 "왜 저 사람이 안 보이지"가 되고, 잠그면 "아, 아직이구나"가 된다.
   · 병합은 되돌리기 어려우니 두 지원건을 나란히 놓고 눈으로 비교하게 한다.
     자동으로 합치지 않는다 — 동명이인을 합치면 남의 이력이 섞인다.
   디자인 규칙: 색은 상태에만. 등급·버튼은 전부 무채색이다.
   ========================================================= */
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Icon } from './IconSprite'
import { GRADE_LABEL, GRADE_DESC, COOL_D, type PoolGrade, type DupSignal } from '../lib/pool'
import { recallToPosition, mergeCandidates, dismissDuplicate } from '../lib/actions'

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
interface App {
  id: string; nm: string; pos: string; role: string; yr: number; src: string
  ap: string; email: string | null; live: boolean; at: string; why: string
}
interface Dup { by: DupSignal; note: string; a: App; b: App }

const SIGNAL: Record<DupSignal, { l: string; d: string }> = {
  email: { l: '거의 확실', d: '이메일이 같습니다. 같은 사람일 가능성이 매우 높습니다.' },
  'name-role': { l: '가능성 높음', d: '이름이 같고 직무·연차도 맞아떨어집니다. 이력을 확인해 주세요.' },
  name: { l: '확인 필요', d: '이름만 같습니다. 동명이인일 수 있으니 이력을 보고 판단해 주세요.' },
}

export default function PoolClient(
  { pid, posTitle, wide, tab0, picker, rows, dups }: {
    pid: string
    posTitle: string
    wide: boolean
    tab0: 'pool' | 'dup'
    picker: { id: string; nm: string; hold: boolean }[]
    rows: Row[]
    dups: Dup[]
  },
) {
  const router = useRouter()
  /* 시작 탭은 주소가 정한다 — 후보자 화면의 '확인하기'가 바로 중복 정리로 떨어지도록. */
  const [tab, setTab] = useState<'pool' | 'dup'>(tab0)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState<string[]>([])
  /* 처리한 것은 서버가 다시 계산해 줄 때까지 화면에서 먼저 뺀다.
     router.refresh() 를 기다리는 동안 이미 누른 줄이 남아 있으면 두 번 누른다. */
  const [gone, setGone] = useState<string[]>([])

  const list = rows.filter(r => gone.indexOf('r:' + r.id) < 0)
  const pairs = dups.filter(d => gone.indexOf('d:' + d.a.id + d.b.id) < 0)
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
      <div className="chips" style={{ margin: '0 0 12px', gap: 6 }}>
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

  /* ---------- 중복 정리 ---------- */
  const appCard = (x: App, other: App) => (
    <div className="pl-app">
      <div className="pl-app-h">
        <b>{x.pos}</b>
        <span className={'pill' + (x.live ? ' ok' : '')}>{x.live ? '진행 중' : '종료'}</span>
      </div>
      <dl className="pl-kv">
        <dt>단계</dt><dd>{x.at}</dd>
        <dt>직무</dt><dd className={x.role !== other.role ? 'dif' : ''}>{x.role} · {x.yr}년차</dd>
        <dt>지원일</dt><dd>{x.ap} · {x.src}</dd>
        <dt>이메일</dt>
        <dd className={x.email && x.email === other.email ? 'dif' : ''}>{x.email ?? '없음'}</dd>
        <dt>결과</dt><dd>{x.why}</dd>
      </dl>
      <Link className="pl-app-l" href={'/c/' + x.id}>지원건 열기<Icon id="i-chevron" className="ic-sm" /></Link>
    </div>
  )

  const dup = (
    <>
      <div className="pl-lead">
        <Icon id="i-info" className="ic-sm" />
        <span>
          같은 사람의 지원건으로 <b>보이는</b> 짝입니다. 자동으로 합치지 않습니다 —
          동명이인을 합치면 남의 이력이 섞이고, 되돌리기 어렵습니다.
          묶어도 <b>지원건은 둘 다 그대로 남고</b>, 후보자 화면에서 서로의 이력이 보이게 됩니다.
        </span>
      </div>

      {!pairs.length ? (
        <div className="zero" style={{ maxWidth: 760 }}>
          <Icon id="i-check-circle" className="ic-lg" />
          <b>정리할 중복이 없습니다</b>
          <span>새 지원이 들어오면 이름·이메일이 겹치는 건을 여기에 올려 드립니다.</span>
        </div>
      ) : (
        <div className="pl-dups">
          {pairs.map(d => {
            const k = d.a.id + d.b.id
            return (
              <div className="pl-dup" key={k}>
                <div className="pl-dup-h">
                  <b>{d.a.nm}</b>
                  <span className={'pill' + (d.by === 'email' ? ' bad' : d.by === 'name-role' ? ' warn' : '')}>
                    {SIGNAL[d.by].l}
                  </span>
                  <span className="pl-dup-x">{d.note}</span>
                </div>
                <div className="pl-dup-d">{SIGNAL[d.by].d}</div>
                <div className="pl-cmp">
                  {appCard(d.a, d.b)}
                  {appCard(d.b, d.a)}
                </div>
                <div className="pl-dup-f">
                  <button
                    className="btn solid sm"
                    disabled={busy === 'm' + k}
                    onClick={() => run(
                      'm' + k, 'd:' + k,
                      () => mergeCandidates(d.a.id, d.b.id),
                      `${d.a.nm} — 두 지원건을 한 사람으로 묶음`,
                    )}
                  >
                    <Icon id="i-link" className="ic-sm" />
                    {busy === 'm' + k ? '묶는 중…' : '같은 사람입니다'}
                  </button>
                  <button
                    className="btn sm"
                    disabled={busy === 'x' + k}
                    onClick={() => run(
                      'x' + k, 'd:' + k,
                      () => dismissDuplicate(d.a.id, d.b.id),
                      `${d.a.nm} — 동명이인으로 확인`,
                    )}
                  >
                    {busy === 'x' + k ? '저장 중…' : '다른 사람입니다'}
                  </button>
                </div>
              </div>
            )
          })}
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
          {pairs.length > 0 ? <span className="pill bad">중복 {pairs.length}건</span> : null}
        </div>
        <div className="meta">
          <i>지원건은 지우지 않습니다 — 다시 올리면 <b>새 지원건</b>이 만들어지고 과거 기록은 그대로 남습니다</i>
        </div>
      </header>

      <div className="stage">
        <div className="tabs" style={{ marginBottom: 14 }}>
          <button className={'tab' + (tab === 'pool' ? ' on' : '')} onClick={() => setTab('pool')}>
            다시 볼 사람 <span className="cnt">{list.length}</span>
          </button>
          <button className={'tab' + (tab === 'dup' ? ' on' : '')} onClick={() => setTab('dup')}>
            중복 정리 <span className="cnt">{pairs.length}</span>
          </button>
        </div>

        {err ? <div className="pl-err"><Icon id="i-alert" className="ic-sm" />{err}</div> : null}

        {tab === 'pool' ? pool : dup}

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
