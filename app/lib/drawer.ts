/* =========================================================
   Cadence — 후보자 서랍에 들어갈 것 모으기 (서버 전용)
   ---------------------------------------------------------
   왜 한 곳에서 모으나: 서랍은 '이 사람에 대해 아는 전부'를 담는 자리다.
   화면 조각마다 따로 DB를 읽으면, 같은 사람을 보고 있는데 조각들이
   서로 다른 시점을 말하게 된다. 그래서 서버가 한 번에 다 읽어 넘긴다.

   여기서 계산은 하지 않는다 — 판정은 decision.ts, 조율은 iv-view.ts,
   서류는 docs.ts, 연락은 maillog.ts 가 이미 답을 갖고 있다.
   이 파일은 그 답들을 하나의 봉투에 담을 뿐이다.
   ========================================================= */
import {
  cands, evals, timeline, trail, posById, stageById, stagesOf, personById,
  offerOf, md, daysSince, type TLItem, type EvalItem,
} from './data'
import { decisionFor, rejectDef, SIDE_LABEL, type DecisionView, type RejectCode } from './decision'
import { dupFor, otherApps } from './pool'
import { docsOf, docUrl, type CandDoc } from './docs'
import { mailsOf, type MailRow } from './maillog'
import { mailerStatus } from './mailer'
import { coordRows, coordLog, type CoordRow } from './iv-view'
import { ivSearch, type IvPlanView } from './iv-actions'
import { listSeats, type SeatView } from './actions'
import type { IvEvent } from './iv-store'
import type { Offer } from './offer'

export interface OtherApp {
  id: string; title: string; ap: string; src: string
  stage: string; live: boolean; end?: string
}

export interface DrawerData {
  cid: string; nm: string; role: string; yr: number
  src: string; ap: string; apAgo: number; en: string; days: number
  email?: string
  status: string; why: string
  pos: { id: string; title: string; dept: string; team: string; rec: string; hm: string }
  stage: { id: string; nm: string; color: string; kind: string }
  /* 끝난 카드 */
  rj?: { code: RejectCode; l: string; d: string; side: string; memo?: string; exStage?: string; decided?: string }
  decision: DecisionView
  timeline: TLItem[]
  evals: EvalItem[]
  /* 서류는 '보이는' 것이 기본이다 — 서랍 왼쪽에서 바로 읽힌다.
     그래서 목록을 받는 김에 잠깐 살아 있는 주소까지 여기서 만들어 붙인다.
     화면이 파일을 고를 때마다 서버에 다시 묻게 하면, 이력서 한 장 보는 데
     클릭 한 번과 기다림이 끼어든다. */
  docs: (CandDoc & { url?: string })[]
  mails: MailRow[]
  others: OtherApp[]
  dup?: { title: string; note: string; n: number }
  offer: Offer | null
  seats: SeatView | null
  /* 면접(조율) — 이 후보자의 회차들. sel 이 지금 펼쳐 보고 있는 회차. */
  ivRows: CoordRow[]
  ivSel?: string
  ivDetail: IvPlanView | null
  ivLog: IvEvent[]
  /* 배관 상태 — 화면이 '진짜인 척'하지 않기 위해 그대로 내려보낸다. */
  mailReady: boolean
  sender: string
}

/**
 * 서랍 한 채를 통째로 만든다.
 * @param cid  후보자
 * @param sel  펼쳐 볼 면접 회차(없으면 손댈 것이 있는 회차를 고른다)
 * @param wide 자리 탐색 범위를 넓힐지
 */
