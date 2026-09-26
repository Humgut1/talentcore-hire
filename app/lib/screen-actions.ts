'use server'
/* =========================================================
   Screen(AI 1차 면접) — 화면에서 부르는 것 (SC4)
   읽기(screenView)는 GET /api/screen 이 쓰고(데모에서도 읽힘),
   보내기(sendScreen)는 서버 함수라 데모에서 막힌다.
   ========================================================= */
import { need } from './access'
import { hydrateData } from './db'
import { cands, posById, personById } from './data'
import { currentSession } from './session'
import { orgName } from './core'
import { sendCandMail } from './maillog'
import { screenCreate, screenReady, screenSummary, type ScreenSummary } from './screen'

export type ScreenView =
  | ({ ok: true } & ScreenSummary)
  | { ok: false; reason: string }

export async function screenView(cid: string): Promise<ScreenView> {
  await need(['see', cid])
  await hydrateData()
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  if (!screenReady()) return { ok: false, reason: 'off' }
  return screenSummary(cid, c.p)
}

const kdate = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

export async function sendScreen(cid: string): Promise<{
  ok: boolean; reason?: string; link?: string; createUrl?: string; reused?: boolean; mailed?: boolean; mailReason?: string
}> {
  await need(['cand', cid])
  await hydrateData()
  const c = cands.find(x => x.id === cid)
  if (!c) return { ok: false, reason: 'no-candidate' }
  const r = await screenCreate(cid, c.p)
  if (!r.ok) return r.reason === 'no-job' ? { ok: false, reason: 'no-job', createUrl: r.createUrl } : { ok: false, reason: r.reason }

  const pos = posById(c.p)
  const org = await orgName()
  const s = await currentSession()
  const by = (s?.pid ? personById(s.pid)?.nm : undefined) || s?.nm || '채용 담당자'
  const until = kdate(r.expiresAt)
  const m = await sendCandMail({
    cid, kind: 'screen', ...(c.email ? { to: c.email } : {}), byNm: by,
    subject: `[${org}] ${pos?.title ?? '채용'} AI 1차 면접 안내`,
    body: [
      `${c.nm}님, 안녕하세요. ${org} 채용 담당자입니다.`,
      '',
      `${pos?.title ?? ''} 전형의 다음 단계로 AI 1차 면접을 안내드립니다.`,
      '편한 시간에 아래 링크로 들어가 질문에 글로 답하시면 됩니다. 중간에 멈췄다가 같은 링크로 이어서 할 수 있습니다.',
      '',
      r.link,
      '',
      until ? `링크는 ${until}까지 열려 있습니다.` : '',
      '답변은 채용 담당자가 직접 읽고 판단합니다. AI 가 합격·불합격을 정하지 않습니다.',
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'),
  })
  return { ok: true, link: r.link, reused: r.reused, mailed: m.ok, ...(m.reason ? { mailReason: m.reason } : {}) }
}
