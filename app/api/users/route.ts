import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role')

  let query = supabase
    .from('users')
    .select('id, name, email, role, ea_flag')
    .order('name')

  if (role) {
    query = query.eq('role', role)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ users: data })
}
