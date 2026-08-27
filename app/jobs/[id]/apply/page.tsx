'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const inputClass =
  'w-full bg-[#e1e9f2] rounded-2xl px-4 py-3 text-sm text-[#151c23] placeholder:text-[#4a5a6a]/50 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all'

export default function ApplyPage() {
  const { id } = useParams<{ id: string }>()

  const [form, setForm] = useState({ name: '', email: '', phone: '', resume_url: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [positionTitle, setPositionTitle] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const res = await fetch(`/api/jobs/${id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? '지원 중 오류가 발생했습니다.')
      setSubmitting(false)
      return
    }

    setPositionTitle(data.position_title ?? '')
    setDone(true)
    setSubmitting(false)
  }

  // 지원 완료 화면
  if (done) {
    return (
      <div className="min-h-screen bg-[#f6f9ff] flex items-center justify-center px-4">
        <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.07)] p-12 w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#dcfce7] flex items-center justify-center mx-auto mb-6">
            <span className="text-green-600 text-2xl font-bold">✓</span>
          </div>
          <h1 className="text-2xl font-bold text-[#151c23] tracking-tight mb-3">
            지원이 완료되었습니다
          </h1>
          <p className="text-sm text-[#4a5a6a] leading-7 mb-2">
            <strong className="text-[#151c23]">{positionTitle}</strong> 포지션에
          </p>
          <p className="text-sm text-[#4a5a6a] leading-7">
            <strong className="text-[#151c23]">{form.email}</strong> 으로<br />
            접수 확인 후 채용 담당자가 연락드릴 예정입니다.
          </p>
          <Link
            href="/jobs"
            className="inline-block mt-8 text-sm font-semibold text-blue-600 hover:text-blue-700"
          >
            다른 공고 보기 →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f9ff]">

      {/* 헤더 */}
      <header className="bg-white shadow-[0_2px_16px_rgba(21,28,35,0.05)]">
        <div className="max-w-xl mx-auto px-6 py-5 flex items-center gap-3">
          <Link href="/jobs" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-bold text-[#151c23]">채용 공고</span>
          </Link>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 py-10">

        <Link
          href={`/jobs/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#4a5a6a] hover:text-[#151c23] mb-8 transition-colors"
        >
          ← 공고 상세 보기
        </Link>

        <h1 className="text-3xl font-bold text-[#151c23] tracking-tight mb-2">지원서 작성</h1>
        <p className="text-sm text-[#4a5a6a] mb-8 leading-relaxed">
          정확한 정보를 입력해 주세요. 이력서 링크는 Notion, Google Docs 등 모두 가능합니다.
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.06)] p-8 flex flex-col gap-5"
        >
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-2xl text-sm">{error}</div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">
              이름 <span className="text-blue-500 normal-case">*</span>
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="홍길동"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">
              이메일 <span className="text-blue-500 normal-case">*</span>
            </label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
              placeholder="hong@example.com"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">연락처</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="010-0000-0000"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider">이력서 링크</label>
            <input
              name="resume_url"
              value={form.resume_url}
              onChange={handleChange}
              placeholder="https://notion.so/..."
              className={inputClass}
            />
            <p className="text-xs text-[#4a5a6a] opacity-60 px-1">
              Notion, Google Docs, GitHub, PDF 링크 등 공개 접근 가능한 URL
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full py-3.5 text-sm font-semibold shadow-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {submitting ? '제출 중...' : '지원서 제출'}
            </button>
          </div>

          <p className="text-xs text-[#4a5a6a] opacity-60 text-center leading-relaxed">
            제출된 개인정보는 채용 목적으로만 활용됩니다.
          </p>
        </form>
      </div>
    </div>
  )
}
