import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: '정규직',
  part_time: '파트타임',
  contract: '계약직',
  intern: '인턴',
}

export default async function JobsPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('positions')
    .select('id, title, division, headquarter, department, employment_type, application_deadline, opened_at')
    .eq('is_published', true)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })

  const positions = data ?? []

  return (
    <div className="min-h-screen bg-[#f6f9ff]">

      {/* 헤더 */}
      <header className="bg-white shadow-[0_2px_16px_rgba(21,28,35,0.05)]">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-bold text-[#151c23]">채용 공고</span>
          </div>
          <span className="text-sm text-[#4a5a6a]">열린 포지션 {positions.length}개</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">

        {/* 히어로 */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-[#151c23] tracking-tight leading-tight">
            함께 만들어갈<br />
            <span className="text-[#2563eb]">팀원을 찾습니다</span>
          </h1>
          <p className="mt-4 text-base text-[#4a5a6a] leading-7 max-w-lg mx-auto">
            열정 있는 분들의 지원을 기다리고 있습니다.
            아래에서 포지션을 확인하고 지원해 주세요.
          </p>
        </div>

        {/* 공고 목록 */}
        {positions.length === 0 ? (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-16 text-center">
            <p className="text-[#4a5a6a]">현재 열린 채용 공고가 없습니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {positions.map((pos) => {
              const isDeadlineSoon =
                pos.application_deadline &&
                new Date(pos.application_deadline).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000

              return (
                <Link
                  key={pos.id}
                  href={`/jobs/${pos.id}`}
                  className="bg-white rounded-[1.5rem] shadow-[0_2px_20px_rgba(21,28,35,0.05)] px-7 py-6 hover:shadow-[0_4px_32px_rgba(21,28,35,0.09)] transition-shadow flex items-center justify-between gap-6"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#dbeafe] text-blue-700">
                        {EMPLOYMENT_TYPE_LABEL[pos.employment_type] ?? pos.employment_type}
                      </span>
                      {isDeadlineSoon && (
                        <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#fef9c3] text-yellow-700">
                          마감 임박
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-[#151c23]">{pos.title}</h2>
                    <p className="text-sm text-[#4a5a6a]">
                      {[pos.division, pos.headquarter, pos.department].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {pos.application_deadline ? (
                      <div>
                        <p className="text-xs text-[#4a5a6a] opacity-60">지원 마감</p>
                        <p className="text-sm font-semibold text-[#151c23] mt-0.5">
                          {new Date(pos.application_deadline).toLocaleDateString('ko-KR')}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-[#4a5a6a] opacity-60">상시 채용</span>
                    )}
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
