import BriefClient from '../../../../components/BriefClient'
import { hydrateData } from '../../../../lib/db'
import { briefFor } from '../../../../lib/brief'

/* 외부 면접관 링크 ② — 면접 브리핑.
   계정 없이 링크만으로 열린다. 계산은 전부 lib/brief.ts 에서 끝내고
   결과만 클라이언트로 내려보낸다(다른 후보자·파이프라인은 애초에 담기지 않는다). */
export default async function Page(
  { params }: { params: Promise<{ cid: string; uid: string }> },
) {
  const { cid, uid } = await params
  await hydrateData()
  return <BriefClient data={briefFor(cid, uid)} />
}
