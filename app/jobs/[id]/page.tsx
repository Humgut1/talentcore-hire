import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: '정규직',
  part_time: '파트타임',
  contract: '계약직',
  intern: '인턴',
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: pos } = await supabase
    .from('positions')
    .select('id, title, division, headquarter, department, employment_type, description, requirements, application_deadline, is_published, status')
    .eq('id', id)
    .single()

  if (!pos || !pos.is_published || pos.status !== 'open') notFound()

  const deadlinePassed =
    pos.application_deadline && new Date(pos.application_deadline) < new Date()

  const isDeadlineSoon =
    pos.application_deadline &&
    !deadlinePassed &&
    new Date(pos.application_deadline).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000

  return (
    <div className="min-h-screen bg-[#f6f9ff]">

      {/* 헤더 */}
      <header className="bg-white shadow-[0_2px_16px_rgba(21,28,35,0.05)]">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <Link href="/jobs" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-bold text-[#151c23]">채용 공고</span>
          </Link>
          <span className="text-[#4a5a6a] opacity-40 mx-1">/</span>
          <span className="text-sm text-[#4a5a6a] truncate">{pos.title}</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">

        <Link href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-[#4a5a6a] hover:text-[#151c23] mb-8 transition-colors">
          ← 전체 공고 보기
        </Link>

        {/* 공고 헤더 카드 */}
        <div className="bg-[#edf4fe] rounded-[2rem] px-8 py-8 mb-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white text-[#2563eb]">
              {EMPLOYMENT_TYPE_LABEL[pos.employment_type] ?? pos.employment_type}
            </span>
            {isDeadlineSoon && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#fef9c3] text-yellow-700">
                마감 임박
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-[#151c23] tracking-tight">{pos.title}</h1>
          <p className="text-sm text-[#4a5a6a] mt-2">
            {[pos.division, pos.headquarter, pos.department].filter(Boolean).join(' · ')}
          </p>

          <div className="flex items-center justify-between mt-6 flex-wrap gap-4">
            <div>
              {pos.application_deadline ? (
                <div>
                  <p className="text-xs text-[#4a5a6a] opacity-60">지원 마감</p>
                  <p className="text-sm font-bold text-[#151c23] mt-0.5">
                    {new Date(pos.application_deadline).toLocaleDateString('ko-KR', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[#4a5a6a]">상시 채용</p>
              )}
            </div>

            {deadlinePassed ? (
              <span className="bg-[#e1e9f2] text-[#4a5a6a] rounded-full px-6 py-3 text-sm font-semibold">
                지원 마감
              </span>
            ) : (
              <Link
                href={`/jobs/${pos.id}/apply`}
                className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full px-6 py-3 text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
              >
                지원하기
              </Link>
            )}
          </div>
        </div>

        {/* 직무 내용 */}
        {pos.description && (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] px-8 py-7 mb-5">
            <h2 className="text-base font-bold text-[#151c23] mb-4">직무 내용</h2>
            <div className="text-sm text-[#4a5a6a] leading-7 whitespace-pre-wrap">
              {pos.description}
            </div>
          </div>
        )}

        {/* 자격 요건 */}
        {pos.requirements && (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] px-8 py-7 mb-5">
            <h2 className="text-base font-bold text-[#151c23] mb-4">자격 요건</h2>
            <div className="text-sm text-[#4a5a6a] leading-7 whitespace-pre-wrap">
              {pos.requirements}
            </div>
          </div>
        )}

        {/* 하단 지원 버튼 */}
        {!deadlinePassed && (
          <div className="mt-8 text-center">
            <Link
              href={`/jobs/${pos.id}/apply`}
              className="inline-block bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full px-10 py-3.5 text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
            >
              지원하기
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
