/* 사용자 · 권한 (H2) — TalentCore 계정으로 들어온 사람을 승인하고 역할을 준다. */
import UsersAdmin from '../../../components/UsersAdmin'
import { hydrateData } from '../../../lib/db'
import { people } from '../../../lib/data'
import { listUsers } from '../../../lib/users'
import { currentSession, canManageUsers } from '../../../lib/session'

export default async function Page() {
  await hydrateData()
  const s = await currentSession()
  const allowed = canManageUsers(s) || s?.role === 'demo'
  const r = allowed ? await listUsers() : null
  return (
    <UsersAdmin
      allowed={allowed}
      readOnly={s?.role === 'demo'}
      state={!r ? 'ok' : r.ok ? 'ok' : r.reason}
      users={r && r.ok ? r.users : []}
      people={people.filter(p => p.active !== false).map(p => ({ id: p.id, nm: p.nm, dept: p.dept }))}
      selfId={s?.uid ?? null}
    />
  )
}
