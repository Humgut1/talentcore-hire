import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  let query = supabase
    .from('interviews')
    .select(`
      id, round, status, mode, scheduled_at, result, result_note, result_at, duration_minutes,
      application:applications(
        id, status,
        candidate:candidates(id, name, email),
        position:positions(id, title)
      ),
      interviewers:interview_interviewers(
        user:users!interview_interviewers_interviewer_id_fkey(id, name, email)
      )
    `)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ interviews: data })
}
