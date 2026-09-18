/* =========================================================
   Cadence — 오퍼레터 (서버 전용) · 오퍼 O2
   ---------------------------------------------------------
   지금까지 [오퍼 발송]은 상태만 'sent' 로 바꿨다. 후보자에게는
   아무것도 가지 않았고, 담당자가 따로 메일을 써서 보냈다.
   그러면 무엇을 약속했는지가 Hire 밖에 남는다.

   그래서 오퍼레터는 **뼈대 고정 + 문안만 설정**으로 만든다.
   자유 편집기는 두지 않는다 — 처우·입사일·회신 기한은 시스템이 아는
   값이고, 사람이 손으로 옮겨 적는 순간 화면의 숫자와 메일의 숫자가
   달라진다(그 차이는 분쟁이 된다).

     뼈대(여기)      받는 사람 · 처우 · 입사일 · 회신 기한 · 수락/거절 링크
     문안(TalentCore) 인사말 · 복리후생 · 서명자 · 스톡옵션 공통 조건

   스톡옵션은 **조건만** 적는다. 현재가치는 계산하지 않는다 —
   비상장 주식은 근거 있는 값을 낼 수 없고, 숫자를 적으면 회사가
   그 가치를 보장한 것으로 읽힌다.
   ========================================================= */
import { cands, posById } from './data'
import { offerOf } from './data'
import { won, type Offer } from './offer'
import { fetchOfferLetter, fetchStartRule, coreState } from './core'
import { issueLinkToken } from './gate'
import { appOrigin } from './origin'

export const LETTER_KIND = 'offer'
/** 링크가 살아 있는 기간 — 회신 기한(기본 7일)보다 넉넉하게. */
export const LETTER_DAYS = 60

export interface LetterEquity {
  units: number
  strike: number          // 1주 행사가(원)
  vestYears: number
  cliffMonths: number
  note: string
}

