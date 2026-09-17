import Screen from '../../components/Screen'
import { hydrateData } from '../../lib/db'
import { settingsHTML } from '../../lib/render'
import { googleStatus } from '../../lib/google'
import { mailerStatus } from '../../lib/mailer'
import { inboundState } from '../../lib/inbound'
import { listUsers } from '../../lib/users'
import { currentSession, canManageUsers } from '../../lib/session'

export default async function Page({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  await hydrateData()
  const { google } = await searchParams
  const gs = await googleStatus()
  const ms = await mailerStatus()
  const s = await currentSession()
  const ul = canManageUsers(s) || s?.role === 'demo' ? await listUsers() : null
  const users = ul && ul.ok
    ? { pending: ul.users.filter(u => u.st === 'pending').length, active: ul.users.filter(u => u.st === 'active').length }
    : null
  return <Screen html={settingsHTML(gs, google, ms, inboundState(), users)} />
}
