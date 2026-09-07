/* 후보자 상세 — 머리(위) + 판정 패널(가운데) + 본문(아래).
   패널만 클라이언트 컴포넌트다. 나머지는 서버에서 그린 HTML 문자열.
   (오퍼 상세와 같은 구조. Screen 이 새로고침 때 innerHTML 을 다시 넣기 때문에
    포털로 끼워 넣으면 패널이 떨어져 나간다 — 그래서 위/아래로 쪼갠다.) */
import Screen from '../../components/Screen'
import DecisionClient from '../../components/DecisionClient'
import { hydrateData } from '../../lib/db'
import { candidateHeadHTML, candidateFootHTML } from '../../lib/render'
import { cands, evals, me, personById, posById, stageById, stagesOf } from '../../lib/data'
import { decisionFor } from '../../lib/decision'
import { docsOf } from '../../lib/docs'
import { mailsOf } from '../../lib/maillog'

export default async function Page({ params }: { params: Promise<{ cid: string }> }) {
  const { cid } = await params
  await hydrateData()

  const c = cands.find(x => x.id === cid)
  if (!c) return <Screen html={candidateHeadHTML(cid)} />

  /* 제출서류와 발송 기록은 DB에서 온다 — 화면이 '보낸 척'하지 않게. */
  const [docs, mails] = await Promise.all([docsOf(cid), mailsOf(cid)])

  const cur = stageById(c.p, c.st)
  /* 판정에 쓰는 평가는 '이 단계에서 받은 것'만이다.
     앞 단계 평가까지 섞으면 이미 지난 의견으로 다시 판정하게 된다. */
  const ev = (evals[c.id] || []).filter(e => e.st === cur.nm)
  const ivs = (cur.ivs || []).map(uid => ({ uid, nm: personById(uid)?.nm ?? '면접관' }))
  const view = decisionFor(cur, stagesOf(c.p), ev, ivs)

  return (
    <>
      <Screen html={candidateHeadHTML(cid)} />
      <DecisionClient
        view={view} cid={c.id} cand={c.nm} rj={c.rj}
        pos={posById(c.p).title} sender={me.name}
      />
      <Screen html={candidateFootHTML(cid, docs, mails)} />
    </>
  )
}
