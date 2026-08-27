import { createClient } from '@/lib/supabase/server'
import { generateRejectionEmail } from '@/lib/email/templates/rejection'
import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const body = await request.json()
  const { status, note } = body

  if (!['doc_pass', 'doc_fail'].includes(status)) {
    return NextResponse.json(
      { error: 'status는 doc_pass 또는 doc_fail만 허용됩니다.', code: 'INVALID_STATUS' },
      { status: 400 }
    )
  }

  const { data: application, error: appError } = await supabase
    .from('applications')
    .select(`
      id, status,
      candidate:candidates(id, name, email),
      position:positions(id, title, hiring_manager_id, interview_mode)
    `)
    .eq('id', id)
    .single()

  if (appError || !application) {
    return NextResponse.json({ error: '지원 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const candidate = application.candidate as { id: string; name: string; email: string } | null
  const position = application.position as {
    id: string; title: string; hiring_manager_id: string | null; interview_mode: string
  } | null

  if (status === 'doc_pass') {
    const { error: updateError } = await supabase
      .from('applications')
      .update({ status: 'doc_pass', doc_pass_at: now })
      .eq('id', id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    const { data: interview, error: interviewError } = await supabase
      .from('interviews')
      .insert({
        application_id: id,
        round: 1,
        status: 'pending_slots',
        duration_minutes: 60,
        mode: position?.interview_mode ?? 'video',
      })
      .select('id')
      .single()

    if (interviewError) return NextResponse.json({ error: interviewError.message }, { status: 500 })

    if (position?.hiring_manager_id && interview) {
      await supabase.from('interview_interviewers').insert({
        interview_id: interview.id,
        interviewer_id: position.hiring_manager_id,
        is_required: true,
        slot_response: 'pending',
      })
    }

    return NextResponse.json({
      id, status: 'doc_pass', doc_pass_at: now,
      scheduling_triggered: true, interview_id: interview?.id ?? null,
    })
  }

  // doc_fail 처리 + 불합격 이메일
  const { error: updateError } = await supabase
    .from('applications')
    .update({ status: 'doc_fail', doc_fail_at: now })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  let emailSent = false
  if (candidate && position) {
    const { subject, html } = generateRejectionEmail({
      candidateName: candidate.name,
      positionTitle: position.title,
      stage: 'doc',
    })
    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: candidate.email,
      subject,
      html,
    })
    emailSent = !emailError
  }

  return NextResponse.json({ id, status: 'doc_fail', doc_fail_at: now, email_sent: emailSent })
}
