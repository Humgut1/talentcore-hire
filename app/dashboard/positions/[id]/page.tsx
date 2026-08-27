'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface Position {
  id: string
  title: string
  division: string | null
  headquarter: string | null
  department: string | null
  employment_type: string
  status: string
  interview_mode: string
  description: string | null
  requirements: string | null
  application_deadline: string | null
  is_published: boolean
  recruiter: { id: string; name: string; email: string } | null
  hiring_manager: { id: string; name: string; email: string } | null
}

interface Application {
  id: string
  status: string
  applied_at: string
  offer_status: string | null
  candidate: {
    id: string
    name: string
    email: string
    phone: string | null
    resume_url: string | null
  }
}

const PIPELINE = [
  { key: 'all',        label: '전체',    statuses: [] as string[],                                                                               dot: 'bg-[#151c23]' },
  { key: 'doc',        label: '서류',    statuses: ['applied','doc_review','doc_pass','doc_fail'],                                               dot: 'bg-blue-500'   },
  { key: 'interview1', label: '1차 면접', statuses: ['interview1_scheduled','interview1_pass','interview1_fail'],                                  dot: 'bg-purple-500' },
  { key: 'interview2', label: '2차 면접', statuses: ['interview2_scheduled','interview2_pass','interview2_fail'],                                  dot: 'bg-purple-400' },
  { key: 'final',      label: '최종',    statuses: ['offered','hired','rejected','withdrawn'],                                                   dot: 'bg-green-500'  },
]

const STATUS_LABEL: Record<string, string> = {
  applied:'지원 접수', doc_review:'서류 검토', doc_pass:'서류 합격', doc_fail:'서류 불합격',
  interview1_scheduled:'1차 예정', interview1_pass:'1차 합격', interview1_fail:'1차 불합격',
  interview2_scheduled:'2차 예정', interview2_pass:'2차 합격', interview2_fail:'2차 불합격',
  offered:'오퍼', hired:'입사', rejected:'불합격', withdrawn:'취소',
}

const STATUS_COLOR: Record<string, string> = {
  applied:'bg-[#e1e9f2] text-[#4a5a6a]', doc_review:'bg-[#fef9c3] text-yellow-700',
  doc_pass:'bg-[#dbeafe] text-blue-700', doc_fail:'bg-red-50 text-red-600',
  interview1_scheduled:'bg-purple-100 text-purple-700', interview1_pass:'bg-[#dbeafe] text-blue-700',
  interview1_fail:'bg-red-50 text-red-600', interview2_scheduled:'bg-purple-100 text-purple-700',
  interview2_pass:'bg-[#dbeafe] text-blue-700', interview2_fail:'bg-red-50 text-red-600',
  offered:'bg-[#dcfce7] text-green-700', hired:'bg-[#bbf7d0] text-green-800',
  rejected:'bg-red-50 text-red-600', withdrawn:'bg-[#e1e9f2] text-[#4a5a6a]',
}

const inputClass = 'w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] placeholder:text-[#4a5a6a]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all'
const taClass   = 'w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] placeholder:text-[#4a5a6a]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all resize-none'

