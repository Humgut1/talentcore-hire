import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  open: '채용 중',
  closed: '마감',
  draft: '임시저장',
}

const STATUS_COLOR: Record<string, string> = {
  open: 'bg-[#dcfce7] text-green-700',
  closed: 'bg-[#e1e9f2] text-[#4a5a6a]',
  draft: 'bg-[#fef9c3] text-yellow-700',
}

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: '정규직',
  part_time: '파트타임',
  contract: '계약직',
  intern: '인턴',
}

export default async function PositionsPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('positions')
    .select(`
      id, title, division, headquarter, department,
      employment_type, status, opened_at,
      recruiter:users!positions_recruiter_id_fkey(id, name),
      hiring_manager:users!positions_hiring_manager_id_fkey(id, name)
    `)
    .order('opened_at', { ascending: false })

  const positions = data ?? []

  return (
    <div className="min-h-screen bg-[#f6f9ff]">
      <div className="max-w-5xl mx-auto px-6 py-10">

        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[#4a5a6a] hover:text-[#151c23] mb-8 transition-colors">
          ← 대시보드
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#151c23] tracking-tight">포지션</h1>
            <p className="text-sm text-[#4a5a6a] mt-1.5">총 {positions.length}개</p>
          </div>
          <Link
            href="/dashboard/positions/new"
            className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
          >
            + 새 포지션
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-5 py-4 rounded-2xl text-sm mb-6">
            데이터를 불러오는 중 오류가 발생했습니다.
          </div>
        )}

        {positions.length === 0 ? (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-16 text-center">
            <p className="text-[#4a5a6a] text-sm">등록된 포지션이 없습니다.</p>
            <Link
              href="/dashboard/positions/new"
              className="inline-block mt-4 text-sm font-semibold text-blue-600"
            >
              첫 포지션 만들기 →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {positions.map((position) => {
              const recruiter = position.recruiter as { id: string; name: string } | null
              const hm = position.hiring_manager as { id: string; name: string } | null

              return (
                <Link
                  key={position.id}
                  href={`/dashboard/positions/${position.id}`}
                  className="bg-white rounded-[1.5rem] shadow-[0_2px_20px_rgba(21,28,35,0.05)] px-6 py-5 hover:shadow-[0_4px_32px_rgba(21,28,35,0.09)] transition-shadow flex items-center justify-between"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[position.status] ?? 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>
                        {STATUS_LABEL[position.status] ?? position.status}
                      </span>
                      <span className="text-xs text-[#4a5a6a]">
                        {EMPLOYMENT_TYPE_LABEL[position.employment_type] ?? position.employment_type}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-[#151c23]">{position.title}</h2>
                    <p className="text-sm text-[#4a5a6a]">
                      {[position.division, position.headquarter, position.department].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right text-sm text-[#4a5a6a] flex flex-col gap-1 shrink-0 ml-6">
                    {recruiter && <span className="text-xs">담당: {recruiter.name}</span>}
                    {hm && <span className="text-xs">HM: {hm.name}</span>}
                    <span className="text-xs opacity-60">
                      {new Date(position.opened_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
