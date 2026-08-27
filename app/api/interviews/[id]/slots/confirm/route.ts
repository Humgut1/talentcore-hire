import { createClient } from '@/lib/supabase/server'
import {
  generateCandidateConfirmedEmail,
  generateInterviewerConfirmedEmail,
} from '@/lib/email/templates/interview-confirmed'
import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/interview-confirmed?error=missing_token`
    )
  }

  // 토큰으로 슬롯 조회
  const { data: slot, error: slotError } = await supabase
    .from('interview_slots')
    .select('id, interview_id, slot_time, is_selected, expires_at')
    .eq('token', token)
    .single()

  if (slotError || !slot) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/interview-confirmed?error=invalid_token`
    )
  }

  // 만료 확인
  if (new Date(slot.expires_at) < new Date()) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/interview-confirmed?error=expired`
    )
  }

  // 이미 확정된 경우
  if (slot.is_selected) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/interview-confirmed?already=true`
    )
  }

  // 인터뷰 정보 조회
  const { data: interview, error: interviewError } = await supabase
    .from('interviews')
    .select(`
      id, round, duration_minutes,
      application:applications(
        id,
        candidate:candidates(id, name, email, resume_url),
        position:positions(id, title)
      ),
      interviewers:interview_interviewers(
        id,
        interviewer_id,
        user:users!interview_interviewers_interviewer_id_fkey(id, name, email)
      )
    `)
    .eq('id', id)
    .single()

  if (interviewError || !interview) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/interview-confirmed?error=not_found`
    )
  }

  const application = interview.application as {
    id: string
    candidate: { id: string; name: string; email: string; resume_url: string | null }
    position: { id: string; title: string }
  } | null

  const interviewerRecord = (interview.interviewers as {
    id: string
    interviewer_id: string
    user: { id: string; name: string; email: string }
  }[])?.[0]

  if (!application || !interviewerRecord) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/interview-confirmed?error=missing_data`
    )
  }

  const now = new Date().toISOString()
  const scheduledAt = slot.slot_time
  const applicationStatusField =
    interview.round === 1 ? 'interview1_scheduled' : 'interview2_scheduled'

  // 트랜잭션 처리 (순차 업데이트)
  await supabase.from('interview_slots').update({ is_selected: true }).eq('id', slot.id)
  await supabase.from('interviews').update({ scheduled_at: scheduledAt, status: 'scheduled' }).eq('id', id)
  await supabase.from('applications').update({ status: applicationStatusField }).eq('id', application.id)
  await supabase
    .from('interview_interviewers')
    .update({ slot_response: 'accepted', responded_at: now })
    .eq('id', interviewerRecord.id)

  // 후보자 확정 이메일
  const { subject: candidateSubject, html: candidateHtml } = generateCandidateConfirmedEmail({
    positionTitle: application.position.title,
    candidateName: application.candidate.name,
    interviewerName: interviewerRecord.user.name,
    scheduledAt,
    durationMinutes: interview.duration_minutes,
  })

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: application.candidate.email,
    subject: candidateSubject,
    html: candidateHtml,
  })

  // 면접관 확정 이메일
  const { subject: interviewerSubject, html: interviewerHtml } = generateInterviewerConfirmedEmail({
    positionTitle: application.position.title,
    candidateName: application.candidate.name,
    interviewerName: interviewerRecord.user.name,
    scheduledAt,
    durationMinutes: interview.duration_minutes,
    resumeUrl: application.candidate.resume_url,
  })

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: interviewerRecord.user.email,
    subject: interviewerSubject,
    html: interviewerHtml,
  })

  const scheduledAtEncoded = encodeURIComponent(scheduledAt)
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/interview-confirmed?scheduled_at=${scheduledAtEncoded}`
  )
}
