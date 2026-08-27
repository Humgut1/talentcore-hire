import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('positions')
    .select(`
      id, title, division, headquarter, department,
      employment_type, status, interview_mode, video_platform,
      description, requirements, application_deadline, is_published,
      opened_at, closed_at,
      recruiter:users!positions_recruiter_id_fkey(id, name, email),
      hiring_manager:users!positions_hiring_manager_id_fkey(id, name, email)
    `)
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  const { count } = await supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .eq('position_id', id)

  return NextResponse.json({ ...data, application_count: count ?? 0 })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const body = await request.json()

  const allowed = [
    'title', 'status', 'description', 'requirements',
    'application_deadline', 'is_published',
    'employment_type', 'interview_mode',
    'recruiter_id', 'hiring_manager_id',
  ]

  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  )

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 })
  }

  // 공개 전환 시 마감일 체크
  if (updates.is_published === true) {
    const { data: pos } = await supabase
      .from('positions')
      .select('application_deadline')
      .eq('id', id)
      .single()

    const deadline = updates.application_deadline ?? pos?.application_deadline
    if (!deadline) {
      return NextResponse.json(
        { error: '공개하려면 지원 마감일을 먼저 설정해주세요.', code: 'MISSING_DEADLINE' },
        { status: 400 }
      )
    }
  }

  const { data, error } = await supabase
    .from('positions')
    .update(updates)
    .eq('id', id)
    .select('id, title, status, is_published, application_deadline')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
