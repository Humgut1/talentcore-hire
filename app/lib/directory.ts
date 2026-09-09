/* =========================================================
   직원 명부 동기화 — TalentCore → Hire (T4)
   ---------------------------------------------------------
   하루 한 번(또는 [지금 동기화] 버튼) TalentCore 직원 명부를 당겨와
   Hire 의 people 에 맞춘다.

   이 파일이 지키는 규칙은 네 줄이 전부다.

   1) 칸 소유권.
      TalentCore 것 : 이름 · 직함 · 부서 · 메일 · 재직여부 · 역할(참고용)
      Hire 것       : 면접 역할 태그 · EA 조율 · 알림 채널 · 응답 기준 · 평균 응답
      동기화는 왼쪽만 덮어쓴다. 오른쪽은 읽지도 않는다.

   2) 새로 온 사람은 '면접 안 함'으로 들어온다(roles 비어 있음).
      155명을 전부 면접관으로 세우면 면접관 고르는 목록이 155줄이 된다.
      Greenhouse 는 Basic, Ashby 는 Limited Access 로 넣고 채용 역할은
      ATS 안에서 따로 준다. 같은 방식이다.

   3) 퇴사자는 지우지 않고 잠근다(active=false).
      지우면 그 사람이 봤던 과거 면접 기록에서 이름이 사라진다.
      복직하면 다음 동기화에서 저절로 다시 켜진다.

   4) Hire 에서 직접 만든 사람(src='hire')은 손대지 않는다.
      외부 면접관·자문처럼 TalentCore 에 없는 사람이 여기 산다.

   DB 미설정이면 조용히 아무 일도 안 한다(앱은 샘플 13명 그대로).
   ========================================================= */
import { serverClient } from './supabase'
import { fetchDirectory, coreState, type CorePerson } from './core'

export interface SyncReport {
  ok: boolean
  reason?: 'not-configured' | 'core-not-configured' | 'unauthorized' | 'unreachable' | 'bad-response'
  detail?: string
  asOf?: string
  read?: number          // TalentCore 가 준 사람 수
  added?: number         // Hire 에 새로 생긴 사람
  updated?: number       // 이름·부서 등이 바뀌어 고쳐 쓴 사람
  deactivated?: number   // 퇴사 처리된 사람
  reactivated?: number   // 복직 처리된 사람
  skipped?: number       // Hire 가 직접 만든 사람 — 건드리지 않음
}

