'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Interviewer {
  id: string
  is_required: boolean
  slot_response: string
  user: { id: string; name: string; email: string; role: string }
}

interface Interview {
  id: string
  round: number
  status: string
  mode: string | null
  scheduled_at: string | null
  result: string | null
  result_note: string | null
  duration_minutes: number
  application: {
    id: string
    status: string
    candidate: { id: string; name: string; email: string }
    position: { id: string; title: string }
  } | null
  interviewers: { user: { id: string; name: string; email: string } }[]
}

interface User {
  id: string
  name: string
  email: string
  role: string
}

const STATUS_LABEL: Record<string, string> = {
  pending_slots: '슬롯 미발송', slot_requested: '슬롯 발송됨',
  scheduled: '일정 확정', completed: '완료', cancelled: '취소',
}
const STATUS_COLOR: Record<string, string> = {
  pending_slots: 'bg-[#fef9c3] text-yellow-700', slot_requested: 'bg-[#dbeafe] text-blue-700',
  scheduled: 'bg-purple-100 text-purple-700', completed: 'bg-[#dcfce7] text-green-700',
  cancelled: 'bg-[#e1e9f2] text-[#4a5a6a]',
}
const RESULT_LABEL: Record<string, string> = { pass: '합격', fail: '불합격', hold: '보류' }
const RESULT_COLOR: Record<string, string> = {
  pass: 'bg-[#dcfce7] text-green-700', fail: 'bg-red-50 text-red-600', hold: 'bg-[#fef9c3] text-yellow-700',
}