export async function drawerData(
  cid: string, sel?: string, wide = false,
): Promise<DrawerData | null> {
  const c = cands.find(x => x.id === cid)
  if (!c) return null

  const p = posById(c.p)
  const sg = stageById(c.p, c.st)
  const ev = evals[cid] || []

  /* 판정에 쓰는 평가는 '이 단계에서 받은 것'만 — 앞 단계 의견으로 다시 판정하지 않는다. */
  const stageEv = ev.filter(e => e.st === sg.nm)
  const ivs = (sg.ivs || []).map(uid => ({ uid, nm: personById(uid)?.nm ?? '면접관' }))

  /* 이 후보자의 면접 회차. 손댈 것이 있는 회차를 기본으로 편다. */
  const rows = coordRows().filter(r => r.cid === cid)
    .sort((a, b) => a.round - b.round)
  const cur = rows.find(r => r.id === sel)
    ?? rows.find(r => r.need)
    ?? rows.filter(r => r.st !== 'done' && r.st !== 'canceled').slice(-1)[0]
    ?? rows[rows.length - 1]

  const [rawDocs, mails, seats, detail] = await Promise.all([
    docsOf(cid),
    mailsOf(cid),
    listSeats(c.p),
    cur && cur.st !== 'confirmed' && cur.st !== 'done' && cur.st !== 'canceled'
      ? ivSearch(cur.id, wide)
      : Promise.resolve(null),
  ])

  /* 비공개 버킷이라 주소는 서명해서만 열린다. 서랍을 열어 두고 읽는 시간을 감안해 30분. */
  const docs = await Promise.all(rawDocs.map(async f => {
    const url = await docUrl(f.path, 1800)
    return url ? { ...f, url } : f
  }))

  const tl: TLItem[] = [
    ...(timeline[cid] || [
      { t: md(c.ap), b: '지원 접수', p: `${c.src} 유입 · 자동 기록`, s: 'done' },
      { t: md(c.en), b: `${sg.nm} 진입`, p: c.why || '자동 진행 중', s: 'now' },
    ]),
    ...(trail[cid] || []).map(t => ({ t: t.at, b: t.b, p: t.p, s: t.s })),
  ]

  const dups = dupFor(cid)
  const dupOne = dups[0]
  const dupOther = dupOne ? (dupOne.a.id === cid ? dupOne.b : dupOne.a) : null

  const rjDef = c.rj ? rejectDef(c.rj) : null

  return {
    cid, nm: c.nm, role: c.role, yr: c.yr,
    src: c.src, ap: md(c.ap), apAgo: daysSince(c.ap), en: md(c.en), days: c.d,
    ...(c.email ? { email: c.email } : {}),
    status: c.s, why: c.why,
    pos: { id: p.id, title: p.title, dept: p.dept, team: p.team, rec: p.rec, hm: p.hm },
    stage: { id: sg.id, nm: sg.nm, color: sg.color, kind: sg.kind },
    ...(rjDef && c.rj ? {
      rj: {
        code: c.rj, l: rjDef.l, d: rjDef.d, side: SIDE_LABEL[rjDef.side],
        ...(c.rjMemo ? { memo: c.rjMemo } : {}),
        ...(c.ex ? { exStage: stageById(c.p, c.ex).nm } : {}),
        ...(c.decided ? { decided: md(c.decided) } : {}),
      },
    } : {}),
    decision: decisionFor(sg, stagesOf(c.p), stageEv, ivs),
    timeline: tl,
    evals: ev,
    docs, mails,
    others: otherApps(c).map(x => {
      const st = stageById(x.p, x.st)
      return {
        id: x.id, title: posById(x.p).title, ap: md(x.ap), src: x.src,
        stage: x.st === 's0' ? (x.rj ? rejectDef(x.rj).l : '종료') : st.nm,
        live: x.st !== 's0',
      }
    }),
    ...(dupOther ? {
      dup: { title: posById(dupOther.p).title, note: dupOne.note, n: dups.length },
    } : {}),
    offer: (offerOf(cid) as Offer | undefined) ?? null,
    seats,
    ivRows: rows,
    ...(cur ? { ivSel: cur.id } : {}),
    ivDetail: detail,
    ivLog: cur ? coordLog(cur.id) : [],
    mailReady: (await mailerStatus()).email,
    sender: p.rec,
  }
}
