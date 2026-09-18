/* =========================================================
   오퍼레터 공개 페이지 (외부 링크 /offer/{token})
   ---------------------------------------------------------
   주소에 후보자 번호를 그대로 쓰지 않는다. c51 로 열리면 c52 로도
   열리고, 그러면 남의 연봉이 보인다. 그래서 주소는 서명된 토큰이고
   기한이 지나면 죽는다(gate.ts readLinkToken).

   로그인은 없다 — 후보자는 우리 시스템의 계정이 아니다.
   대신 이 화면은 읽기와 '수락/거절' 한 번 말고는 아무것도 못 한다.
   ========================================================= */
import OfferLetterClient, { type LetterData } from '../../../components/OfferLetterClient'
import { hydrateData } from '../../../lib/db'
import { readLinkToken } from '../../../lib/gate'
import { letterViewOf, dayLabel, LETTER_KIND } from '../../../lib/offer-letter'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const cid = await readLinkToken(LETTER_KIND, token)
  if (!cid) return <OfferLetterClient data={{ status: 'invalid' }} />

  await hydrateData()
  const v = await letterViewOf(cid)
  if (!v) return <OfferLetterClient data={{ status: 'invalid' }} />

  /* 아직 발송 전이면 내용을 보여주지 않는다 — 담당자가 링크를 먼저
     열어 보는 경우가 있는데, 검토 중인 숫자가 후보자에게 새면 안 된다. */
  if (v.st !== 'sent' && v.st !== 'accepted' && v.st !== 'declined') {
    return <OfferLetterClient data={{ status: 'pending', candName: v.candName }} />
  }

  const data: LetterData = {
    status: v.st === 'sent' ? 'read' : 'answered',
    token,
    company: v.company,
    address: v.address,
    candName: v.candName,
    posTitle: v.posTitle,
    dept: v.dept,
    level: v.level,
    base: v.base,
    sign: v.sign,
    equity: v.equity,
    greeting: v.greeting,
    benefits: v.benefits,
    signer: v.signer,
    signerTitle: v.signerTitle,
    ...(v.start ? { startLabel: dayLabel(v.start) } : {}),
    ...(v.orientation ? { orientation: v.orientation } : {}),
    ...(v.replyBy ? { replyByLabel: dayLabel(v.replyBy) } : {}),
    ...(v.st === 'accepted' || v.st === 'declined' ? { answer: v.st } : {}),
  }
  return <OfferLetterClient data={data} />
}
