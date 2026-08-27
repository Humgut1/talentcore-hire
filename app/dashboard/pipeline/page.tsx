import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const STAGES = [
  { key: 'applying',   label: '서류 접수', statuses: ['applied', 'doc_review'],                              headerColor: 'bg-[#e1e9f2]',    dotColor: 'bg-slate-400' },
  { key: 'doc_pass',   label: '서류 합격', statuses: ['doc_pass'],                                            headerColor: 'bg-[#dbeafe]',    dotColor: 'bg-blue-500'  },
  { key: 'interview1', label: '1차 면접',  statuses: ['interview1_scheduled', 'interview1_pass'],             headerColor: 'bg-purple-100',   dotColor: 'bg-purple-500'},
  { key: 'interview2', label: '2차 면접',  statuses: ['interview2_scheduled', 'interview2_pass'],             headerColor: 'bg-purple-100',   dotColor: 'bg-purple-400'},
  { key: 'offer',      label: '오퍼',     statuses: ['offered'],                                             headerColor: 'bg-[#dcfce7]',    dotColor: 'bg-green-500' },
  { key: 'hired',      label: '입사 확정', statuses: ['hired'],                                               headerColor: 'bg-[#bbf7d0]',    dotColor: 'bg-green-600' },
]

const STATUS_LABEL: Record<string, string> = {
  applied: '지원 접수', doc_review: '서류 검토', doc_pass: '서류 합격',
  interview1_scheduled: '1차 예정', interview1_pass: '1차 합격',
  interview2_scheduled: '2차 예정', interview2_pass: '2차 합격',
  offered: '오퍼 발송', hired: '입사',
}

const STATUS_COLOR: Record<string, string> = {
  applied: 'bg-[#e1e9f2] text-[#4a5a6a]', doc_review: 'bg-[#fef9c3] text-yellow-700',
  doc_pass: 'bg-[#dbeafe] text-blue-700',
  interview1_scheduled: 'bg-purple-100 text-purple-700', interview1_pass: 'bg-[#dbeafe] text-blue-700',
  interview2_scheduled: 'bg-purple-100 text-purple-700', interview2_pass: 'bg-[#dbeafe] text-blue-700',
  offered: 'bg-[#dcfce7] text-green-700', hired: 'bg-[#bbf7d0] text-green-800',
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ position_id?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { position_id } = await searchParams

  // 포지션 목록 (필터용)
  const { data: positions } = await supabase
    .from('positions')
    .select('id, title')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })

  // 활성 지원서 전체 (탈락 제외)
  const allActiveStatuses = STAGES.flatMap((s) => s.statuses)

  let query = supabase
    .from('applications')
    .select(`
      id, status, applied_at,
      candidate:candidates(id, name, email),
      position:positions(id, title)
    `)
    .in('status', allActiveStatuses)
    .order('applied_at', { ascending: false })

  if (position_id) {
    query = query.eq('position_id', position_id)
  }

  const { data } = await query
  const applications = data ?? []

  // 탈락 카운트
  let failQuery = supabase
    .from('applications')
    .select('*', { count: 'exact', head: true })
    .in('status', ['doc_fail', 'interview1_fail', 'interview2_fail', 'rejected', 'withdrawn'])
  if (position_id) failQuery = failQuery.eq('position_id', position_id)
  const { count: failCount } = await failQuery

  return (
    <div className="min-h-screen bg-[#f6f9ff]">
      <div className="max-w-[1400px] mx-auto px-6 py-10">

        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[#4a5a6a] hover:text-[#151c23] mb-8 transition-colors">
          ← 대시보드
        </Link>

        <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-[#151c23] tracking-tight">파이프라인</h1>
            <p className="text-sm text-[#4a5a6a] mt-1.5">활성 후보자 {applications.length}명</p>
          </div>

          {/* 포지션 필터 */}
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/dashboard/pipeline"
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${!position_id ? 'bg-[#151c23] text-white' : 'bg-white text-[#4a5a6a] shadow-[0_2px_8px_rgba(21,28,35,0.06)] hover:bg-[#edf4fe]'}`}
            >
              전체 포지션
            </Link>
            {(positions ?? []).map((pos) => (
              <Link
                key={pos.id}
                href={`/dashboard/pipeline?position_id=${pos.id}`}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${position_id === pos.id ? 'bg-[#151c23] text-white' : 'bg-white text-[#4a5a6a] shadow-[0_2px_8px_rgba(21,28,35,0.06)] hover:bg-[#edf4fe]'}`}
              >
                {pos.title}
              </Link>
            ))}
          </div>
        </div>

        {/* 칸반 보드 */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {STAGES.map((stage) => {
              const cards = applications.filter((a) => stage.statuses.includes(a.status))
              return (
                <div key={stage.key} className="w-64 flex flex-col gap-2 shrink-0">
                  {/* 컬럼 헤더 */}
                  <div className={`${stage.headerColor} rounded-2xl px-4 py-3 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${stage.dotColor}`} />
                      <span className="text-xs font-bold text-[#151c23] uppercase tracking-wider">{stage.label}</span>
                    </div>
                    <span className="text-xs font-bold text-[#4a5a6a] bg-white/60 px-2 py-0.5 rounded-full">{cards.length}</span>
                  </div>

                  {/* 카드들 */}
                  <div className="flex flex-col gap-2">
                    {cards.length === 0 ? (
                      <div className="bg-white/60 rounded-2xl px-4 py-6 text-center">
                        <p className="text-xs text-[#4a5a6a] opacity-50">없음</p>
                      </div>
                    ) : (
                      cards.map((app) => {
                        const candidate = app.candidate as { id: string; name: string; email: string } | null
                        const position  = app.position  as { id: string; title: string } | null
                        return (
                          <div key={app.id} className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(21,28,35,0.05)] px-4 py-3.5">
                            <p className="font-bold text-[#151c23] text-sm truncate">{candidate?.name}</p>
                            {!position_id && position && (
                              <Link
                                href={`/dashboard/positions/${position.id}`}
                                className="text-xs text-blue-600 font-semibold hover:underline truncate block mt-0.5"
                              >
                                {position.title}
                              </Link>
                            )}
                            <div className="flex items-center justify-between mt-2">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[app.status] ?? 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>
                                {STATUS_LABEL[app.status] ?? app.status}
                              </span>
                              <span className="text-xs text-[#4a5a6a] opacity-60">
                                {new Date(app.applied_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}

            {/* 탈락 컬럼 */}
            <div className="w-64 shrink-0">
              <div className="bg-red-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs font-bold text-[#151c23] uppercase tracking-wider">탈락</span>
                </div>
                <span className="text-xs font-bold text-[#4a5a6a] bg-white/60 px-2 py-0.5 rounded-full">{failCount ?? 0}</span>
              </div>
              <div className="mt-2 bg-white/60 rounded-2xl px-4 py-4 text-center">
                <p className="text-xs text-[#4a5a6a]">서류·면접 탈락 및<br/>취소 포함</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
