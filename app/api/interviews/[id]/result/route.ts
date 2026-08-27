import { createClient } from '@/lib/supabase/server'
import { generateRejectionEmail } from '@/lib/email/templates/rejection'
import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const body = await request.json()
  const { result, result_note } = body

  if (!['pass', 'fail', 'hold'].includes(result)) {
    return NextResponse.json(
      { error: 'result는 pass, fail, hold 중 하나여야 합니다.', code: 'INVALID_RESULT' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()

  const { data: interview, error: interviewError } = await supabase
    .from('interviews')
    .select(`
      id, round,
      application:applications(
        id, status,
        candidate:candidates(id, name, email),
        position:positions(
          id, title,
          recruiter:users!positions_recruiter_id_fkey(id, name, email)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (interviewError || !interview) {
    return NextResponse.json({ error: '인터뷰 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  await supabase
    .from('interviews')
    .update({ result, result_note: result_note || null, result_at: now })
    .eq('id', id)

  const application = interview.application as {
    id: string
    status: string
    candidate: { id: string; name: string; email: string }
    position: {
      id: string
      title: string
      recruiter: { id: string; name: string; email: string } | null
    }
  } | null

  if (!application) {
    return NextResponse.json({ interview_id: id, result, result_at: now, next_step: 'done' })
  }

  const { candidate, position } = application
  let nextStep = 'done'
  let emailSent = false

  if (result === 'pass' && interview.round === 1) {
    await supabase.from('applications').update({ status: 'interview1_pass' }).eq('id', application.id)

    const { data: newInterview } = await supabase
      .from('interviews')
      .insert({ application_id: application.id, round: 2, status: 'pending_slots', duration_minutes: 60 })
      .select('id')
      .single()

    nextStep = 'interview2_scheduling_triggered'

    const recruiter = position.recruiter
    if (recruiter) {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: recruiter.email,
        subject: `[2차 면접 준비] ${position.title} — ${candidate.name}`,
        html: `
<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f6f9ff;font-family:'Apple SD Gothic Neo',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:24px;padding:40px;box-shadow:0 4px 40px rgba(21,28,35,0.06);">
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#151c23;">2차 면접 준비가 필요합니다</h1>
    <p style="font-size:14px;color:#4a5a6a;line-height:1.8;">
      <strong style="color:#151c23;">${candidate.name}</strong> 후보자가 <strong style="color:#151c23;">${position.title}</strong> 포지션 1차 면접을 통과했습니다.<br>
      2차 면접 슬롯 제안을 준비해 주세요.
    </p>
    <div style="background:#edf4fe;border-radius:16px;padding:20px;margin-top:24px;">
      <p style="margin:0;font-size:13px;color:#4a5a6a;">2차 인터뷰 ID: <strong style="color:#151c23;">${newInterview?.id ?? ''}</strong></p>
    </div>
  </div>
</body></html>`,
      })
    }

  } else if (result === 'pass' && interview.round === 2) {
    await supabase.from('applications').update({ status: 'interview2_pass' }).eq('id', application.id)
    nextStep = 'offer_stage'

  } else if (result === 'fail') {
    const failStatus = interview.round === 1 ? 'interview1_fail' : 'interview2_fail'
    await supabase.from('applications').update({ status: failStatus }).eq('id', application.id)
    nextStep = `${failStatus}_recorded`

    // 불합격 이메일 발송
    const { subject, html } = generateRejectionEmail({
      candidateName: candidate.name,
      positionTitle: position.title,
      stage: 'interview',
    })
    const { error: emailError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: candidate.email,
      subject,
      html,
    })
    emailSent = !emailError
  }

  return NextResponse.json({ interview_id: id, result, result_at: now, next_step: nextStep, email_sent: emailSent })
}