// ── 후보자 카드 ───────────────────────────────────────────────
function CandidateCard({ app, loadingId, onDocStatus, onOffer }: {
  app: Application
  loadingId: string | null
  onDocStatus: (id: string, s: 'doc_pass' | 'doc_fail') => void
  onOffer: (id: string, action: 'send' | 'accept' | 'reject') => void
}) {
  const loading = loadingId === app.id
  const canReview = app.status === 'applied' || app.status === 'doc_review'
  const canOffer  = app.status === 'interview2_pass'
  const isOffered = app.status === 'offered'

  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(21,28,35,0.05)] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[#151c23] text-sm">{app.candidate.name}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[app.status] ?? 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>
              {STATUS_LABEL[app.status] ?? app.status}
            </span>
          </div>
          <span className="text-xs text-[#4a5a6a] truncate">{app.candidate.email}</span>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-[#4a5a6a] opacity-60">{new Date(app.applied_at).toLocaleDateString('ko-KR')}</span>
            {app.candidate.resume_url && (
              <a href={app.candidate.resume_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-blue-600 hover:underline">이력서 보기</a>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
          {canReview && (
            <>
              <button onClick={() => onDocStatus(app.id,'doc_pass')} disabled={loading} className="px-3 py-1.5 text-xs font-semibold text-green-700 bg-[#dcfce7] rounded-full hover:bg-green-200 disabled:opacity-50 transition-colors">합격</button>
              <button onClick={() => onDocStatus(app.id,'doc_fail')} disabled={loading} className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 rounded-full hover:bg-red-100 disabled:opacity-50 transition-colors">불합격</button>
            </>
          )}
          {canOffer && (
            <button onClick={() => onOffer(app.id,'send')} disabled={loading} className="px-3 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity">오퍼 발송</button>
          )}
          {isOffered && (
            <>
              <button onClick={() => onOffer(app.id,'accept')} disabled={loading} className="px-3 py-1.5 text-xs font-semibold text-green-700 bg-[#dcfce7] rounded-full hover:bg-green-200 disabled:opacity-50 transition-colors">수락</button>
              <button onClick={() => onOffer(app.id,'reject')} disabled={loading} className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 rounded-full hover:bg-red-100 disabled:opacity-50 transition-colors">거절</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────
export default function PositionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [position, setPosition] = useState<Position | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [activeStage, setActiveStage] = useState('all')

  // 후보자 추가 폼
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ name:'', email:'', phone:'', resume_url:'' })
  const [addError, setAddError] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  // 공고 설정 모달
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({ description:'', requirements:'', application_deadline:'', is_published: false })
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState('')

  async function fetchData() {
    const [posRes, appRes] = await Promise.all([
      fetch(`/api/positions/${id}`),
      fetch(`/api/applications?position_id=${id}`),
    ])
    const posData = await posRes.json()
    setPosition(posData)
    setSettings({
      description: posData.description ?? '',
      requirements: posData.requirements ?? '',
      application_deadline: posData.application_deadline ? posData.application_deadline.slice(0,16) : '',
      is_published: posData.is_published ?? false,
    })
    const appData = await appRes.json()
    setApplications(appData.applications ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [id])

  async function handleDocStatus(appId: string, status: 'doc_pass' | 'doc_fail') {
    setActionLoadingId(appId)
    const res = await fetch(`/api/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const data = await res.json()
    setActionLoadingId(null)
    if (!res.ok) { alert(data.error ?? '오류가 발생했습니다.'); return }
    await fetchData()
  }

  async function handleOffer(appId: string, action: 'send' | 'accept' | 'reject') {
    setActionLoadingId(appId)
    const res = await fetch(`/api/applications/${appId}/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const data = await res.json()
    setActionLoadingId(null)
    if (!res.ok) { alert(data.error ?? '오류가 발생했습니다.'); return }
    await fetchData()
  }

  async function handleTogglePositionStatus() {
    if (!position) return
    const newStatus = position.status === 'open' ? 'closed' : 'open'
    const confirmed = confirm(newStatus === 'closed' ? '채용을 마감하시겠습니까?' : '채용을 재개하시겠습니까?')
    if (!confirmed) return
    await fetch(`/api/positions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    await fetchData()
  }

  async function handleAddCandidate(e: React.FormEvent) {
    e.preventDefault()
    setAddSubmitting(true)
    setAddError('')
    let candidateId: string

    const cRes = await fetch('/api/candidates', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(addForm) })
    const cData = await cRes.json()

    if (!cRes.ok) {
      if (cData.error?.includes('unique') || cRes.status === 409) {
        const sRes = await fetch(`/api/candidates?email=${encodeURIComponent(addForm.email)}`)
        const sData = await sRes.json()
        if (!sRes.ok || !sData.id) { setAddError('후보자 조회 중 오류가 발생했습니다.'); setAddSubmitting(false); return }
        candidateId = sData.id
      } else { setAddError(cData.error ?? '오류가 발생했습니다.'); setAddSubmitting(false); return }
    } else { candidateId = cData.id }

    const aRes = await fetch('/api/applications', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ candidate_id: candidateId, position_id: id }) })
    const aData = await aRes.json()
    if (!aRes.ok) { setAddError(aData.error ?? '오류가 발생했습니다.'); setAddSubmitting(false); return }

    setAddForm({ name:'', email:'', phone:'', resume_url:'' })
    setShowAddForm(false)
    setAddSubmitting(false)
    await fetchData()
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSettingsSaving(true)
    setSettingsError('')
    const res = await fetch(`/api/positions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: settings.description || null,
        requirements: settings.requirements || null,
        application_deadline: settings.application_deadline || null,
        is_published: settings.is_published,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setSettingsError(data.error ?? '오류가 발생했습니다.'); setSettingsSaving(false); return }
    await fetchData()
    setShowSettings(false)
    setSettingsSaving(false)
  }

  // 파이프라인 필터
  const activeStageObj = PIPELINE.find((s) => s.key === activeStage) ?? PIPELINE[0]
  const filteredApps = activeStage === 'all' ? applications : applications.filter((a) => activeStageObj.statuses.includes(a.status))
  const groupedByStage = activeStage === 'all'
    ? PIPELINE.filter((s) => s.key !== 'all').map((stage) => ({
        stage, apps: applications.filter((a) => stage.statuses.includes(a.status)),
      })).filter((g) => g.apps.length > 0)
    : null
  const stageCounts = PIPELINE.reduce<Record<string,number>>((acc, stage) => {
    acc[stage.key] = stage.key === 'all' ? applications.length : applications.filter((a) => stage.statuses.includes(a.status)).length
    return acc
  }, {})

  const appUrl = typeof window !== 'undefined' ? window.location.origin : ''

  if (loading) return <div className="min-h-screen bg-[#f6f9ff] flex items-center justify-center"><p className="text-sm text-[#4a5a6a]">불러오는 중...</p></div>
  if (!position) return <div className="min-h-screen bg-[#f6f9ff] flex items-center justify-center"><p className="text-sm text-[#4a5a6a]">포지션을 찾을 수 없습니다.</p></div>

  return (
    <div className="min-h-screen bg-[#f6f9ff]">
      <div className="max-w-5xl mx-auto px-6 py-10">

        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-[#4a5a6a] hover:text-[#151c23] mb-8 transition-colors">← 뒤로</button>

        {/* 포지션 헤더 */}
        <div className="bg-[#edf4fe] rounded-[2rem] px-8 py-7 mb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${position.is_published ? 'bg-[#dcfce7] text-green-700' : 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>
                  {position.is_published ? '공개 중' : '비공개'}
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white text-[#4a5a6a]">{position.status === 'open' ? '채용 중' : '마감'}</span>
              </div>
              <h1 className="text-2xl font-bold text-[#151c23] tracking-tight">{position.title}</h1>
              <p className="text-sm text-[#4a5a6a] mt-1.5">{[position.division, position.headquarter, position.department].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={handleTogglePositionStatus}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    position.status === 'open'
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-[#dcfce7] text-green-700 hover:bg-green-200'
                  }`}
                >
                  {position.status === 'open' ? '채용 마감' : '채용 재개'}
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className="bg-white text-[#151c23] rounded-full px-4 py-2 text-sm font-semibold hover:bg-[#e1e9f2] transition-colors"
                >
                  공고 설정
                </button>
                {position.is_published && (
                  <a
                    href={`/jobs/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    공고 보기 ↗
                  </a>
                )}
              </div>
              <div className="text-right text-xs text-[#4a5a6a]">
                {position.recruiter && <p>리크루터: <strong className="text-[#151c23]">{position.recruiter.name}</strong></p>}
                {position.hiring_manager && <p>HM: <strong className="text-[#151c23]">{position.hiring_manager.name}</strong></p>}
                {position.application_deadline && (
                  <p className="mt-1">마감: {new Date(position.application_deadline).toLocaleDateString('ko-KR')}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 공개 링크 배너 */}
        {position.is_published && (
          <div className="bg-white rounded-2xl shadow-[0_2px_12px_rgba(21,28,35,0.05)] px-5 py-3.5 mb-4 flex items-center justify-between gap-4">
            <p className="text-xs text-[#4a5a6a]">공개 채용 링크</p>
            <div className="flex items-center gap-2 min-w-0">
              <code className="text-xs text-[#2563eb] bg-[#edf4fe] px-3 py-1.5 rounded-xl truncate max-w-xs">
                {appUrl}/jobs/{id}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(`${appUrl}/jobs/${id}`)}
                className="text-xs font-semibold text-[#4a5a6a] hover:text-[#151c23] shrink-0 transition-colors"
              >
                복사
              </button>
            </div>
          </div>
        )}

        {/* 파이프라인 탭 */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-5">
          {PIPELINE.map((stage) => {
            const count = stageCounts[stage.key] ?? 0
            const isActive = activeStage === stage.key
            return (
              <button
                key={stage.key}
                onClick={() => setActiveStage(stage.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive ? 'bg-[#151c23] text-white shadow-sm' : 'bg-white text-[#4a5a6a] shadow-[0_2px_8px_rgba(21,28,35,0.06)] hover:bg-[#edf4fe]'
                }`}
              >
                {stage.key !== 'all' && <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white/50' : stage.dot}`} />}
                {stage.label}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-[#f6f9ff] text-[#4a5a6a]'}`}>{count}</span>
              </button>
            )
          })}
          <div className="ml-auto pl-3 shrink-0">
            <button
              onClick={() => { setShowAddForm((v) => !v); setAddError('') }}
              className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              + 후보자 추가
            </button>
          </div>
        </div>

        {/* 후보자 추가 폼 */}
        {showAddForm && (
          <form onSubmit={handleAddCandidate} className="bg-white rounded-[1.5rem] shadow-[0_2px_20px_rgba(21,28,35,0.06)] px-6 py-5 mb-5">
            <p className="text-sm font-bold text-[#151c23] mb-4">새 후보자 추가</p>
            {addError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-2xl mb-4">{addError}</div>}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { name:'name', type:'text', label:'이름', placeholder:'홍길동', required:true },
                { name:'email', type:'email', label:'이메일', placeholder:'hong@example.com', required:true },
                { name:'phone', type:'text', label:'연락처', placeholder:'010-0000-0000', required:false },
                { name:'resume_url', type:'text', label:'이력서 링크', placeholder:'https://notion.so/...', required:false },
              ].map((f) => (
                <div key={f.name} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">{f.label}{f.required && <span className="text-blue-500 ml-0.5 normal-case">*</span>}</label>
                  <input name={f.name} type={f.type} value={addForm[f.name as keyof typeof addForm]} onChange={(e) => setAddForm((p) => ({ ...p, [e.target.name]: e.target.value }))} required={f.required} placeholder={f.placeholder} className={inputClass} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm font-semibold text-[#4a5a6a] bg-[#e1e9f2] rounded-full hover:bg-[#d8e3ef] transition-colors">취소</button>
              <button type="submit" disabled={addSubmitting} className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity">{addSubmitting ? '추가 중...' : '추가'}</button>
            </div>
          </form>
        )}

        {/* 후보자 목록 */}
        {applications.length === 0 ? (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-16 text-center">
            <p className="text-[#4a5a6a] text-sm">아직 지원자가 없습니다.</p>
            {position.is_published && (
              <p className="text-xs text-[#4a5a6a] opacity-60 mt-2">공개 채용 링크를 공유하면 지원자가 직접 지원할 수 있습니다.</p>
            )}
          </div>
        ) : activeStage === 'all' && groupedByStage ? (
          <div className="flex flex-col gap-6">
            {groupedByStage.map(({ stage, apps }) => (
              <div key={stage.key}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                  <span className="text-xs font-bold text-[#4a5a6a] uppercase tracking-wider">{stage.label}</span>
                  <span className="text-xs text-[#4a5a6a] opacity-60">{apps.length}명</span>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {apps.map((app) => <CandidateCard key={app.id} app={app} loadingId={actionLoadingId} onDocStatus={handleDocStatus} onOffer={handleOffer} />)}
                </div>
              </div>
            ))}
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-16 text-center">
            <p className="text-[#4a5a6a] text-sm">이 단계의 후보자가 없습니다.</p>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {filteredApps.map((app) => <CandidateCard key={app.id} app={app} loadingId={actionLoadingId} onDocStatus={handleDocStatus} onOffer={handleOffer} />)}
          </div>
        )}

      </div>

      {/* 공고 설정 모달 */}
      {showSettings && (
        <div className="fixed inset-0 bg-[#151c23]/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl shadow-[0_8px_64px_rgba(21,28,35,0.12)] max-h-[90vh] overflow-y-auto">
            <div className="px-8 pt-8 pb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#151c23] tracking-tight">공고 설정</h2>
              <button onClick={() => { setShowSettings(false); setSettingsError('') }} className="text-[#4a5a6a] hover:text-[#151c23] text-xl transition-colors">✕</button>
            </div>

            <form onSubmit={handleSaveSettings} className="px-8 pb-8 flex flex-col gap-5">
              {settingsError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-2xl">{settingsError}</div>}

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">직무 내용</label>
                <textarea rows={5} value={settings.description} onChange={(e) => setSettings((p) => ({ ...p, description: e.target.value }))} placeholder="담당 업무, 팀 소개 등을 작성해주세요." className={taClass} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">자격 요건</label>
                <textarea rows={5} value={settings.requirements} onChange={(e) => setSettings((p) => ({ ...p, requirements: e.target.value }))} placeholder="필수/우대 조건을 작성해주세요." className={taClass} />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">지원 마감일</label>
                <input type="datetime-local" value={settings.application_deadline} onChange={(e) => setSettings((p) => ({ ...p, application_deadline: e.target.value }))} className={inputClass} />
                <p className="text-xs text-[#4a5a6a] opacity-60 px-1">공개 전환 시 마감일이 필요합니다.</p>
              </div>

              <div className="bg-[#f6f9ff] rounded-2xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#151c23]">외부 공개</p>
                  <p className="text-xs text-[#4a5a6a] mt-0.5">공개 시 /jobs 페이지에 노출됩니다.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings((p) => ({ ...p, is_published: !p.is_published }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${settings.is_published ? 'bg-blue-600' : 'bg-[#e1e9f2]'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.is_published ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowSettings(false); setSettingsError('') }} className="px-5 py-2.5 text-sm font-semibold text-[#4a5a6a] bg-[#e1e9f2] rounded-full hover:bg-[#d8e3ef] transition-colors">취소</button>
                <button type="submit" disabled={settingsSaving} className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity">{settingsSaving ? '저장 중...' : '저장'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
