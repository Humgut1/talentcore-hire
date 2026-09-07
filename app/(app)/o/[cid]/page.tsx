/* 오퍼 상세 — 정적 화면(위) + 액션 패널(가운데) + 설명(아래).
   패널만 클라이언트 컴포넌트다. 나머지는 서버에서 그린 HTML 문자열. */
import Screen from '../../../components/Screen'
import OfferClient from '../../../components/OfferClient'
import { hydrateData } from '../../../lib/db'
import { offerHeadHTML, offerFootHTML } from '../../../lib/render'
import { offerOf, cands } from '../../../lib/data'
import { listSeats, type SeatView } from '../../../lib/actions'

export default async function Page({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params
  await hydrateData()

  const o = offerOf(cid)
  const c = cands.find(x => x.id === cid)

  /* 이 공고가 들고 있는 자리 카드 — 처우안을 쓸 때 어느 자리에 앉히는지
     고르게 한다(T5·D3). TalentCore 가 연결돼 있지 않으면 state 로만 알린다. */
  const seats: SeatView | null = c ? await listSeats(c.p) : null

  return (
    <>
      <Screen html={offerHeadHTML(cid)} />
      {o && c ? <OfferClient offer={o} candName={c.nm} seats={seats} /> : null}
      <Screen html={offerFootHTML(cid)} />
    </>
  )
}
