/* 후보자 상세 — 머리(위) + 판정 패널(가운데) + 본문(아래).
   패널만 클라이언트 컴포넌트다. 나머지는 서버에서 그린 HTML 문자열.
   (오퍼 상세와 같은 구조. Screen 이 새로고침 때 innerHTML 을 다시 넣기 때문에
    포털로 끼워 넣으면 패널이 떨어져 나간다 — 그래서 위/아래로 쪼갠다.) */
import Screen from '../../../components/Screen'
import DecisionClient from '../../../components/DecisionClient'
import StageComments from '../../../components/StageComments'
import EvalPanel from '../../../components/EvalPanel'
import { evalGate } from '../../../lib/evalgate'
import { hydrateData } from '../../../lib/db'
import { candidateHeadHTML, candidateFootHTML } from '../../../lib/render'
import { cands, evals, me, personById, posById, stageById, stagesOf, commentsFor } from '../../../lib/data'
import { decisionFor } from '../../../lib/decision'
import { docsOf, docUrl } from '../../../lib/docs'
import { mailsOf } from '../../../lib/maillog'

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
  const cm = commentsFor(c.id)

  /* 면접 평가 — 이력서를 옆에 펴 둔 채 쓴다(H5). 평가 받는 단계에서만. */
  const gate = evalGate(c.id)
  const showEval = !!gate && gate.gradable && !gate.closed
  const resume = showEval ? (docs.find(f => f.kind === 'resume') ?? docs[0]) : undefined
  const resumeUrl = resume ? await docUrl(resume.path, 1800) : null
  const isPdf = !!resume && (resume.mime === 'application/pdf' || /\.pdf$/i.test(resume.nm))
  const isImg = !!resume && (/^image\//.test(resume.mime ?? '') || /\.(png|jpe?g|gif|webp)$/i.test(resume.nm))

  return (
    <>
      <Screen html={candidateHeadHTML(cid)} />
      <StageComments wrap cid={c.id} actor={me.name} stageNm={cur.nm}
        cur={cm.cur} prior={cm.prior} closed={!!cur.rail} />
      <DecisionClient
        view={view} cid={c.id} cand={c.nm} rj={c.rj}
        pos={posById(c.p).title} sender={me.name}
        {...(cm.cur[0] ? { comment: cm.cur[0].body } : {})}
      />
      {showEval && gate ? (
        <div className="stage" style={{ padding: '16px 26px 0' }}>
          <div className="ev-split">
            <div className="sheet ev-doc">
              {!resume ? (
                <div className="ev-doc-none">올라온 이력서가 없습니다. 서랍에서 이력서를 올리면 이 자리에 펼쳐집니다.</div>
              ) : !resumeUrl ? (
                <div className="ev-doc-none">{resume.nm} — 파일 주소를 만들지 못했습니다.</div>
              ) : isPdf ? (
                <iframe className="ev-doc-f" src={resumeUrl} title={resume.nm} />
              ) : isImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ev-doc-img" src={resumeUrl} alt={resume.nm} />
              ) : (
                <div className="ev-doc-none">
                  {resume.nm} — 브라우저가 바로 펼칠 수 없는 형식입니다.{' '}
                  <a className="btn sm" href={resumeUrl} target="_blank" rel="noopener noreferrer">새 창에서 열기</a>
                </div>
              )}
              {resume ? <div className="ev-doc-bar">{resume.nm}</div> : null}
            </div>
            <EvalPanel gate={gate} />
          </div>
        </div>
      ) : null}
      <Screen html={candidateFootHTML(cid, docs, mails)} />
    </>
  )
}
