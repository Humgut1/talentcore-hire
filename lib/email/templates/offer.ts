interface OfferEmailParams {
  candidateName: string
  candidateEmail: string
  positionTitle: string
  offeredSalary?: string | null
  appUrl: string
}

export function generateOfferEmail({
  candidateName,
  positionTitle,
  offeredSalary,
}: OfferEmailParams): { subject: string; html: string } {
  const subject = `[오퍼 안내] ${positionTitle} 최종 합격을 축하드립니다`

  const html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f6f9ff;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 16px;">
    <div style="background:#ffffff;border-radius:24px;padding:48px 40px;box-shadow:0 4px 40px rgba(21,28,35,0.06);">

      <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#3b82f6);display:flex;align-items:center;justify-content:center;margin-bottom:32px;">
        <span style="color:white;font-weight:700;font-size:18px;">A</span>
      </div>

      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#151c23;letter-spacing:-0.5px;">
        최종 합격을 축하드립니다! 🎉
      </h1>
      <p style="margin:0 0 32px;font-size:14px;color:#4a5a6a;">${positionTitle}</p>

      <p style="font-size:15px;color:#151c23;line-height:1.8;margin:0 0 24px;">
        안녕하세요, <strong>${candidateName}</strong> 님.<br>
        모든 전형을 성공적으로 통과하셨습니다. 함께하게 되어 정말 기쁩니다.
      </p>

      ${offeredSalary ? `
      <div style="background:#edf4fe;border-radius:16px;padding:20px 24px;margin:0 0 24px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#4a5a6a;text-transform:uppercase;letter-spacing:0.08em;">제안 연봉</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:#2563eb;">${offeredSalary}</p>
      </div>` : ''}

      <p style="font-size:14px;color:#4a5a6a;line-height:1.8;margin:0 0 32px;">
        입사 일정 및 세부 사항은 채용 담당자가 별도로 안내드릴 예정입니다.<br>
        문의 사항이 있으시면 언제든지 연락해 주세요.
      </p>

      <div style="border-top:1px solid #edf4fe;padding-top:24px;">
        <p style="margin:0;font-size:12px;color:#4a5a6a;opacity:0.7;">
          본 메일은 발신 전용입니다.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}
