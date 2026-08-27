import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// 면접관 목록 조회
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('interview_interviewers')
    .select(`
      id, is_required, slot_response,
      user:users!interview_interviewers_interviewer_id_fkey(id, name, email, role)
    `)
    .eq('interview_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ interviewers: data })
}

// 면접관 배정
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: interviewId } = await params
  const { user_id } = await request.json()

  if (!user_id) {
    return NextResponse.json({ error: 'user_id가 필요합니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('interview_interviewers')
    .insert({
      interview_id: interviewId,
      interviewer_id: user_id,
      is_required: true,
      slot_response: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 배정된 면접관입니다.', code: 'DUPLICATE' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}

// 면접관 제거
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: interviewId } = await params
  const { user_id } = await request.json()

  const { error } = await supabase
    .from('interview_interviewers')
    .delete()
    .eq('interview_id', interviewId)
    .eq('interviewer_id', user_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
