import { createClient } from '@/lib/supabase/server'
import { generateOfferEmail } from '@/lib/email/templates/offer'
import { Resend } from 'resend'
import { NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

// action: 'send' | 'accept' | 'reject' | 'withdraw'
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const { action, offered_salary } = await request.json()

  if (!['send', 'accept', 'reject', 'withdraw'].includes(action)) {
    return NextResponse.json({ error: '유효하지 않은 action입니다.' }, { status: 400 })
  }

  const { data: application, error: appError } = await supabase
    .from('applications')
    .select(`
      id, status, offer_status,
      candidate:candidates(id, name, email),
      position:positions(id, title)
    `)
    .eq('id', id)
    .single()

  if (appError || !application) {
    return NextResponse.json({ error: '지원 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const candidate = application.candidate as { id: string; name: string; email: string } | null
  const position = application.position as { id: string; title: string } | null
  const now = new Date().toISOString()

  if (action === 'send') {
    if (!['interview2_pass'].includes(application.status)) {
      return NextResponse.json({ error: '2차 면접 합격 상태에서만 오퍼를 발송할 수 있습니다.' }, { status: 400 })
    }

    await supabase.from('applications').update({
      status: 'offered',
      offer_status: 'pending',
      offered_salary: offered_salary || null,
      offer_sent_at: now,
    }).eq('id', id)

    let emailSent = false
    if (candidate && position) {
      const { subject, html } = generateOfferEmail({
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        positionTitle: position.title,
        offeredSalary: offered_salary || null,
        appUrl: process.env.NEXT_PUBLIC_APP_URL!,
      })
      const { error: emailError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL!,
        to: candidate.email,
        subject,
        html,
      })
      emailSent = !emailError
    }

    return NextResponse.json({ id, status: 'offered', offer_status: 'pending', email_sent: emailSent })
  }

  if (action === 'accept') {
    await supabase.from('applications').update({
      status: 'hired',
      offer_status: 'accepted',
      offer_responded_at: now,
    }).eq('id', id)
    return NextResponse.json({ id, status: 'hired', offer_status: 'accepted' })
  }

  if (action === 'reject') {
    await supabase.from('applications').update({
      status: 'rejected',
      offer_status: 'rejected',
      offer_responded_at: now,
    }).eq('id', id)
    return NextResponse.json({ id, status: 'rejected', offer_status: 'rejected' })
  }

  if (action === 'withdraw') {
    await supabase.from('applications').update({
      offer_status: 'withdrawn',
      offer_responded_at: now,
    }).eq('id', id)
    return NextResponse.json({ id, offer_status: 'withdrawn' })
  }
}
