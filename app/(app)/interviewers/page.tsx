/* 면접관 · 직원 명부 (T4)
   ---------------------------------------------------------
   서버에서 세 가지를 준비해 화면에 넘긴다.
   · TalentCore 연동 상태 + 마지막 동기화 시각
   · 하루가 지났으면 조용히 한 번 맞춰 놓기(maybeSync) — 화면을 여는 것이
     곧 동기화 신호다. 별도 스케줄러 없이도 명부가 하루 이상 묵지 않는다.
     실패해도 화면은 그냥 뜬다(어제 명부라도 쓸 수 있다).
   · 사람별 '앞으로 2주 가용시간' — 이 계산은 서버 것이라 여기서 끝낸다. */
import { hydrateData } from '../../lib/db'
import { maybeSync, lastSyncedAt } from '../../lib/directory'
import { coreState, coreLabel } from '../../lib/core'
import { people, TODAY } from '../../lib/data'
import { availGrid, capacity } from '../../lib/availability'
import Directory, { type Row } from '../../components/Directory'

export const dynamic = 'force-dynamic'

export default async function Page() {
  /* 순서가 중요하다 — 먼저 맞추고, 그다음에 하이드레이트해야
     방금 들어온 직원이 이번 화면에 바로 보인다. */
  await maybeSync()
  await hydrateData()

  const capOf = (uid: string) => {
    const g = availGrid(uid, TODAY, 14)
    if (!g.ok) return null
    /* 아직 한 번도 안 낸 사람을 '전부 가능'으로 보여주면 안 된다.
       근무시간 기본값으로 계산한 숫자일 뿐인데, 표에서는 '이 사람은 언제든 된다'로 읽힌다.
       코디네이터가 이 칸에서 얻어야 하는 답은 '누구한테 아직 안 물어봤나'다. */
    const c = capacity(g.days!, g.times!, g.open!, 60)
    return { saved: !!g.saved, fits: c.fits, thin: c.thin }
  }

  const rows: Row[] = people.map(u => ({
    id: u.id, nm: u.nm, tt: u.tt, dept: u.dept, email: u.email ?? null,
    roles: u.roles, ea: u.ea, eaNm: u.eaNm ?? '', ch: u.ch, sla: u.sla, resp: u.resp,
    /* 마이그레이션 008 전 DB 에는 이 칸이 없다 → 지금까지와 같이
       '전부 재직 중인 Hire 사람'으로 읽는다. */
    src: u.src ?? 'hire',
    active: u.active !== false,
    empNo: u.empNo ?? '',
    coreRole: u.coreRole ?? '',
    cap: capOf(u.id),
  }))

  return (
    <Directory
      rows={rows}
      link={{ state: coreState(), url: coreLabel(), last: await lastSyncedAt() }}
    />
  )
}
