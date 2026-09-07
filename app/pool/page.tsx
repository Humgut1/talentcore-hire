import { hydrateData } from '../lib/db'
import PoolClient from '../components/PoolClient'
import { poolFor, dupPairs, openPositions } from '../lib/pool'
import { posById, stageById, type Candidate } from '../lib/data'
import { rejectDef } from '../lib/decision'

/* 인재풀 · 중복 정리
   ---------------------------------------------------------
   공고 선택과 '직무 무관 전체 보기'는 주소(?p=, ?all=1)로 옮긴다.
   /review 가 ?u= 로 사람을 고르는 것과 같은 규칙 — 링크를 복사해 넘길 수 있고,
   뒤로가기가 사람의 기대대로 움직인다. 탭만 화면 안 상태로 둔다. */

/** 지원건 한 건을 화면이 읽을 수 있는 납작한 모양으로. */
function card(c: Candidate) {
  const live = c.st !== 's0'
  return {
    id: c.id,
    nm: c.nm,
    pos: posById(c.p).title,
    role: c.role,
    yr: c.yr,
    src: c.src,
    ap: c.ap,
    email: c.email ?? null,
    live,
    at: live
      ? stageById(c.p, c.st).nm + ' 진행 중'
      : (c.ex ? stageById(c.p, c.ex).nm + '에서 종료' : '종료'),
    why: c.rj ? rejectDef(c.rj).l : (c.why || '—'),
  }
}

export default async function Page(
  { searchParams }: { searchParams: Promise<{ p?: string; all?: string; t?: string }> },
) {
  const { p, all, t } = await searchParams
  await hydrateData()

  const opens = openPositions()
  const pid = opens.some(x => x.id === p) ? p! : (opens[0]?.id ?? 'p1')
  const wide = all === '1'

  const rows = poolFor(pid, wide).map(r => ({
    id: r.c.id, nm: r.c.nm, role: r.c.role, yr: r.c.yr, src: r.c.src,
    grade: r.grade, why: r.why, gotTo: r.gotTo, posTitle: r.posTitle,
    sinceD: r.sinceD, ready: r.ready, hold: r.hold ?? null,
  }))

  const dups = dupPairs().map(d => ({
    by: d.by, note: d.note, a: card(d.a), b: card(d.b),
  }))

  return (
    <PoolClient
      pid={pid}
      posTitle={posById(pid).title}
      wide={wide}
      tab0={t === 'dup' ? 'dup' : 'pool'}
      picker={opens.map(x => ({ id: x.id, nm: x.title, hold: x.st === 'hold' }))}
      rows={rows}
      dups={dups}
    />
  )
}