/** 후보자 화면과 메일이 같은 내용을 말하도록, 만들어 둔 한 벌. */
export interface LetterView {
  cid: string
  st: Offer['st']
  company: string
  address: string
  candName: string
  posTitle: string
  dept: string
  level: string
  base: number            // 만원
  sign: number
  equity: LetterEquity | null
  start?: string          // YYYY-MM-DD
  orientation?: string    // '첫날 10:00~11:30 교육장'
  greeting: string
  benefits: string[]
  signer: string
  signerTitle: string
  replyBy?: string        // YYYY-MM-DD — 발송일 + 회신 기한
  replyDays: number
  declineCode?: string
  /* 문안을 TalentCore 에서 못 읽었는가 — 화면은 그대로 그리되
     담당자에게는 사실을 알려 준다(후보자 화면에는 나오지 않는다). */
  letterOffline: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' 에 며칠을 더한다. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d + n)
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${y}년 ${m}월 ${d}일(${DOW[new Date(y, m - 1, d).getDay()]})`
}

/** 후보자에게 줄 주소 — 서명이 붙어 있어 남의 번호로 바꿔도 열리지 않는다. */
export async function letterUrl(cid: string): Promise<string> {
  const t = await issueLinkToken(LETTER_KIND, cid, LETTER_DAYS)
  return t ? `${appOrigin()}/offer/${t}` : ''
}

/** 오퍼 한 건을 '레터 한 장'으로 만든다. 없는 오퍼면 null. */
export async function letterViewOf(cid: string): Promise<LetterView | null> {
  const o = offerOf(cid) as Offer | undefined
  const c = cands.find(x => x.id === cid)
  if (!o || !c) return null
  const pos = posById(c.p)

  const r = coreState() === 'configured' ? await fetchOfferLetter() : null
  const L = r?.ok ? r.letter : null

  /* 입사일이 잡혀 있으면 첫날 안내까지 붙인다 — 오리엔테이션 시간은
     TalentCore 온보딩 규칙이 정한다(Hire 에 적어 두지 않는다). */
  let orientation: string | undefined
  if (o.start && coreState() === 'configured') {
    const sr = await fetchStartRule(52)
    if (sr.ok && sr.rule.orientation.start) {
      const ori = sr.rule.orientation
      orientation = `첫날 ${ori.start}~${ori.end} ${ori.roomName || ori.room} 오리엔테이션`
    }
  }

  const replyDays = L?.replyDays ?? 7
  const equity: LetterEquity | null = o.equityUnits
    ? {
      units: o.equityUnits,
      strike: o.equityStrike ?? 0,
      vestYears: L?.equity.vestYears ?? 4,
      cliffMonths: L?.equity.cliffMonths ?? 12,
      note: L?.equity.note ?? '스톡옵션은 비상장 주식을 살 수 있는 권리이며, 미래 가치는 보장되지 않습니다.',
    }
    : null

  return {
    cid, st: o.st,
    company: L?.company.name || 'TalentCore',
    address: L?.company.address || '',
    candName: c.nm,
    posTitle: pos.title,
    dept: pos.dept || '',
    level: o.level && o.level !== '—' ? o.level : '',
    base: o.base, sign: o.sign,
    equity,
    ...(o.start ? { start: o.start } : {}),
    ...(orientation ? { orientation } : {}),
    greeting: L?.greeting || '함께 일하게 되어 기쁩니다. 아래와 같이 입사 조건을 안내드립니다.',
    benefits: L?.benefits ?? [],
    signer: L?.signer || '',
    signerTitle: L?.signerTitle || '',
    ...(o.sentAt ? { replyBy: addDays(o.sentAt, replyDays) } : {}),
    replyDays,
    ...(o.declineCode ? { declineCode: o.declineCode } : {}),
    letterOffline: !L,
  }
}

/* ---------------------------------------------------------
   메일 본문 — 화면과 같은 값을 같은 순서로.
   HTML 을 쓰지 않는 이유: 메일 프로그램마다 다르게 깨지고,
   후보자는 결국 링크를 눌러 화면에서 읽는다. 메일은 안내장이다.
   --------------------------------------------------------- */
export function letterMail(v: LetterView, url: string): { subject: string; body: string } {
  const lines: string[] = []
  lines.push(`${v.candName} 님, 안녕하세요. ${v.company} 채용팀입니다.`)
  lines.push('')
  lines.push(v.greeting)
  lines.push('')
  lines.push(`■ 공고 — ${v.posTitle}${v.dept ? ` (${v.dept})` : ''}`)
  if (v.level) lines.push(`■ 직급 — ${v.level}`)
  lines.push(`■ 기본 연봉 — ${won(v.base)}`)
  if (v.sign) lines.push(`■ 사이닝 보너스 — ${won(v.sign)} (입사 후 1회)`)
  if (v.equity) {
    lines.push(`■ 스톡옵션 — ${v.equity.units.toLocaleString('ko-KR')}주`
      + (v.equity.strike ? ` · 행사가 ${v.equity.strike.toLocaleString('ko-KR')}원` : '')
      + ` · ${v.equity.vestYears}년 베스팅`
      + (v.equity.cliffMonths ? ` (${v.equity.cliffMonths}개월 클리프)` : ''))
    if (v.equity.note) lines.push(`   ${v.equity.note}`)
  }
  if (v.start) lines.push(`■ 입사 예정일 — ${dayLabel(v.start)}${v.orientation ? ` · ${v.orientation}` : ''}`)
  if (v.benefits.length) {
    lines.push('')
    lines.push('■ 복리후생')
    v.benefits.forEach(b => lines.push(`   · ${b}`))
  }
  lines.push('')
  if (v.replyBy) lines.push(`회신 기한은 ${dayLabel(v.replyBy)} 까지입니다.`)
  lines.push('아래 주소에서 오퍼 내용을 확인하시고 수락 또는 거절을 알려 주세요.')
  lines.push(url || '(주소를 만들지 못했습니다 — 채용 담당자에게 문의해 주세요)')
  lines.push('')
  lines.push('궁금한 점은 이 메일에 그대로 회신해 주시면 됩니다.')
  lines.push('')
  lines.push(v.signer ? `${v.company} ${v.signer}${v.signerTitle ? ` ${v.signerTitle}` : ''}` : `${v.company} 채용팀`)
  return {
    subject: `[${v.company}] ${v.posTitle} 오퍼 안내 — ${v.candName} 님`,
    body: lines.join('\n'),
  }
}
