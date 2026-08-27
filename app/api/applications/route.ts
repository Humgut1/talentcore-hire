import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const position_id = searchParams.get('position_id')
  const status = searchParams.get('status')

  let query = supabase
    .from('applications')
    .select(`
      id, status, applied_at,
      candidate:candidates(id, name, email, phone, resume_url),
      position:positions(id, title)
    `)
    .order('applied_at', { ascending: false })

  if (position_id) {
    query = query.eq('position_id', position_id)
  }
  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ applications: data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const {
    candidate_id,
    position_id,
    source_category,
    source_detail,
    utm_source,
    utm_medium,
    utm_campaign,
  } = body

  if (!candidate_id || !position_id) {
    return NextResponse.json(
      { error: 'candidate_id와 position_id는 필수입니다.', code: 'MISSING_FIELDS' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('applications')
    .insert({
      candidate_id,
      position_id,
      source_category: source_category || null,
      source_detail: source_detail || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
    })
    .select('id, status, applied_at')
    .single()

  if (error) {
    // unique 제약 위반 — 이미 해당 포지션에 지원한 경우
    if (error.code === '23505') {
      return NextResponse.json(
        { error: '이미 해당 포지션에 지원한 후보자입니다.', code: 'DUPLICATE_APPLICATION' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
