import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: positionId } = await params
  const body = await request.json()
  const { name, email, phone, resume_url } = body

  if (!name || !email) {
    return NextResponse.json(
      { error: '이름과 이메일은 필수입니다.', code: 'MISSING_FIELDS' },
      { status: 400 }
    )
  }

  // 포지션 유효성 확인 (공개·오픈·마감일 체크)
  const { data: position, error: posError } = await supabase
    .from('positions')
    .select('id, status, is_published, application_deadline, title')
    .eq('id', positionId)
    .single()

  if (posError || !position) {
    return NextResponse.json({ error: '존재하지 않는 채용 공고입니다.', code: 'NOT_FOUND' }, { status: 404 })
  }
  if (!position.is_published || position.status !== 'open') {
    return NextResponse.json({ error: '지원이 마감된 공고입니다.', code: 'CLOSED' }, { status: 410 })
  }
  if (position.application_deadline && new Date(position.application_deadline) < new Date()) {
    return NextResponse.json({ error: '지원 마감일이 지났습니다.', code: 'DEADLINE_PASSED' }, { status: 410 })
  }

  // 후보자 생성 또는 조회
  let candidateId: string

  const { data: newCandidate, error: candidateError } = await supabase
    .from('candidates')
    .insert({ name, email, phone: phone || null, resume_url: resume_url || null })
    .select('id')
    .single()

  if (candidateError) {
    if (candidateError.code === '23505') {
      // 이미 존재하는 후보자
      const { data: existing } = await supabase
        .from('candidates')
        .select('id')
        .eq('email', email)
        .single()
      if (!existing) {
        return NextResponse.json({ error: '후보자 조회 중 오류가 발생했습니다.' }, { status: 500 })
      }
      candidateId = existing.id
    } else {
      return NextResponse.json({ error: candidateError.message }, { status: 500 })
    }
  } else {
    candidateId = newCandidate.id
  }

  // 지원서 생성
  const { data: application, error: appError } = await supabase
    .from('applications')
    .insert({
      candidate_id: candidateId,
      position_id: positionId,
      source_category: 'career_page',
    })
    .select('id, status, applied_at')
    .single()

  if (appError) {
    if (appError.code === '23505') {
      return NextResponse.json(
        { error: '이미 해당 공고에 지원하셨습니다.', code: 'DUPLICATE' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: appError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    application_id: application.id,
    position_title: position.title,
    applied_at: application.applied_at,
  }, { status: 201 })
}
