/* =========================================================
   Cadence — 실제 발송 (이메일 · Slack) · 서버 전용
   ---------------------------------------------------------
   리마인드 엔진(reminders.ts)은 "언제 무엇을 보낼지"만 계산한다.
   이 파일은 그걸 실제로 내보내는 배관층이다. 둘을 섞지 않는다.

   상태 3단계 (google.ts 와 같은 규칙):
     · unconfigured : 키 없음        → 화면에는 계속 시뮬레이션으로 표시
     · configured   : 키 있음        → 실제 발송
   채널:
     · 이메일 → Gmail (연결된 구글 계정) 우선, 없으면 Resend (RESEND_API_KEY)
       Gmail 을 먼저 보는 이유: 회사 도메인 인증 없이 바로 보낼 수 있고,
       보낸 편지함에 남아 후보자 회신이 담당자 메일함으로 그대로 들어온다.
     · Slack  → Incoming Webhook (SLACK_WEBHOOK_URL)

   ⚠️ 안전장치 (실수로 진짜 사람에게 보내지 않기 위해)
     · REMINDER_TEST_TO 가 설정돼 있으면 수신자를 전부 그 주소로 덮어쓴다.
       (데모 데이터에는 실제 이메일이 없으므로 기본값이 이 경로다)
     · 그것마저 없으면 보내지 않고 'no-recipient' 로 건너뛴다.
     · 키는 전부 .env.local 에만 둔다. 절대 커밋하지 않는다.

   ⚠️ 이 파일은 서버에서만 import 한다(시크릿 사용).
   ========================================================= */

import { gmailReady, gmailAddress, gmailSend } from './google'

export type MailerState = 'unconfigured' | 'configured'
export interface MailerStatus {
  state: MailerState
  email: boolean          // 이메일 발송 가능
  slack: boolean          // Slack 발송 가능
  from?: string           // 발신 주소
  testTo?: string         // 안전장치로 덮어쓸 수신 주소
  via?: 'gmail' | 'resend'  // 실제로 어느 길로 나가는지
}

export interface SendResult {
  ok: boolean
  channel: 'email' | 'slack'
  to?: string
  reason?: string
}

const FROM = () => process.env.REMINDER_FROM || 'Cadence <onboarding@resend.dev>'

export function mailerStatus(): MailerStatus {
  const gmail = gmailReady()
  const email = gmail || Boolean(process.env.RESEND_API_KEY)
  const slack = Boolean(process.env.SLACK_WEBHOOK_URL)
  const from = gmail ? (gmailAddress() ?? 'Gmail 계정') : process.env.RESEND_API_KEY ? FROM() : undefined
  return {
    state: email || slack ? 'configured' : 'unconfigured',
    email, slack,
    ...(from ? { from } : {}),
    ...(email ? { via: gmail ? 'gmail' as const : 'resend' as const } : {}),
    ...(process.env.REMINDER_TEST_TO ? { testTo: process.env.REMINDER_TEST_TO } : {}),
  }
}

/** 실제 수신 주소를 정한다. 테스트 주소가 있으면 무조건 그쪽으로 돌린다. */
function resolveTo(intended?: string): string | null {
  return process.env.REMINDER_TEST_TO || intended || null
}

/* ---------------------------------------------------------
   이메일 — Resend REST API
   --------------------------------------------------------- */
export async function sendEmail(
  to: string | undefined, subject: string, text: string,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  const gmail = gmailReady()
  if (!gmail && !key) return { ok: false, channel: 'email', reason: 'not-configured' }
  const addr = resolveTo(to)
  if (!addr) return { ok: false, channel: 'email', reason: 'no-recipient' }

  /* Gmail 이 연결돼 있으면 그쪽이 먼저다. 실패하면 Resend 로 다시 시도하지 않는다 —
     같은 메일이 두 번 나가는 것보다 한 번 실패하고 기록에 남는 편이 낫다. */
  if (gmail) {
    const r = await gmailSend(addr, subject, text, process.env.REMINDER_FROM_NAME || 'TalentCore 채용팀')
    return r.ok
      ? { ok: true, channel: 'email', to: addr }
      : { ok: false, channel: 'email', to: addr, reason: r.reason }
  }
  if (!key) return { ok: false, channel: 'email', to: addr, reason: 'not-configured' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [addr], subject, text }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, channel: 'email', to: addr, reason: `${res.status} ${body.slice(0, 160)}` }
    }
    return { ok: true, channel: 'email', to: addr }
  } catch (e) {
    return { ok: false, channel: 'email', to: addr, reason: String(e).slice(0, 160) }
  }
}

/* ---------------------------------------------------------
   Slack — Incoming Webhook
   개인 DM 이 아니라 웹훅이 걸린 채널로 간다. 그래서 본문에
   "누구에게 가는 알림인지"를 반드시 적는다.
   --------------------------------------------------------- */
export async function sendSlack(text: string): Promise<SendResult> {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return { ok: false, channel: 'slack', reason: 'not-configured' }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, channel: 'slack', reason: `${res.status} ${body.slice(0, 160)}` }
    }
    return { ok: true, channel: 'slack' }
  } catch (e) {
    return { ok: false, channel: 'slack', reason: String(e).slice(0, 160) }
  }
}

/* ---------------------------------------------------------
   리마인드 문안
   면접관용과 후보자용은 목적이 다르다.
     · 면접관 : 준비하라 + 평가지 링크
     · 후보자 : 시간·방식 재확인 + 못 오면 알려달라
   --------------------------------------------------------- */
export interface ReminderMessage { subject: string; text: string }

export function interviewerMessage(a: {
  ivName: string; candName: string; candRole?: string
  stageName: string; when: string; dur: number; mode: string
  offsetLabel: string; link?: string
}): ReminderMessage {
  return {
    subject: `[면접 ${a.offsetLabel}] ${a.candName} 님 · ${a.stageName}`,
    text: [
      `${a.ivName} 님, 면접 ${a.offsetLabel} 안내드립니다.`,
      '',
      `· 후보자 : ${a.candName}${a.candRole ? ` (${a.candRole})` : ''}`,
      `· 단계   : ${a.stageName}`,
      `· 시간   : ${a.when} · ${a.dur}분 · ${a.mode}`,
      ...(a.link ? ['', `면접 상세와 평가지: ${a.link}`] : []),
      '',
      '— Cadence',
    ].join('\n'),
  }
}

export function candidateMessage(a: {
  candName: string; positionTitle: string
  stageName: string; when: string; dur: number; mode: string
  offsetLabel: string; recruiter?: string
}): ReminderMessage {
  return {
    subject: `[면접 ${a.offsetLabel}] ${a.positionTitle} · ${a.stageName}`,
    text: [
      `${a.candName} 님, 안녕하세요. ${a.positionTitle} 면접 ${a.offsetLabel} 안내드립니다.`,
      '',
      `· 단계 : ${a.stageName}`,
      `· 시간 : ${a.when} · ${a.dur}분 · ${a.mode}`,
      '',
      `일정 변경이 필요하시면 이 메일에 회신해 주세요.${a.recruiter ? ` (담당 ${a.recruiter})` : ''}`,
      '',
      '— Cadence',
    ].join('\n'),
  }
}
