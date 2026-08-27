function formatKoreanDateTime(isoString: string): string {
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

interface SlotRequestTemplateProps {
  interviewId: string
  positionTitle: string
  candidateName: string
  interviewerName: string
  slots: { slotTime: string; token: string }[]
  appUrl: string
}

export function generateSlotRequestEmail({
  interviewId,
  positionTitle,
  candidateName,
  interviewerName,
  slots,
  appUrl,
}: SlotRequestTemplateProps): { subject: string; html: string } {
  const subject = `[인터뷰 일정 확인] ${positionTitle} - ${candidateName}`

  const slotButtons = slots
    .map(
      ({ slotTime, token }) => `
      <a href="${appUrl}/api/interviews/${interviewId}/slots/confirm?token=${token}"
         style="display:block;margin:8px 0;padding:14px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:600;text-align:center;">
        ${formatKoreanDateTime(slotTime)}
      </a>`
    )
    .join('')

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f6f9ff;font-family:'Apple SD Gothic Neo',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 40px rgba(21,28,35,0.06);">
    <div style="padding:40px 40px 32px;">
      <p style="margin:0 0 4px;font-size:12px;color:#6b7280;letter-spacing:0.05em;text-transform:uppercase;">인터뷰 일정 요청</p>
      <h1 style="margin:0 0 24px;font-size:22px;font-weight:700;color:#151c23;line-height:1.3;">${positionTitle}<br><span style="color:#2563eb;">${candidateName}</span> 후보자 면접</h1>
      <p style="margin:0 0 32px;font-size:15px;color:#374151;line-height:1.6;">
        안녕하세요, <strong>${interviewerName}</strong>님.<br>
        아래 일정 중 가능한 시간을 선택해 주세요.
      </p>
      <div style="margin-bottom:32px;">
        ${slotButtons}
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
        버튼을 클릭하면 일정이 자동으로 확정됩니다.<br>
        링크는 24시간 후 만료됩니다.
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
