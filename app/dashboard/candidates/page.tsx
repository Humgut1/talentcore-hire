import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function CandidatesPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('candidates')
    .select(`
      id, name, email, phone, resume_url, created_at,
      applications(id)
    `)
    .order('created_at', { ascending: false })

  const candidates = data ?? []

  return (
    <div className="min-h-screen bg-[#f6f9ff]">
      <div className="max-w-5xl mx-auto px-6 py-10">

        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[#4a5a6a] hover:text-[#151c23] mb-8 transition-colors">
          ← 대시보드
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#151c23] tracking-tight">후보자</h1>
          <p className="text-sm text-[#4a5a6a] mt-1.5">총 {candidates.length}명</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-5 py-4 rounded-2xl text-sm mb-6">
            데이터를 불러오는 중 오류가 발생했습니다.
          </div>
        )}

        {candidates.length === 0 ? (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-16 text-center">
            <p className="text-[#4a5a6a] text-sm">등록된 후보자가 없습니다.</p>
            <p className="text-[#4a5a6a] text-xs mt-2 opacity-70">포지션 상세 페이지에서 후보자를 추가할 수 있습니다.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#edf4fe]">
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">이름</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">이메일</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">연락처</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">지원 건수</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">이력서</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">등록일</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const appCount = (c.applications as { id: string }[]).length
                  return (
                    <tr key={c.id} className="hover:bg-[#f6f9ff] transition-colors">
                      <td className="px-6 py-4 font-semibold text-[#151c23]">{c.name}</td>
                      <td className="px-6 py-4 text-[#4a5a6a]">{c.email}</td>
                      <td className="px-6 py-4 text-[#4a5a6a]">{c.phone ?? <span className="opacity-30">—</span>}</td>
                      <td className="px-6 py-4">
                        {appCount > 0 ? (
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#dbeafe] text-blue-700">
                            {appCount}건
                          </span>
                        ) : (
                          <span className="text-xs text-[#4a5a6a] opacity-40">없음</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {c.resume_url ? (
                          <a
                            href={c.resume_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 font-semibold text-xs hover:underline"
                          >
                            보기
                          </a>
                        ) : (
                          <span className="opacity-30">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-[#4a5a6a] text-xs opacity-70">
                        {new Date(c.created_at).toLocaleDateString('ko-KR')}
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
