import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type PositionSummary = {
  id: string
  title: string
  division: string | null
  department: string | null
  status: string
  opened_at: string
}

const positionStatusLabel: Record<string, string> = {
  open: '진행 중',
  closed: '마감',
  draft: '임시저장',
}

const SOURCE_LABEL: Record<string, string> = {
  career_page: '채용 공고',
  referral: '추천',
  linkedin: 'LinkedIn',
  headhunting: '헤드헌팅',
  direct: '직접 지원',
  other: '기타',
}

const quickLinks = [
  { href: '/dashboard/positions',  label: '포지션',    desc: '채용 공고 및 지원자 현황',   icon: '📋' },
  { href: '/dashboard/pipeline',   label: '파이프라인', desc: '전체 후보자 칸반 뷰',         icon: '🔀' },
  { href: '/dashboard/candidates', label: '후보자',    desc: '전체 후보자 목록',            icon: '👤' },
  { href: '/dashboard/applications',label: '지원서',   desc: '단계별 지원서 현황',          icon: '📝' },
  { href: '/dashboard/interviews', label: '인터뷰',    desc: '슬롯 발송 및 결과 입력',      icon: '🗓' },
]

const FUNNEL_STEPS = [
  {
    label: '전체 지원',
    statuses: null, // all
  },
  {
    label: '서류 합격',
    statuses: ['doc_pass', 'interview1_scheduled', 'interview1_pass', 'interview1_fail',
                'interview2_scheduled', 'interview2_pass', 'interview2_fail',
                'offered', 'hired'],
  },
  {
    label: '1차 면접',
    statuses: ['interview1_scheduled', 'interview1_pass', 'interview1_fail',
                'interview2_scheduled', 'interview2_pass', 'interview2_fail',
                'offered', 'hired'],
  },
  {
    label: '2차 면접',
    statuses: ['interview2_scheduled', 'interview2_pass', 'interview2_fail',
                'offered', 'hired'],
  },
  {
    label: '오퍼',
    statuses: ['offered', 'hired'],
  },
  {
    label: '입사 확정',
    statuses: ['hired'],
  },
]

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { count: totalPositions },
    { count: openPositions },
    { count: totalApplications },
    { count: scheduledInterviews },
    { data: recentPositions },
    { data: allApplications },
  ] = await Promise.all([
    supabase.from('positions').select('*', { count: 'exact', head: true }),
    supabase.from('positions').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('applications').select('*', { count: 'exact', head: true }),
    supabase.from('interviews').select('*', { count: 'exact', head: true }).not('scheduled_at', 'is', null),
    supabase.from('positions').select('id, title, division, department, status, opened_at').order('opened_at', { ascending: false }).limit(5),
    supabase.from('applications').select('status, source_category'),
  ])

  const apps = allApplications ?? []

  // 전환율 퍼널 계산
  const funnelCounts = FUNNEL_STEPS.map((step) => {
    if (!step.statuses) return apps.length
    return apps.filter((a) => step.statuses!.includes(a.status)).length
  })
  const funnelMax = funnelCounts[0] || 1

  // 지원 경로 집계
  const sourceMap: Record<string, number> = {}
  for (const a of apps) {
    const src = a.source_category || 'other'
    sourceMap[src] = (sourceMap[src] ?? 0) + 1
  }
  const sourceSorted = Object.entries(sourceMap).sort((a, b) => b[1] - a[1])
  const sourceMax = sourceSorted[0]?.[1] || 1

  const metrics = [
    { label: '전체 포지션',  value: totalPositions  ?? 0 },
    { label: '진행 중',      value: openPositions   ?? 0 },
    { label: '전체 지원서',  value: totalApplications ?? 0 },
    { label: '예정 인터뷰',  value: scheduledInterviews ?? 0 },
  ]

  const emailName = user.email?.split('@')[0] ?? user.email

  return (
    <div className="min-h-screen bg-[#f6f9ff]">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-8">

        {/* 히어로 */}
        <section className="bg-[#edf4fe] rounded-[2rem] px-10 py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#2563eb] mb-4">
            ATS Dashboard
          </p>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#151c23] tracking-tight leading-tight">
                안녕하세요,<br />
                <span className="text-[#2563eb]">{emailName}</span> 님
              </h1>
              <p className="mt-3 text-sm leading-7 text-[#4a5a6a] max-w-lg">
                포지션 생성, 후보자 등록, 서류 심사, 면접 일정 관리까지
                채용 파이프라인 전체를 여기서 관리할 수 있습니다.
              </p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/dashboard/positions/new"
                className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full px-6 py-3 text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
              >
                새 포지션 만들기
              </Link>
              <Link
                href="/dashboard/pipeline"
                className="bg-white text-[#151c23] rounded-full px-6 py-3 text-sm font-semibold hover:bg-[#e1e9f2] transition-colors"
              >
                파이프라인 보기
              </Link>
            </div>
          </div>
        </section>

        {/* 지표 */}
        <section className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="bg-white rounded-[1.5rem] shadow-[0_2px_24px_rgba(21,28,35,0.05)] p-6">
              <p className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">{m.label}</p>
              <p className="mt-3 text-4xl font-bold text-[#151c23] tracking-tight">{m.value}</p>
            </div>
          ))}
        </section>

        {/* 전환율 퍼널 + 지원 경로 */}
        <section className="grid gap-6 lg:grid-cols-2">

          {/* 전환율 퍼널 */}
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-6">
            <h2 className="text-base font-bold text-[#151c23] mb-6">전환율 퍼널</h2>
            <div className="flex flex-col gap-3">
              {FUNNEL_STEPS.map((step, i) => {
                const count = funnelCounts[i]
                const pct = funnelMax > 0 ? Math.round((count / funnelMax) * 100) : 0
                const convPct = i > 0 && funnelCounts[i - 1] > 0
                  ? Math.round((count / funnelCounts[i - 1]) * 100)
                  : null
                return (
                  <div key={step.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-[#151c23]">{step.label}</span>
                      <div className="flex items-center gap-2">
                        {convPct !== null && (
                          <span className="text-xs text-[#4a5a6a] opacity-60">{convPct}%</span>
                        )}
                        <span className="text-xs font-bold text-[#151c23]">{count}명</span>
                      </div>
                    </div>
                    <div className="h-2 bg-[#edf4fe] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 지원 경로 */}
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-6">
            <h2 className="text-base font-bold text-[#151c23] mb-6">지원 경로</h2>
            {sourceSorted.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-[#4a5a6a] opacity-50">데이터 없음</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sourceSorted.map(([src, count]) => {
                  const pct = Math.round((count / sourceMax) * 100)
                  return (
                    <div key={src}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-[#151c23]">
                          {SOURCE_LABEL[src] ?? src}
                        </span>
                        <span className="text-xs font-bold text-[#151c23]">{count}명</span>
                      </div>
                      <div className="h-2 bg-[#edf4fe] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </section>

        {/* 퀵 링크 + 최근 포지션 */}
        <section className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">

          {/* 퀵 링크 */}
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-6 flex flex-col gap-2">
            <h2 className="text-base font-bold text-[#151c23] mb-2">메뉴</h2>
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-4 px-4 py-3.5 rounded-2xl hover:bg-[#edf4fe] transition-colors group"
              >
                <span className="text-xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-[#151c23]">{item.label}</p>
                  <p className="text-xs text-[#4a5a6a] mt-0.5">{item.desc}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* 최근 포지션 */}
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-[#151c23]">최근 포지션</h2>
              <Link href="/dashboard/positions" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                전체 보기
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {(recentPositions as PositionSummary[] | null)?.length ? (
                recentPositions!.map((p) => (
                  <Link
                    key={p.id}
                    href={`/dashboard/positions/${p.id}`}
                    className="flex items-center justify-between px-4 py-3.5 rounded-2xl hover:bg-[#edf4fe] transition-colors"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#151c23]">{p.title}</p>
                      <p className="text-xs text-[#4a5a6a] mt-0.5">
                        {[p.division, p.department].filter(Boolean).join(' / ') || '조직 정보 없음'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-xs font-semibold text-[#4a5a6a]">
                        {positionStatusLabel[p.status] ?? p.status}
                      </p>
                      <p className="text-xs text-[#4a5a6a] opacity-60 mt-0.5">
                        {new Date(p.opened_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="bg-[#f6f9ff] rounded-2xl px-5 py-10 text-center">
                  <p className="text-sm text-[#4a5a6a]">아직 등록된 포지션이 없습니다.</p>
                  <Link
                    href="/dashboard/positions/new"
                    className="inline-block mt-3 text-sm font-semibold text-blue-600"
                  >
                    첫 포지션 만들기 →
                  </Link>
                </div>
              )}
            </div>
          </div>

        </section>
      </div>
    </div>
  )
}
