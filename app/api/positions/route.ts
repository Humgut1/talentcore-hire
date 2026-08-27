import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('positions')
    .select(`
      id, title, division, headquarter, department,
      employment_type, status, interview_mode, video_platform, opened_at,
      recruiter:users!positions_recruiter_id_fkey(id, name),
      hiring_manager:users!positions_hiring_manager_id_fkey(id, name)
    `)
    .order('opened_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ positions: data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const {
    title,
    division,
    headquarter,
    department,
    employment_type,
    recruiter_id,
    hiring_manager_id,
    interview_mode,
    video_platform,
  } = body

  if (!title) {
    return NextResponse.json({ error: '포지션명은 필수입니다.', code: 'MISSING_TITLE' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('positions')
    .insert({
      title,
      division: division || null,
      headquarter: headquarter || null,
      department: department || null,
      employment_type: employment_type ?? 'full_time',
      recruiter_id: recruiter_id || null,
      hiring_manager_id: hiring_manager_id || null,
      interview_mode: interview_mode ?? 'video',
      video_platform: video_platform ?? 'google_meet',
    })
    .select('id, title, status')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
