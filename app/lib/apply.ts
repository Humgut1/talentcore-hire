'use server'
import { serverClient } from './supabase'
import { hydrateData } from './db'
import {
  cands, positions, stagesOf, stageById,
  nextCandId, _addCand, _pushTrail,
  type Candidate,
} from './data'
import { postById } from './careers'
import { putDoc } from './docs'
import { sendCandMail } from './maillog'
import { applyAckMail } from './cand-mail'
import { orgName } from './core'

/* =========================================================
   채용 사이트에서 들어온 지원 접수

   여기가 바깥 세상과 닿는 유일한 쓰기 통로다. 그래서 규칙이 하나 더 있다 —
   화면에서 이미 막았더라도 전부 다시 검사한다. 폼은 브라우저에 있고,
   브라우저는 지원자의 것이라 믿을 수 없다.

   실패해도 지원을 버리지 않는다
     · 파일 저장소가 꺼져 있으면 → 지원은 접수하고, 이력서를 못 받았다고 기록
     · 메일이 꺼져 있으면      → 지원은 접수하고, 확인 메일 미발송으로 기록
   지원자를 잃는 것보다 담당자가 나중에 기록을 보고 챙기는 편이 낫다.
   ========================================================= */

/* 내부 화면이 체류일을 세는 기준일과 같은 값을 쓴다 — 여기만 실제 날짜를 넣으면
   방금 들어온 지원건의 '며칠째'가 음수가 된다. */
const TODAY_ISO = '2026-08-12'

