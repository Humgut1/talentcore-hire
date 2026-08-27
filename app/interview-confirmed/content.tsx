'use client'

import { useSearchParams } from 'next/navigation'

function formatKoreanDateTime(isoString: string): string {
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: '유효하지 않은 링크입니다.',
  invalid_token: '링크를 찾을 수 없습니다.',
  expired: '링크가 만료되었습니다. 담당자에게 문의해 주세요.',
  not_found: '인터뷰 정보를 찾을 수 없습니다.',
  missing_data: '인터뷰 정보가 불완전합니다. 담당자에게 문의해 주세요.',
}

export default function InterviewConfirmedContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const already = searchParams.get('already')
  const scheduledAt = searchParams.get('scheduled_at')

  if (error) {
    return (
      <div className="min-h-screen bg-[#f6f9ff] flex items-center justify-center px-4">
        <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.07)] p-12 w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-6">
            <span className="text-red-500 text-xl font-bold">✕</span>
          </div>
          <h1 className="text-xl font-bold text-[#151c23] tracking-tight mb-3">오류가 발생했습니다</h1>
          <p className="text-sm text-[#4a5a6a] leading-7">
            {ERROR_MESSAGES[error] ?? '알 수 없는 오류입니다.'}
          </p>
        </div>
      </div>
    )
  }

  if (already) {
    return (
      <div className="min-h-screen bg-[#f6f9ff] flex items-center justify-center px-4">
        <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.07)] p-12 w-full max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#edf4fe] flex items-center justify-center mx-auto mb-6">
            <span className="text-blue-600 text-xl font-bold">✓</span>
          </div>
          <h1 className="text-xl font-bold text-[#151c23] tracking-tight mb-3">이미 확정된 일정입니다</h1>
          <p className="text-sm text-[#4a5a6a] leading-7">해당 면접 일정은 이미 확정되었습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f6f9ff] flex items-center justify-center px-4">
      <div className="bg-white rounded-[2rem] shadow-[0_4px_48px_rgba(21,28,35,0.07)] p-12 w-full max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#dcfce7] flex items-center justify-center mx-auto mb-6">
          <span className="text-green-600 text-xl font-bold">✓</span>
        </div>
        <h1 className="text-xl font-bold text-[#151c23] tracking-tight mb-3">
          면접 일정이 확정되었습니다
        </h1>

        {scheduledAt && (
          <div className="bg-[#edf4fe] rounded-2xl px-6 py-5 my-6">
            <p className="text-xs font-semibold text-[#4a5a6a] uppercase tracking-wider mb-2">확정 일시</p>
            <p className="text-lg font-bold text-[#2563eb]">
              {formatKoreanDateTime(decodeURIComponent(scheduledAt))}
            </p>
          </div>
        )}

        <p className="text-sm text-[#4a5a6a] leading-7">
          후보자와 면접관 모두에게<br />확정 안내 이메일이 발송되었습니다.
        </p>
      </div>
    </div>
  )
}
