'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface User {
  id: string
  name: string
  role: string
}

const inputClass =
  'w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] placeholder:text-[#4a5a6a]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all'

const selectClass =
  'w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none'

export default function NewPositionPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    title: '',
    division: '',
    headquarter: '',
    department: '',
    employment_type: 'full_time',
    interview_mode: 'video',
    video_platform: 'google_meet',
    recruiter_id: '',
    hiring_manager_id: '',
  })

  useEffect(() => {
    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => setUsers(data.users ?? []))
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? '오류가 발생했습니다.')
      setLoading(false)
      return
    }

    router.push('/dashboard/positions')
  }

  const recruiters = users.filter((u) => ['recruiter', 'coordinator', 'admin'].includes(u.role))
  const hiringManagers = users.filter((u) =>
    ['hiring_manager', 'interviewer', 'admin'].includes(u.role)
  )

  return (
    <div className="min-h-screen bg-[#f6f9ff]">
      <div className="max-w-2xl mx-auto px-6 py-10">

        <Link href="/dashboard/positions" className="inline-flex items-center gap-1.5 text-sm text-[#4a5a6a] hover:text-[#151c23] mb-8 transition-colors">
          ← 포지션 목록
        </Link>

        <h1 className="text-3xl font-bold text-[#151c23] tracking-tight mb-8">새 포지션 만들기</h1>

        <form onSubmit={handleSubmit} className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-8 flex flex-col gap-6">

          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-2xl text-sm">{error}</div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">
              포지션명 <span className="text-blue-500 normal-case">*</span>
            </label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              placeholder="예: 백엔드 개발자"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { name: 'division', label: '부문', placeholder: '개발부문' },
              { name: 'headquarter', label: '본부', placeholder: '플랫폼본부' },
              { name: 'department', label: '부서', placeholder: '서버팀' },
            ].map((field) => (
              <div key={field.name} className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">
                  {field.label}
                </label>
                <input
                  name={field.name}
                  value={form[field.name as keyof typeof form]}
                  onChange={handleChange}
                  placeholder={field.placeholder}
                  className={inputClass}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">고용 형태</label>
              <select name="employment_type" value={form.employment_type} onChange={handleChange} className={selectClass}>
                <option value="full_time">정규직</option>
                <option value="part_time">파트타임</option>
                <option value="contract">계약직</option>
                <option value="intern">인턴</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">면접 방식</label>
              <select name="interview_mode" value={form.interview_mode} onChange={handleChange} className={selectClass}>
                <option value="video">화상</option>
                <option value="onsite">대면</option>
              </select>
            </div>
          </div>

          <div className="h-px bg-[#f6f9ff]" />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">담당 리크루터</label>
              <select name="recruiter_id" value={form.recruiter_id} onChange={handleChange} className={selectClass}>
                <option value="">선택 안 함</option>
                {recruiters.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">Hiring Manager</label>
              <select name="hiring_manager_id" value={form.hiring_manager_id} onChange={handleChange} className={selectClass}>
                <option value="">선택 안 함</option>
                {hiringManagers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-5 py-2.5 text-sm font-semibold text-[#4a5a6a] bg-[#e1e9f2] rounded-full hover:bg-[#d8e3ef] transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 rounded-full shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? '저장 중...' : '포지션 만들기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
