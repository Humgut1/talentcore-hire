import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json({ error: 'email 파라미터가 필요합니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('candidates')
    .select('id, name, email')
    .eq('email', email)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()

  const { name, email, phone, resume_url, sms_consent } = body

  if (!name || !email) {
    return NextResponse.json(
      { error: '이름과 이메일은 필수입니다.', code: 'MISSING_FIELDS' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('candidates')
    .insert({
      name,
      email,
      phone: phone || null,
      resume_url: resume_url || null,
      sms_consent: sms_consent ?? false,
    })
    .select('id, name, email')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
