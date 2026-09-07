/* =========================================================
   Cadence — 후보자에게 나간 연락의 기록 (서버 전용)
   ---------------------------------------------------------
   지금까지 후보자 화면의 '커뮤니케이션 로그'는 손으로 써 둔 예시였다.
   이 파일이 그 자리를 진짜 기록으로 바꾼다.

   규칙 하나: 보낸 것도, 못 보낸 것도 남긴다.
   메일 키가 없어서 안 나간 건은 ok=false 로 남고 화면에도 그렇게 보인다.
   '보낸 척'은 하지 않는다.
   ========================================================= */
import { serverClient } from './supabase'
import { sendEmail, mailerStatus } from './mailer'

export interface MailRow {
  id: string; cid: string; iid?: string
  kind: string; channel: 'email' | 'slack'
  to?: string; subject: string; body: string
  ok: boolean; reason?: string; byNm?: string
  at: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapRow = (r: any): MailRow => ({
  id: r.id, cid: r.cid,
  ...(r.iid ? { iid: r.iid } : {}),
  kind: r.kind ?? 'etc', channel: (r.channel ?? 'email') as 'email' | 'slack',
  ...(r.to_addr ? { to: r.to_addr } : {}),
  subject: r.subject ?? '', body: r.body ?? '',
  ok: !!r.ok, ...(r.reason ? { reason: r.reason } : {}),
  ...(r.by_nm ? { byNm: r.by_nm } : {}),
  at: r.created_at,
})

/** 이 후보자에게 나간 연락 — 최근 것부터. 표가 없으면 빈 배열. */
export async function mailsOf(cid: string, limit = 50): Promise<MailRow[]> {
  const sb = serverClient()
  if (!sb) return []
  const { data, error } = await sb.from('mail_log')
    .select('*').eq('cid', cid).order('created_at', { ascending: false }).limit(limit)
  if (error || !data) return []
  return data.map(mapRow)
}

/** 기록만 남긴다(발송은 부르는 쪽에서 이미 했다). */
export async function logMail(a: {
  cid: string; iid?: string; kind: string
  channel?: 'email' | 'slack'
  to?: string; subject: string; body: string
  ok: boolean; reason?: string; byNm?: string
}): Promise<void> {
  const sb = serverClient()
  if (!sb) return
  await sb.from('mail_log').insert({
    cid: a.cid, iid: a.iid ?? null, kind: a.kind,
    channel: a.channel ?? 'email', to_addr: a.to ?? null,
    subject: a.subject, body: a.body,
    ok: a.ok, reason: a.reason ?? null, by_nm: a.byNm ?? null,
  })
}

/** 보내고 + 기록까지. 후보자에게 나가는 메일은 전부 이 문을 지난다. */
export async function sendCandMail(a: {
  cid: string; iid?: string; kind: string
  to?: string; subject: string; body: string; byNm?: string
}): Promise<{ ok: boolean; reason?: string }> {
  const st = mailerStatus()
  if (!st.email) {
    await logMail({ ...a, ok: false, reason: 'not-configured' })
    return { ok: false, reason: 'not-configured' }
  }
  const r = await sendEmail(a.to, a.subject, a.body)
  await logMail({
    ...a, ok: r.ok,
    ...(r.to ? { to: r.to } : {}),
    ...(r.reason ? { reason: r.reason } : {}),
  })
  return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? 'unknown' }
}
