import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const STATUS_LABEL: Record<string, string> = {
  applied: '지원',
  doc_review: '서류 검토',
  doc_pass: '서류 합격',
  doc_fail: '서류 불합격',
  interview1_scheduled: '1차 면접 예정',
  interview1_pass: '1차 합격',
  interview1_fail: '1차 불합격',
  interview2_scheduled: '2차 면접 예정',
  interview2_pass: '2차 합격',
  interview2_fail: '2차 불합격',
  offered: '오퍼',
  hired: '입사',
  rejected: '불합격',
  withdrawn: '취소',
}

const STATUS_COLOR: Record<string, string> = {
  applied: 'bg-[#e1e9f2] text-[#4a5a6a]',
  doc_review: 'bg-[#fef9c3] text-yellow-700',
  doc_pass: 'bg-[#dbeafe] text-blue-700',
  doc_fail: 'bg-red-50 text-red-600',
  interview1_scheduled: 'bg-purple-100 text-purple-700',
  interview1_pass: 'bg-[#dbeafe] text-blue-700',
  interview1_fail: 'bg-red-50 text-red-600',
  interview2_scheduled: 'bg-purple-100 text-purple-700',
  interview2_pass: 'bg-[#dbeafe] text-blue-700',
  interview2_fail: 'bg-red-50 text-red-600',
  offered: 'bg-[#dcfce7] text-green-700',
  hired: 'bg-[#bbf7d0] text-green-800',
  rejected: 'bg-red-50 text-red-600',
  withdrawn: 'bg-[#e1e9f2] text-[#4a5a6a]',
}

const STATUS_GROUPS = [
  { label: '전체', values: [] as string[] },
  { label: '서류', values: ['applied', 'doc_review', 'doc_pass', 'doc_fail'] },
  { label: '면접', values: ['interview1_scheduled', 'interview1_pass', 'interview1_fail', 'interview2_scheduled', 'interview2_pass', 'interview2_fail'] },
  { label: '최종', values: ['offered', 'hired', 'rejected', 'withdrawn'] },
]

const SOURCE_LABEL: Record<string, string> = {
  career_page: '채용 공고',
  referral: '추천',
  linkedin: 'LinkedIn',
  headhunting: '헤드헌팅',
  direct: '직접 지원',
  other: '기타',
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; source?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { group, source } = await searchParams
  const activeGroup = STATUS_GROUPS.find((g) => g.label === group) ?? STATUS_GROUPS[0]

  let query = supabase
    .from('applications')
    .select(`
      id, status, applied_at, source_category,
      candidate:candidates(id, name, email),
      position:positions(id, title)
    `)
    .order('applied_at', { ascending: false })

  if (activeGroup.values.length > 0) {
    query = query.in('status', activeGroup.values)
  }
  if (source) {
    query = query.eq('source_category', source)
  }

  const { data, error } = await query
  const applications = data ?? []

  // 경로별 카운트 (전체 기준)
  const { data: sourceData } = await supabase
    .from('applications')
    .select('source_category')
  const sourceMap: Record<string, number> = {}
  for (const a of sourceData ?? []) {
    const src = a.source_category || 'other'
    sourceMap[src] = (sourceMap[src] ?? 0) + 1
  }
  const sourceSorted = Object.entries(sourceMap).sort((a, b) => b[1] - a[1])

  const buildHref = (newGroup?: string, newSource?: string) => {
    const params = new URLSearchParams()
    if (newGroup && newGroup !== '전체') params.set('group', newGroup)
    if (newSource) params.set('source', newSource)
    const qs = params.toString()
    return `/dashboard/applications${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="min-h-screen bg-[#f6f9ff]">
      <div className="max-w-5xl mx-auto px-6 py-10">

        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[#4a5a6a] hover:text-[#151c23] mb-8 transition-colors">
          ← 대시보드
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#151c23] tracking-tight">지원서</h1>
          <p className="text-sm text-[#4a5a6a] mt-1.5">총 {applications.length}건</p>
        </div>

        {/* 단계 필터 탭 */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {STATUS_GROUPS.map((g) => (
            <Link
              key={g.label}
              href={buildHref(g.label === '전체' ? undefined : g.label, source)}
              className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors ${
                activeGroup.label === g.label
                  ? 'bg-[#151c23] text-white'
                  : 'bg-white text-[#4a5a6a] hover:bg-[#edf4fe] shadow-[0_2px_12px_rgba(21,28,35,0.05)]'
              }`}
            >
              {g.label}
            </Link>
          ))}
        </div>

        {/* 지원 경로 필터 */}
        {sourceSorted.length > 0 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            <Link
              href={buildHref(group, undefined)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                !source
                  ? 'bg-[#edf4fe] text-[#2563eb]'
                  : 'bg-white text-[#4a5a6a] hover:bg-[#edf4fe] shadow-[0_2px_8px_rgba(21,28,35,0.05)]'
              }`}
            >
              전체 경로
            </Link>
            {sourceSorted.map(([src, count]) => (
              <Link
                key={src}
                href={buildHref(group, src)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                  source === src
                    ? 'bg-[#edf4fe] text-[#2563eb]'
                    : 'bg-white text-[#4a5a6a] hover:bg-[#edf4fe] shadow-[0_2px_8px_rgba(21,28,35,0.05)]'
                }`}
              >
                {SOURCE_LABEL[src] ?? src}
                <span className="ml-1 opacity-60">{count}</span>
              </Link>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 px-5 py-4 rounded-2xl text-sm mb-6">
            데이터를 불러오는 중 오류가 발생했습니다.
          </div>
        )}

        {applications.length === 0 ? (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-16 text-center">
            <p className="text-[#4a5a6a] text-sm">해당 조건의 지원서가 없습니다.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#edf4fe]">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">후보자</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">이메일</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">포지션</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">상태</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">경로</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">지원일</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => {
                  const candidate = app.candidate as { id: string; name: string; email: string } | null
                  const position = app.position as { id: string; title: string } | null
                  const srcLabel = SOURCE_LABEL[app.source_category ?? ''] ?? app.source_category ?? '—'
                  return (
                    <tr key={app.id} className="hover:bg-[#f6f9ff] transition-colors">
                      <td className="px-6 py-4 font-semibold text-[#151c23]">{candidate?.name ?? '—'}</td>
                      <td className="px-6 py-4 text-[#4a5a6a]">{candidate?.email ?? '—'}</td>
                      <td className="px-6 py-4">
                        {position ? (
                          <Link href={`/dashboard/positions/${position.id}`} className="text-blue-600 font-semibold text-xs hover:underline">
                            {position.title}
                          </Link>
                        ) : (
                          <span className="opacity-30">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[app.status] ?? 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>
                          {STATUS_LABEL[app.status] ?? app.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-[#4a5a6a]">{srcLabel}</td>
                      <td className="px-6 py-4 text-[#4a5a6a] text-xs opacity-70">
                        {new Date(app.applied_at).toLocaleDateString('ko-KR')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