/* 사번 → 사람 id. 사번은 TC-00001 처럼 생겼고 id 는 짧은 편이 낫다. */
function idFor(empNo: string, email: string | null): string {
  const key = (empNo || email || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase()
  return 'c' + (key || Math.random().toString(36).slice(2, 10))
}

/* 직함 한 줄 — TalentCore 의 직급 이름을 그대로 쓴다.
   비어 있으면 '—' 로 두고, 리크루터가 Hire 에서 바꾸지 못하게 한다(주인이 저쪽이다). */
const titleOf = (p: CorePerson) => (p.title || '').trim() || '—'
const deptOf  = (p: CorePerson) => (p.dept  || '').trim() || '—'

export async function syncDirectory(): Promise<SyncReport> {
  if (coreState() === 'unconfigured') return { ok: false, reason: 'core-not-configured' }
  const sb = serverClient()
  if (!sb) return { ok: false, reason: 'not-configured' }

  const got = await fetchDirectory()
  if (!got.ok) return { ok: false, reason: got.reason, detail: got.detail }
  const { dir } = got

  const { data: rows, error: readErr } = await sb
    .from('people')
    .select('id, nm, tt, dept, email, emp_no, src, active, core_role, core_level')
  if (readErr) return { ok: false, reason: 'not-configured', detail: readErr.message }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const existing = (rows ?? []) as any[]
  const byEmpNo = new Map<string, any>()
  const byEmail = new Map<string, any>()
  for (const r of existing) {
    if (r.emp_no) byEmpNo.set(String(r.emp_no), r)
    if (r.email) byEmail.set(String(r.email).trim().toLowerCase(), r)
  }

  const now = new Date().toISOString()
  const inserts: any[] = []
  const updates: { id: string; patch: any }[] = []
  const seen = new Set<string>()
  let added = 0, updated = 0, reactivated = 0, deact = 0

  for (const p of dir.people) {
    const email = (p.email || '').trim().toLowerCase() || null
    /* 사번이 먼저다. 사번이 없거나 처음 보는 사번이면 메일로 이어 붙인다 —
       Hire 에서 먼저 만들어 둔 사람이 TalentCore 직원이었던 경우를 흡수한다. */
    const hit = (p.emp_no && byEmpNo.get(p.emp_no)) || (email && byEmail.get(email)) || null

    if (!hit) {
      const id = idFor(p.emp_no, email)
      if (seen.has(id)) continue
      seen.add(id)
      inserts.push({
        id,
        nm: p.name, tt: titleOf(p), dept: deptOf(p), email,
        emp_no: p.emp_no || null, src: 'core', active: p.active,
        core_role: p.role, core_level: p.level ?? null, synced_at: now,
        /* ↓ 여기부터는 Hire 것이다. 처음 한 번만 기본값을 놓고 다시는 안 건드린다. */
        roles: [],            // 면접 안 함 — 리크루터가 Hire 에서 켠다
        ea: false, ch: 'email', sla: 24, resp: '—',
      })
      added++
      continue
    }

    seen.add(hit.id)
    if (hit.src === 'hire') continue   // Hire 가 만든 사람 — 규칙 4

    const patch: any = {}
    if (hit.nm !== p.name) patch.nm = p.name
    if (hit.tt !== titleOf(p)) patch.tt = titleOf(p)
    if (hit.dept !== deptOf(p)) patch.dept = deptOf(p)
    if ((hit.email || null) !== email) patch.email = email
    if ((hit.emp_no || null) !== (p.emp_no || null)) patch.emp_no = p.emp_no || null
    if (hit.core_role !== p.role) patch.core_role = p.role
    if ((hit.core_level ?? null) !== (p.level ?? null)) patch.core_level = p.level ?? null
    if (hit.active !== p.active) { patch.active = p.active; if (p.active) reactivated++; else deact++ }
    if (hit.src !== 'core') patch.src = 'core'

    /* '재직 여부만 바뀐 사람'을 갱신 숫자에 같이 넣으면 화면에 두 번 세어진다.
       퇴사/복직은 아래 자기 칸에서만 센다. */
    if (Object.keys(patch).some(k => k !== 'active')) updated++
    updates.push({ id: hit.id, patch: { ...patch, synced_at: now } })
  }

  /* 명부에서 사라진 사람 — TalentCore 에서 온 사람만 잠근다.
     '전원 + active 플래그'로 받으므로 여기 걸리는 건 계정 삭제뿐이라
     실제로는 거의 안 걸린다. 걸려도 지우지 않고 잠그기만 한다. */
  const gone = existing.filter(r => r.src === 'core' && !seen.has(r.id) && r.active !== false)
  const skipped = existing.filter(r => r.src !== 'core').length

  const fail = (e: { message: string }) => ({ ok: false as const, reason: 'bad-response' as const, detail: e.message })

  if (inserts.length) {
    const { error } = await sb.from('people').insert(inserts)
    if (error) return fail(error)
  }
  for (const u of updates) {
    const { error } = await sb.from('people').update(u.patch).eq('id', u.id)
    if (error) return fail(error)
  }
  if (gone.length) {
    const { error } = await sb.from('people')
      .update({ active: false, synced_at: now })
      .in('id', gone.map(r => r.id))
    if (error) return fail(error)
  }

  return {
    ok: true,
    asOf: dir.as_of,
    read: dir.people.length,
    added, updated, deactivated: deact + gone.length, reactivated, skipped,
  }
}

/** 마지막으로 맞춘 시각. 한 명도 동기화된 적 없으면 null. */
export async function lastSyncedAt(): Promise<string | null> {
  const sb = serverClient()
  if (!sb) return null
  const { data, error } = await sb
    .from('people')
    .select('synced_at')
    .not('synced_at', 'is', null)
    .order('synced_at', { ascending: false })
    .limit(1)
  if (error || !data?.length) return null
  return (data[0] as { synced_at: string }).synced_at
}

/** 하루 지났으면 조용히 한 번 맞춘다. 화면을 열 때 부르는 용도 —
    실패해도 화면은 그냥 뜬다(명부는 어제 값이라도 쓸 수 있다). */
export async function maybeSync(maxAgeHours = 24): Promise<SyncReport | null> {
  if (coreState() === 'unconfigured') return null
  const last = await lastSyncedAt()
  if (last && Date.now() - new Date(last).getTime() < maxAgeHours * 3600_000) return null
  try { return await syncDirectory() } catch { return null }
}
