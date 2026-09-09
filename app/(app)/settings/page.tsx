import Screen from '../../components/Screen'
import { hydrateData } from '../../lib/db'
import { settingsHTML } from '../../lib/render'
import { googleStatus } from '../../lib/google'
import { mailerStatus } from '../../lib/mailer'
import { inboundState } from '../../lib/inbound'

export default async function Page({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  await hydrateData()
  const { google } = await searchParams
  const gs = await googleStatus()
  const ms = await mailerStatus()
  return <Screen html={settingsHTML(gs, google, ms, inboundState())} />
}
