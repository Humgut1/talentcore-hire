interface RejectionEmailParams {
  candidateName: string
  positionTitle: string
  stage: 'doc' | 'interview'
}

export function generateRejectionEmail({ candidateName, positionTitle, stage }: RejectionEmailParams): {
  subject: string
  html: string
} {
  const subject = `[채용 결과 안내] ${positionTitle} 지원 결과를 안내드립니다`

  const stageMessage =
    stage === 'doc'
      ? '서류 전형 결과를 검토한 결과, 아쉽게도 이번에는 함께하기 어렵게 되었습니다.'
      : '면접 전형 결과를 검토한 결과, 아쉽게도 이번에는 함께하기 어렵게 되었습니다.'

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
        채용 결과를 안내드립니다
      </h1>
      <p style="margin:0 0 32px;font-size:14px;color:#4a5a6a;">
        ${positionTitle}
      </p>

      <p style="font-size:15px;color:#151c23;line-height:1.8;margin:0 0 24px;">
        안녕하세요, <strong>${candidateName}</strong> 님.<br>
        저희 채용 공고에 관심을 가져주시고 소중한 시간을 내어 지원해 주셔서 진심으로 감사드립니다.
      </p>

      <div style="background:#edf4fe;border-radius:16px;padding:20px 24px;margin:0 0 24px;">
        <p style="margin:0;font-size:14px;color:#4a5a6a;line-height:1.8;">
          ${stageMessage}<br>
          귀하의 역량과 경험은 충분히 훌륭하나, 현재 저희 팀의 방향성과 맞지 않아 이와 같은 결정을 내리게 되었습니다.
        </p>
      </div>

      <p style="font-size:14px;color:#4a5a6a;line-height:1.8;margin:0 0 32px;">
        앞으로의 활동에 좋은 결과가 있으시길 바라며, 다음 기회에 다시 만날 수 있기를 기대합니다.
      </p>

      <div style="border-top:1px solid #edf4fe;padding-top:24px;">
        <p style="margin:0;font-size:12px;color:#4a5a6a;opacity:0.7;line-height:1.8;">
          본 메일은 발신 전용입니다. 문의 사항이 있으시면 채용 담당자에게 직접 연락해 주세요.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}
