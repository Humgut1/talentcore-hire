import ReviewQueue from '../../components/ReviewQueue'
import { hydrateData } from '../../lib/db'
import { people, me } from '../../lib/data'
import { reviewQueue } from '../../lib/review'

/* 로그인이 없는 프로토타입이라 '누구 화면인지'를 ?u= 로 고른다.
   기본값은 서류가 쌓여 있는 사람(주로 HM) — 비어 있는 화면부터 보여주면
   이 기능이 무엇인지 알 수가 없기 때문이다. /todo · /my 와 같은 규칙. */
export default async function Page(
  { searchParams }: { searchParams: Promise<{ u?: string }> },
) {
  const { u } = await searchParams
  await hydrateData()

  /* 볼 게 있는 사람만 칩으로 띄운다. 빈 사람을 늘어놓을 이유가 없다. */
  const picker = people
    .map(p => ({ id: p.id, nm: p.nm, n: reviewQueue(p).length }))
    .filter(x => x.n > 0 || x.id === u)

  const who =
    people.find(x => x.id === u) ??
    people.find(x => x.id === picker[0]?.id) ??
    people.find(x => x.nm === me.name) ??
    people[0]

  return (
    <ReviewQueue
      items={reviewQueue(who)}
      who={who.nm}
      whoTt={who.tt}
      picker={picker}
    />
  )
}
