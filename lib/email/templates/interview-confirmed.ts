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

interface CandidateConfirmedProps {
  positionTitle: string
  candidateName: string
  interviewerName: string
  scheduledAt: string
  durationMinutes: number
}

export function generateCandidateConfirmedEmail({
  positionTitle,
  candidateName,
  interviewerName,
  scheduledAt,
  durationMinutes,
}: CandidateConfirmedProps): { subject: string; html: string } {
  const subject = `[인터뷰 확정] ${positionTitle} 면접 일정 안내`

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f6f9ff;font-family:'Apple SD Gothic Neo',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 40px rgba(21,28,35,0.06);">
    <div style="padding:40px 40px 32px;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;">인터뷰 일정 확정</p>
      <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#151c23;line-height:1.3;">면접 일정이<br>확정되었습니다.</h1>
      <div style="background:#edf4fe;border-radius:16px;padding:24px;margin-bottom:32px;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">확정 일시</p>
        <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#2563eb;">${formatKoreanDateTime(scheduledAt)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">소요 시간</p>
        <p style="margin:0 0 16px;font-size:15px;color:#151c23;">${durationMinutes}분</p>
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">면접관</p>
        <p style="margin:0;font-size:15px;color:#151c23;">${interviewerName}</p>
      </div>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
        안녕하세요, <strong>${candidateName}</strong>님.<br>
        <strong>${positionTitle}</strong> 포지션 면접 일정이 확정되었습니다.<br>
        일정에 맞게 준비해 주세요.
      </p>
    </div>
    <div style="padding:20px 40px;background:#edf4fe;">
      <p style="margin:0;font-size:12px;color:#6b7280;">ATS · 채용 관리 시스템</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}

interface InterviewerConfirmedProps {
  positionTitle: string
  candidateName: string
  interviewerName: string
  scheduledAt: string
  durationMinutes: number
  resumeUrl: string | null
}

export function generateInterviewerConfirmedEmail({
  positionTitle,
  candidateName,
  interviewerName,
  scheduledAt,
  durationMinutes,
  resumeUrl,
}: InterviewerConfirmedProps): { subject: string; html: string } {
  const subject = `[인터뷰 확정] ${candidateName} 후보자 면접 일정 확정`

  const resumeSection = resumeUrl
    ? `<a href="${resumeUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">이력서 확인하기</a>`
    : ''

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f6f9ff;font-family:'Apple SD Gothic Neo',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 40px rgba(21,28,35,0.06);">
    <div style="padding:40px 40px 32px;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;">인터뷰 일정 확정</p>
      <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#151c23;line-height:1.3;">${candidateName} 후보자<br>면접이 확정되었습니다.</h1>
      <div style="background:#edf4fe;border-radius:16px;padding:24px;margin-bottom:32px;">
        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">확정 일시</p>
        <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#2563eb;">${formatKoreanDateTime(scheduledAt)}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">포지션</p>
        <p style="margin:0 0 16px;font-size:15px;color:#151c23;">${positionTitle}</p>
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">소요 시간</p>
        <p style="margin:0;font-size:15px;color:#151c23;">${durationMinutes}분</p>
        ${resumeSection}
      </div>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
        안녕하세요, <strong>${interviewerName}</strong>님.<br>
        면접 전 후보자 이력서를 미리 검토해 주세요.
      </p>
    </div>
    <div style="padding:20px 40px;background:#edf4fe;">
      <p style="margin:0;font-size:12px;color:#6b7280;">ATS · 채용 관리 시스템</p>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}