const inputClass = 'w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] placeholder:text-[#4a5a6a]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all'

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  // 면접관 배정 모달
  const [assignModal, setAssignModal] = useState<{ interviewId: string; candidateName: string } | null>(null)
  const [assignedInterviewers, setAssignedInterviewers] = useState<Interviewer[]>([])
  const [assignUserId, setAssignUserId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignError, setAssignError] = useState('')

  // 스코어카드 모달
  const [scorecardModal, setScorecardModal] = useState<{ interviewId: string; candidateName: string; round: number } | null>(null)
  const [scorecards, setScorecards] = useState<{ id: string; overall_rating: number | null; strengths: string | null; concerns: string | null; recommendation: string; notes: string | null; submitted_at: string; interviewer: { id: string; name: string } }[]>([])
  const [scorecardForm, setScorecardForm] = useState({ interviewer_id: '', overall_rating: '3', strengths: '', concerns: '', recommendation: 'yes', notes: '' })
  const [scorecardSubmitting, setScorecardSubmitting] = useState(false)
  const [scorecardError, setScorecardError] = useState('')

  // 슬롯 발송 모달
  const [slotModal, setSlotModal] = useState<{ interviewId: string; candidateName: string } | null>(null)
  const [slots, setSlots] = useState(['', '', ''])
  const [slotSubmitting, setSlotSubmitting] = useState(false)
  const [slotError, setSlotError] = useState('')

  // 결과 입력 모달
  const [resultModal, setResultModal] = useState<{ interviewId: string; round: number; candidateName: string } | null>(null)
  const [resultForm, setResultForm] = useState({ result: 'pass', result_note: '' })
  const [resultSubmitting, setResultSubmitting] = useState(false)
  const [resultError, setResultError] = useState('')

  async function fetchData() {
    const [ivRes, usersRes] = await Promise.all([
      fetch('/api/interviews'),
      fetch('/api/users'),
    ])
    const ivData = await ivRes.json()
    const usersData = await usersRes.json()
    setInterviews(ivData.interviews ?? [])
    setAllUsers(usersData.users ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // 면접관 배정 모달 열기
  async function openAssignModal(interviewId: string, candidateName: string) {
    setAssignModal({ interviewId, candidateName })
    setAssignError('')
    setAssignUserId('')
    const res = await fetch(`/api/interviews/${interviewId}/interviewers`)
    const data = await res.json()
    setAssignedInterviewers(data.interviewers ?? [])
  }

  async function handleAssign() {
    if (!assignModal || !assignUserId) return
    setAssignLoading(true)
    setAssignError('')
    const res = await fetch(`/api/interviews/${assignModal.interviewId}/interviewers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: assignUserId }),
    })
    const data = await res.json()
    if (!res.ok) { setAssignError(data.error ?? '오류가 발생했습니다.'); setAssignLoading(false); return }
    // 갱신
    const listRes = await fetch(`/api/interviews/${assignModal.interviewId}/interviewers`)
    const listData = await listRes.json()
    setAssignedInterviewers(listData.interviewers ?? [])
    setAssignUserId('')
    setAssignLoading(false)
    await fetchData()
  }

  async function handleRemoveInterviewer(userId: string) {
    if (!assignModal) return
    await fetch(`/api/interviews/${assignModal.interviewId}/interviewers`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    const listRes = await fetch(`/api/interviews/${assignModal.interviewId}/interviewers`)
    const listData = await listRes.json()
    setAssignedInterviewers(listData.interviewers ?? [])
    await fetchData()
  }

  async function openScorecardModal(interviewId: string, candidateName: string, round: number) {
    setScorecardModal({ interviewId, candidateName, round })
    setScorecardError('')
    setScorecardForm({ interviewer_id: '', overall_rating: '3', strengths: '', concerns: '', recommendation: 'yes', notes: '' })
    const res = await fetch(`/api/interviews/${interviewId}/scorecard`)
    const data = await res.json()
    setScorecards(data.scorecards ?? [])
  }

  async function handleSubmitScorecard(e: React.FormEvent) {
    e.preventDefault()
    if (!scorecardModal) return
    setScorecardSubmitting(true)
    setScorecardError('')
    const res = await fetch(`/api/interviews/${scorecardModal.interviewId}/scorecard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...scorecardForm, overall_rating: parseInt(scorecardForm.overall_rating) }),
    })
    const data = await res.json()
    if (!res.ok) { setScorecardError(data.error ?? '오류가 발생했습니다.'); setScorecardSubmitting(false); return }
    // 목록 갱신
    const listRes = await fetch(`/api/interviews/${scorecardModal.interviewId}/scorecard`)
    const listData = await listRes.json()
    setScorecards(listData.scorecards ?? [])
    setScorecardForm({ interviewer_id: '', overall_rating: '3', strengths: '', concerns: '', recommendation: 'yes', notes: '' })
    setScorecardSubmitting(false)
  }

  async function handleSendSlots(e: React.FormEvent) {
    e.preventDefault()
    if (!slotModal) return
    setSlotSubmitting(true)
    setSlotError('')
    const filled = slots.filter((s) => s.trim())
    if (filled.length === 0) { setSlotError('슬롯을 1개 이상 입력해주세요.'); setSlotSubmitting(false); return }
    const res = await fetch(`/api/interviews/${slotModal.interviewId}/slots`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slots: filled }),
    })
    const data = await res.json()
    if (!res.ok) { setSlotError(data.error ?? '오류가 발생했습니다.'); setSlotSubmitting(false); return }
    setSlotModal(null); setSlots(['','','']); setSlotSubmitting(false)
    await fetchData()
  }

  async function handleRecordResult(e: React.FormEvent) {
    e.preventDefault()
    if (!resultModal) return
    setResultSubmitting(true)
    setResultError('')
    const res = await fetch(`/api/interviews/${resultModal.interviewId}/result`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(resultForm),
    })
    const data = await res.json()
    if (!res.ok) { setResultError(data.error ?? '오류가 발생했습니다.'); setResultSubmitting(false); return }
    setResultModal(null); setResultForm({ result:'pass', result_note:'' }); setResultSubmitting(false)
    await fetchData()
  }

  if (loading) return <div className="min-h-screen bg-[#f6f9ff] flex items-center justify-center"><p className="text-sm text-[#4a5a6a]">불러오는 중...</p></div>

  const assignableUsers = allUsers.filter((u) => !assignedInterviewers.find((i) => i.user.id === u.id))

  return (
    <div className="min-h-screen bg-[#f6f9ff]">
      <div className="max-w-5xl mx-auto px-6 py-10">

        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[#4a5a6a] hover:text-[#151c23] mb-8 transition-colors">← 대시보드</Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#151c23] tracking-tight">인터뷰</h1>
          <p className="text-sm text-[#4a5a6a] mt-1.5">총 {interviews.length}건</p>
        </div>

        {interviews.length === 0 ? (
          <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-16 text-center">
            <p className="text-[#4a5a6a] text-sm">등록된 인터뷰가 없습니다.</p>
            <p className="text-[#4a5a6a] text-xs mt-2 opacity-70">서류 합격 처리 시 인터뷰가 자동 생성됩니다.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {interviews.map((iv) => {
              const candidate = iv.application?.candidate
              const position = iv.application?.position
              const hasInterviewers = iv.interviewers.length > 0
              const interviewerNames = iv.interviewers.map((i) => i.user.name).join(', ')

              return (
                <div key={iv.id} className="bg-white rounded-[1.5rem] shadow-[0_2px_20px_rgba(21,28,35,0.05)] px-6 py-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex flex-col gap-3">
                      {/* 배지 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[iv.status] ?? 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>
                          {STATUS_LABEL[iv.status] ?? iv.status}
                        </span>
                        <span className="text-xs font-semibold text-[#4a5a6a] bg-[#f6f9ff] px-2.5 py-0.5 rounded-full">{iv.round}차 면접</span>
                        {iv.result && (
                          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${RESULT_COLOR[iv.result] ?? 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>
                            {RESULT_LABEL[iv.result] ?? iv.result}
                          </span>
                        )}
                        {!hasInterviewers && iv.status === 'pending_slots' && (
                          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-600">면접관 미배정</span>
                        )}
                      </div>

                      {/* 후보자 + 포지션 */}
                      <div>
                        <p className="font-bold text-[#151c23]">
                          {candidate?.name ?? '—'}
                          <span className="ml-2 text-sm font-normal text-[#4a5a6a]">{candidate?.email}</span>
                        </p>
                        {position && (
                          <Link href={`/dashboard/positions/${position.id}`} className="text-sm text-blue-600 font-semibold hover:underline">{position.title}</Link>
                        )}
                      </div>

                      {/* 메타 */}
                      <div className="flex gap-4 flex-wrap text-xs text-[#4a5a6a]">
                        {hasInterviewers
                          ? <span>면접관: <strong className="text-[#151c23]">{interviewerNames}</strong></span>
                          : <span className="text-orange-500">면접관을 배정해주세요</span>
                        }
                        {iv.scheduled_at && <span>일정: {new Date(iv.scheduled_at).toLocaleString('ko-KR')}</span>}
                        {iv.duration_minutes && <span>{iv.duration_minutes}분</span>}
                      </div>

                      {iv.result_note && (
                        <p className="text-xs text-[#4a5a6a] bg-[#f6f9ff] rounded-xl px-3.5 py-2.5 max-w-lg leading-relaxed">{iv.result_note}</p>
                      )}
                    </div>

                    {/* 액션 버튼들 */}
                    <div className="flex gap-2 shrink-0 flex-wrap">
                      {/* 면접관 배정은 항상 가능 (pending_slots, slot_requested) */}
                      {(iv.status === 'pending_slots' || iv.status === 'slot_requested') && (
                        <button
                          onClick={() => openAssignModal(iv.id, candidate?.name ?? '')}
                          className="bg-[#edf4fe] text-blue-700 rounded-full px-4 py-2 text-sm font-semibold hover:bg-[#dbeafe] transition-colors"
                        >
                          면접관 배정
                        </button>
                      )}
                      {iv.status === 'pending_slots' && hasInterviewers && (
                        <button
                          onClick={() => setSlotModal({ interviewId: iv.id, candidateName: candidate?.name ?? '' })}
                          className="bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
                        >
                          슬롯 발송
                        </button>
                      )}
                      {(iv.status === 'scheduled' || iv.status === 'completed') && (
                        <button
                          onClick={() => openScorecardModal(iv.id, candidate?.name ?? '', iv.round)}
                          className="bg-[#edf4fe] text-blue-700 rounded-full px-4 py-2 text-sm font-semibold hover:bg-[#dbeafe] transition-colors"
                        >
                          스코어카드
                        </button>
                      )}
                      {iv.status === 'scheduled' && !iv.result && (
                        <button
                          onClick={() => setResultModal({ interviewId: iv.id, round: iv.round, candidateName: candidate?.name ?? '' })}
                          className="bg-[#e1e9f2] text-[#151c23] rounded-full px-4 py-2 text-sm font-semibold hover:bg-[#d8e3ef] transition-colors"
                        >
                          결과 입력
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 면접관 배정 모달 */}
      {assignModal && (
        <div className="fixed inset-0 bg-[#151c23]/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-[0_8px_64px_rgba(21,28,35,0.12)]">
            <h2 className="text-xl font-bold text-[#151c23] tracking-tight mb-1">면접관 배정</h2>
            <p className="text-sm text-[#4a5a6a] mb-6"><strong className="text-[#151c23]">{assignModal.candidateName}</strong></p>

            {assignError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-2xl mb-4">{assignError}</div>}

            {/* 현재 배정된 면접관 */}
            {assignedInterviewers.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider mb-2">배정된 면접관</p>
                <div className="flex flex-col gap-2">
                  {assignedInterviewers.map((iv) => (
                    <div key={iv.user.id} className="flex items-center justify-between bg-[#f6f9ff] rounded-2xl px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-[#151c23]">{iv.user.name}</p>
                        <p className="text-xs text-[#4a5a6a]">{iv.user.email}</p>
                      </div>
                      <button onClick={() => handleRemoveInterviewer(iv.user.id)} className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors">제거</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 면접관 추가 */}
            {assignableUsers.length > 0 && (
              <div className="flex flex-col gap-2 mb-5">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">면접관 추가</label>
                <div className="flex gap-2">
                  <select
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                    className="flex-1 bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none"
                  >
                    <option value="">선택하세요</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAssign}
                    disabled={!assignUserId || assignLoading}
                    className="px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {assignLoading ? '...' : '추가'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={() => setAssignModal(null)} className="px-5 py-2.5 text-sm font-semibold text-[#4a5a6a] bg-[#e1e9f2] rounded-full hover:bg-[#d8e3ef] transition-colors">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 슬롯 발송 모달 */}
      {slotModal && (
        <div className="fixed inset-0 bg-[#151c23]/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-[0_8px_64px_rgba(21,28,35,0.12)]">
            <h2 className="text-xl font-bold text-[#151c23] tracking-tight mb-1">면접 슬롯 발송</h2>
            <p className="text-sm text-[#4a5a6a] mb-7"><strong className="text-[#151c23]">{slotModal.candidateName}</strong> 후보자 면접관에게 이메일이 발송됩니다.</p>
            <form onSubmit={handleSendSlots} className="flex flex-col gap-4">
              {slotError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-2xl">{slotError}</div>}
              {slots.map((slot, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">슬롯 {i + 1}{i === 0 ? ' *' : ' (선택)'}</label>
                  <input type="datetime-local" value={slot} onChange={(e) => { const n=[...slots]; n[i]=e.target.value; setSlots(n) }} required={i===0} className={inputClass} />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setSlotModal(null); setSlots(['','','']); setSlotError('') }} className="px-5 py-2.5 text-sm font-semibold text-[#4a5a6a] bg-[#e1e9f2] rounded-full hover:bg-[#d8e3ef] transition-colors">취소</button>
                <button type="submit" disabled={slotSubmitting} className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity">{slotSubmitting ? '발송 중...' : '이메일 발송'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 스코어카드 모달 */}
      {scorecardModal && (
        <div className="fixed inset-0 bg-[#151c23]/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-[0_8px_64px_rgba(21,28,35,0.12)] max-h-[90vh] overflow-y-auto">
            <div className="px-8 pt-8 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[#151c23] tracking-tight">스코어카드</h2>
                <p className="text-sm text-[#4a5a6a] mt-0.5">{scorecardModal.round}차 면접 — <strong className="text-[#151c23]">{scorecardModal.candidateName}</strong></p>
              </div>
              <button onClick={() => setScorecardModal(null)} className="text-[#4a5a6a] hover:text-[#151c23] text-xl transition-colors">✕</button>
            </div>

            {/* 기존 스코어카드 */}
            {scorecards.length > 0 && (
              <div className="px-8 pb-4">
                <p className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider mb-3">제출된 평가</p>
                <div className="flex flex-col gap-3">
                  {scorecards.map((sc) => {
                    const recLabel: Record<string,string> = { strong_yes:'강력 추천', yes:'추천', no:'비추천', strong_no:'강력 비추천' }
                    const recColor: Record<string,string> = { strong_yes:'text-green-700 bg-[#dcfce7]', yes:'text-blue-700 bg-[#dbeafe]', no:'text-orange-600 bg-orange-50', strong_no:'text-red-600 bg-red-50' }
                    return (
                      <div key={sc.id} className="bg-[#f6f9ff] rounded-2xl px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-[#151c23]">{sc.interviewer?.name}</span>
                          <div className="flex items-center gap-2">
                            {sc.overall_rating && <span className="text-xs text-[#4a5a6a]">{'★'.repeat(sc.overall_rating)}{'☆'.repeat(5 - sc.overall_rating)}</span>}
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${recColor[sc.recommendation] ?? 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>{recLabel[sc.recommendation] ?? sc.recommendation}</span>
                          </div>
                        </div>
                        {sc.strengths && <p className="text-xs text-[#4a5a6a] leading-relaxed"><span className="font-semibold text-[#151c23]">강점: </span>{sc.strengths}</p>}
                        {sc.concerns  && <p className="text-xs text-[#4a5a6a] leading-relaxed mt-1"><span className="font-semibold text-[#151c23]">우려: </span>{sc.concerns}</p>}
                        {sc.notes     && <p className="text-xs text-[#4a5a6a] leading-relaxed mt-1 opacity-70">{sc.notes}</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 스코어카드 작성 폼 */}
            <form onSubmit={handleSubmitScorecard} className="px-8 pb-8 flex flex-col gap-4">
              <p className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider pt-2">새 평가 작성</p>
              {scorecardError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-2xl">{scorecardError}</div>}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">면접관 *</label>
                <select value={scorecardForm.interviewer_id} onChange={(e) => setScorecardForm((p) => ({ ...p, interviewer_id: e.target.value }))} required className="w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none">
                  <option value="">선택하세요</option>
                  {allUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">종합 평점</label>
                <div className="flex gap-2">
                  {[1,2,3,4,5].map((n) => (
                    <button key={n} type="button" onClick={() => setScorecardForm((p) => ({ ...p, overall_rating: String(n) }))}
                      className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-colors ${Number(scorecardForm.overall_rating) >= n ? 'bg-[#dbeafe] text-blue-700' : 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">강점</label>
                <textarea value={scorecardForm.strengths} onChange={(e) => setScorecardForm((p) => ({ ...p, strengths: e.target.value }))} rows={2} placeholder="후보자의 강점..." className="w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] placeholder:text-[#4a5a6a]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all resize-none" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">우려 사항</label>
                <textarea value={scorecardForm.concerns} onChange={(e) => setScorecardForm((p) => ({ ...p, concerns: e.target.value }))} rows={2} placeholder="우려되는 점..." className="w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] placeholder:text-[#4a5a6a]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all resize-none" />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">최종 의견 *</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value:'strong_yes', label:'강력 추천', color:'bg-[#dcfce7] text-green-700' },
                    { value:'yes',        label:'추천',     color:'bg-[#dbeafe] text-blue-700' },
                    { value:'no',         label:'비추천',    color:'bg-orange-50 text-orange-600' },
                    { value:'strong_no',  label:'강력 비추천', color:'bg-red-50 text-red-600' },
                  ].map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setScorecardForm((p) => ({ ...p, recommendation: opt.value }))}
                      className={`py-2.5 rounded-2xl text-xs font-bold transition-all ${scorecardForm.recommendation === opt.value ? `${opt.color} ring-2 ring-offset-1 ring-current` : 'bg-[#e1e9f2] text-[#4a5a6a]'}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setScorecardModal(null)} className="px-5 py-2.5 text-sm font-semibold text-[#4a5a6a] bg-[#e1e9f2] rounded-full hover:bg-[#d8e3ef] transition-colors">닫기</button>
                <button type="submit" disabled={scorecardSubmitting} className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity">{scorecardSubmitting ? '저장 중...' : '평가 제출'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 결과 입력 모달 */}
      {resultModal && (
        <div className="fixed inset-0 bg-[#151c23]/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-[0_8px_64px_rgba(21,28,35,0.12)]">
            <h2 className="text-xl font-bold text-[#151c23] tracking-tight mb-1">{resultModal.round}차 면접 결과 입력</h2>
            <p className="text-sm text-[#4a5a6a] mb-7"><strong className="text-[#151c23]">{resultModal.candidateName}</strong></p>
            <form onSubmit={handleRecordResult} className="flex flex-col gap-4">
              {resultError && <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-2xl">{resultError}</div>}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">결과 *</label>
                <select value={resultForm.result} onChange={(e) => setResultForm((p) => ({ ...p, result: e.target.value }))} className="w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none">
                  <option value="pass">합격</option>
                  <option value="fail">불합격</option>
                  <option value="hold">보류</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">메모 (선택)</label>
                <textarea value={resultForm.result_note} onChange={(e) => setResultForm((p) => ({ ...p, result_note: e.target.value }))} rows={3} placeholder="면접 메모..." className="w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] placeholder:text-[#4a5a6a]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setResultModal(null); setResultForm({result:'pass',result_note:''}); setResultError('') }} className="px-5 py-2.5 text-sm font-semibold text-[#4a5a6a] bg-[#e1e9f2] rounded-full hover:bg-[#d8e3ef] transition-colors">취소</button>
                <button type="submit" disabled={resultSubmitting} className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity">{resultSubmitting ? '저장 중...' : '결과 저장'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