function nowLabel() {
  const n = new Date()
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${n.getMonth() + 1}/${pad(n.getDate())} ${pad(n.getHours())}:${pad(n.getMinutes())}`
}

export interface ApplyState {
  ok: boolean
  /* 사람이 읽는 한 문장. 폼 위에 그대로 뜬다. */
  error?: string
  /* 어느 칸이 문제인지 — 그 칸에 표시를 남긴다 */
  field?: string
  /* 접수된 지원건 번호. 완료 화면이 이걸로 바뀐다 */
  id?: string
}

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

/* 흔한 오타까지 잡을 생각은 없다. 주소 모양이 아닌 것만 거른다 —
   과하게 막으면 멀쩡한 주소를 가진 사람이 지원을 못 한다. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/* 숫자 9~11자리(하이픈·공백·+82 허용) */
const digitsOf = (s: string) => s.replace(/[^\d]/g, '')

export async function submitApplication(
  _prev: ApplyState,
  form: FormData,
): Promise<ApplyState> {
  await hydrateData()

  const pid = str(form, 'pid')
  const post = postById(pid)
  /* 화면을 열어 둔 사이에 공고가 내려갔을 수 있다 */
  if (!post) {
    return { ok: false, error: '이 공고는 마감되었거나 더 이상 지원을 받지 않습니다.' }
  }

  const nm = str(form, 'nm')
  const email = str(form, 'email').toLowerCase()
  const phone = str(form, 'phone')
  const yrRaw = str(form, 'yr')
  const role = str(form, 'role')
  const src = str(form, 'src') || '채용 사이트'
  const note = str(form, 'note')
  const agreed = form.get('agree') === 'on' || form.get('agree') === 'true'

  if (nm.length < 2) return { ok: false, field: 'nm', error: '이름을 입력해 주세요.' }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, field: 'email', error: '메일 주소를 다시 확인해 주세요. 결과를 이 주소로 보내드립니다.' }
  }
  const digits = digitsOf(phone)
  if (digits.length < 9 || digits.length > 12) {
    return { ok: false, field: 'phone', error: '연락처를 다시 확인해 주세요.' }
  }
  const yr = Number(yrRaw)
  if (!Number.isFinite(yr) || yr < 0 || yr > 50) {
    return { ok: false, field: 'yr', error: '경력 연차를 숫자로 입력해 주세요. 신입이면 0을 적어 주세요.' }
  }
  if (!agreed) {
    return { ok: false, field: 'agree', error: '개인정보 수집·이용에 동의하셔야 지원을 접수할 수 있습니다.' }
  }

  /* 같은 공고에 이미 진행 중인 지원건이 있으면 새로 만들지 않는다.
     떨어졌던 사람이 다시 지원하는 것은 막지 않는다 — 그건 정상적인 재지원이다. */
  const dup = cands.find(
    c => c.p === pid && (c.email || '').toLowerCase() === email && !stageById(c.p, c.st).rail,
  )
  if (dup) {
    return {
      ok: false, field: 'email',
      error: '이미 이 공고에 지원하신 내역이 있습니다. 결과는 등록하신 메일로 안내드립니다.',
    }
  }

  const line = stagesOf(pid).filter(s => !s.rail)
  const first = line.find(s => s.kind === 'apply') ?? line[0]
  if (!first) {
    return { ok: false, error: '지금은 지원을 받을 수 없습니다. 잠시 후 다시 시도해 주세요.' }
  }

  const id = nextCandId()
  const row: Candidate = {
    id, nm, p: pid, st: first.id, s: 'idle', d: 0,
    ap: TODAY_ISO, en: TODAY_ISO, why: '', src,
    yr: Math.round(yr), role: role || post.title,
    email, phone,
    ...(note ? { note } : {}),
  }
  _addCand(row)

  /* ---- DB. 마이그레이션 012 전이면 새 칸부터 빼고 다시 넣는다 ---- */
  const sb = serverClient()
  let saveErr: string | undefined
  if (!sb) {
    saveErr = 'not-configured'
  } else {
    const base: Record<string, unknown> = {
      id, position_id: pid, nm, st: first.id, s: 'idle',
      d: 0, ap: TODAY_ISO, en: TODAY_ISO, why: '', src,
      yr: Math.round(yr), role: role || post.title, act: null,
    }
    const extra: Record<string, unknown> = {
      email, phone, note: note || null, privacy_at: new Date().toISOString(),
    }
    let { error } = await sb.from('candidates').insert({ ...base, ...extra })
    if (error) ({ error } = await sb.from('candidates').insert({ ...base, email }))
    if (error) ({ error } = await sb.from('candidates').insert(base))
    saveErr = error?.message
  }

  /* ---- 이력서 파일 ---- */
  const file = form.get('resume')
  let docErr: string | undefined
  if (file instanceof File && file.size > 0) {
    const up = await putDoc({ cid: id, kind: 'resume', file, byNm: nm })
    if (!up.ok) docErr = up.reason
  } else {
    docErr = 'no-file'
  }

  /* ---- 담당자 화면에 남는 한 줄 ---- */
  await pushLine(id, {
    at: nowLabel(),
    b: '채용 사이트로 지원 접수',
    p: [
      `${post.title} · 경력 ${Math.round(yr)}년`,
      `유입 ${src}`,
      docErr === 'no-file' ? '이력서 파일 없음' : docErr ? `이력서 저장 실패(${docErr})` : '이력서 첨부됨',
      '개인정보 수집·이용 동의함',
    ].join(' · '),
    s: docErr && docErr !== 'no-file' ? 'bad' : 'done',
  })

  /* ---- 접수 확인 메일. 안 나가도 접수는 유효하다 ---- */
  const co = (await orgName()) || 'TalentCore'
  const ack = applyAckMail({
    cand: nm, pos: post.title, stage: first.nm, rc: '', company: co, steps: post.steps,
  })
  await sendCandMail({
    cid: id, kind: 'apply-ack', to: email,
    subject: ack.subject, body: ack.body, byNm: '채용 사이트',
  })

  if (saveErr && saveErr !== 'not-configured') {
    /* 저장이 진짜로 실패했으면 접수됐다고 말하면 안 된다 — 화면에만 있는 지원건은
       새로고침 한 번에 사라진다. 지원자에게 다시 시도할 기회를 준다. */
    return { ok: false, error: '접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' }
  }
  return { ok: true, id }
}

/* 기록 한 줄 — 표가 아직 없어도 화면에는 남는다(actions.ts pushTrail 과 같은 규칙). */
async function pushLine(cid: string, t: { at: string; b: string; p: string; s: string }) {
  _pushTrail(cid, t)
  const sb = serverClient()
  if (!sb) return
  await sb.from('stage_events').insert({ candidate_id: cid, ...t })
}

/* 지원 폼이 열릴 때 공고가 아직 살아 있는지만 확인한다.
   positions 를 통째로 넘기지 않으려고 따로 둔다. */
export async function positionStillOpen(pid: string): Promise<boolean> {
  await hydrateData()
  return positions.some(p => p.id === pid && p.st === 'open' && p.pub !== false)
}
