import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from('interview_scorecards')
    .select(`
      id, overall_rating, strengths, concerns, recommendation, notes, submitted_at,
      interviewer:users!interview_scorecards_interviewer_id_fkey(id, name)
    `)
    .eq('interview_id', id)
    .order('submitted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ scorecards: data })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: interviewId } = await params
  const { interviewer_id, overall_rating, strengths, concerns, recommendation, notes } = await request.json()

  if (!interviewer_id) {
    return NextResponse.json({ error: 'interviewer_id가 필요합니다.' }, { status: 400 })
  }
  if (!recommendation || !['strong_yes', 'yes', 'no', 'strong_no'].includes(recommendation)) {
    return NextResponse.json({ error: '최종 의견을 선택해주세요.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('interview_scorecards')
    .upsert({
      interview_id: interviewId,
      interviewer_id,
      overall_rating: overall_rating ?? null,
      strengths: strengths || null,
      concerns: concerns || null,
      recommendation,
      notes: notes || null,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'interview_id,interviewer_id' })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
