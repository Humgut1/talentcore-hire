import ReviewQueue from '../../components/ReviewQueue'
import { hydrateData } from '../../lib/db'
import { people, me } from '../../lib/data'
import { reviewQueue } from '../../lib/review'
import { currentSession, myViewer } from '../../lib/session'
import RenderScreen from '../../components/RenderScreen'
import { unlinkedScreen } from '../../lib/render'

/* 서류 검토 큐 — 사이드바에 따로 두지 않는다. 입구는 '내 할 일'의 [서류 검토] 카드
   하나다(할 일과 같은 일을 두 군데서 보여주면 겹친다).
   TalentCore 계정은 본인 큐만 본다. 판정이 이 화면 주인의 이름으로 기록되기 때문에,
   남의 큐를 열 수 있으면 남의 이름으로 합격·불합격을 누르게 된다.
   비밀번호 관리자·데모만 ?u= 로 다른 사람 큐를 골라 본다. */
export default async function Page(
  { searchParams }: { searchParams: Promise<{ u?: string }> },
) {
  const { u } = await searchParams
  await hydrateData()
  const v = myViewer(await currentSession())

  if (!v.pick) {
    const who = people.find(x => x.id === v.pid)
    if (!who) return <RenderScreen build={() => unlinkedScreen('서류 검토', 'i-eye-off')} />
    return <ReviewQueue items={reviewQueue(who)} who={who.nm} whoTt={who.tt} picker={[]} />
  }

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
