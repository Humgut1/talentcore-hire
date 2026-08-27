import { createClient } from '@/lib/supabase/server'
import { generateSlotRequestEmail } from '@/lib/email/templates/slot-request'
import { Resend } from 'resend'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const body = await request.json()
  const { slots } = body as { slots: string[] }

  if (!slots || slots.length === 0) {
    return NextResponse.json({ error: '슬롯을 1개 이상 입력해주세요.', code: 'MISSING_SLOTS' }, { status: 400 })
  }

  // 인터뷰 정보 + 면접관 + 후보자 + 포지션 조회
  const { data: interview, error: interviewError } = await supabase
    .from('interviews')
    .select(`
      id, round, mode,
      application:applications(
        id,
        candidate:candidates(id, name, email),
        position:positions(id, title, interview_mode)
      ),
      interviewers:interview_interviewers(
        interviewer_id,
        user:users!interview_interviewers_interviewer_id_fkey(id, name, email)
      )
    `)
    .eq('id', id)
    .single()

  if (interviewError || !interview) {
    return NextResponse.json({ error: '인터뷰 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const application = interview.application as {
    id: string
    candidate: { id: string; name: string; email: string }
    position: { id: string; title: string }
  } | null

  const interviewerRecord = (interview.interviewers as {
    interviewer_id: string
    user: { id: string; name: string; email: string }
  }[])?.[0]

  if (!application || !interviewerRecord) {
    return NextResponse.json({ error: '면접관 또는 지원 정보가 없습니다.' }, { status: 400 })
  }

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()

  // 슬롯 저장
  const slotRecords = slots.map((slotTime) => ({
    interview_id: id,
    slot_time: slotTime,
    token: crypto.randomBytes(32).toString('hex'),
    is_selected: false,
    expires_at: expiresAt,
  }))

  const { error: slotError } = await supabase.from('interview_slots').insert(slotRecords)

  if (slotError) {
    return NextResponse.json({ error: slotError.message }, { status: 500 })
  }

  // 인터뷰 status 업데이트
  await supabase.from('interviews').update({ status: 'slot_requested' }).eq('id', id)

  // 이메일 발송
  const { subject, html } = generateSlotRequestEmail({
    interviewId: id,
    positionTitle: application.position.title,
    candidateName: application.candidate.name,
    interviewerName: interviewerRecord.user.name,
    slots: slotRecords.map((s) => ({ slotTime: s.slot_time, token: s.token })),
    appUrl: process.env.NEXT_PUBLIC_APP_URL!,
  })

  const { error: emailError } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: interviewerRecord.user.email,
    subject,
    html,
  })

  return NextResponse.json({
    interview_id: id,
    slots_sent: slots.length,
    email_sent_to: interviewerRecord.user.email,
    email_sent: !emailError,
    expires_at: expiresAt,
  })
}
