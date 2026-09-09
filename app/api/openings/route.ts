/* =========================================================
   POST /api/openings — TalentCore 가 승인된 '자리'를 밀어 넣는 문 (T3)
   ---------------------------------------------------------
   흐름 한 줄:
     TalentCore 채용 요청서 결재 통과 → 자리 카드 N장 생성 →
     인사담당자가 그중 몇 장을 골라 [Hire 로 보내기] →  여기로 들어온다 →
     Hire 에 공고 1건이 열리고, 그 번호(p12)를 TalentCore 가 되돌려 받아
     자리 카드마다 external_ref 로 적어 둔다.

   설계상 지켜야 하는 것:
   · 자리 카드 3장 = 공고 1개. 보드를 3개로 쪼개지 않는다.
   · 단계(전형 프로세스)는 TalentCore 가 정하지 않는다. 기본 템플릿으로 열고,
     리크루터가 /p/{id}/setup 에서 다듬는다. 조직·정원은 TalentCore 의 것이고
     전형 설계는 Hire 의 것이라는 경계를 여기서 무너뜨리지 않는다.
   · 같은 자리 카드가 두 번 들어오면 공고를 또 만들지 않는다(409 + 기존 번호).
     네트워크가 끊겨 TalentCore 가 응답을 못 받고 재시도하는 경우가 실제로 있다.

   인증은 lib/inbound.ts 의 토큰 하나. 토큰이 없으면 문 자체가 닫혀 있다(503).
   ========================================================= */
import { NextResponse } from 'next/server'
import { checkInbound } from '../../lib/inbound'
import { hydrateData } from '../../lib/db'
import { positions, people, personById } from '../../lib/data'
import { createPosition, setPersonRoles } from '../../lib/actions'

export const dynamic = 'force-dynamic'

interface OpeningIn { id?: number | string; code?: string }
/* 요청서가 지목한 사람 한 명. 사번이 먼저다 — 동명이인이 있는 회사에서
   이름만으로 고르면 엉뚱한 사람에게 면접이 잡힌다. */
interface PanelPerson { emp_no?: string; name?: string }
interface Body {
  title?: string
  dept?: string
  team?: string
  emp?: string            // 한글 라벨 그대로 ('정규직'). 코드가 아니다.
  band_lo?: number
  band_hi?: number
  jd?: string
  target_start?: string   // 희망 입사일 (YYYY-MM-DD)
  hire_type?: string      // 신규 채용 / 결원 충원 …
  req_ref?: string        // REQ-12
  level?: string          // 자리 카드의 직급 라벨 (L4 — Senior)
  openings?: OpeningIn[]
  recruiter?: string      // Hire 쪽 담당자 이름. 없으면 첫 리크루터가 맡는다.
  hiring_manager?: string
  /* 면접관 세 자리. TalentCore 요청서가 이미 알고 있는 사람들이다.
     hm = 부서장(1차) · upper = 차상위 리더 · collab = 요청서에서 고른 협업 리더(2차). */
  panel?: { hm?: PanelPerson | null; upper?: PanelPerson | null; collab?: PanelPerson | null }
}

const bad = (msg: string, status = 400) =>
  NextResponse.json({ ok: false, error: msg }, { status })

export async function POST(req: Request) {
  const auth = checkInbound(req)
  if (!auth.ok) return bad(auth.error || 'unauthorized', auth.status)

  let b: Body
  try { b = await req.json() } catch { return bad('본문이 JSON 이 아닙니다') }

  const title = (b.title || '').trim()
  if (!title) return bad('title 이 비어 있습니다')

  const codes = (b.openings || [])
    .map(o => String(o.code || '').trim())
    .filter(Boolean)
  if (!codes.length) return bad('openings 가 비어 있습니다 — 보낼 자리를 하나 이상 골라야 합니다')

  await hydrateData()

  /* 재시도 방어 — 이미 들어온 자리 카드가 하나라도 섞여 있으면 새로 만들지 않는다. */
  const dup = positions.find(p => (p.openingCodes || []).some(c => codes.includes(c)))
  if (dup) {
    return NextResponse.json({
      ok: false, error: 'already-linked',
      message: `이 자리는 이미 공고 ${dup.id}(${dup.title})로 넘어와 있습니다`,
      position_id: dup.id,
    }, { status: 409 })
  }

  /* 담당자 — T4(직원 명부 연동) 전까지 Hire 명부는 Hire 것이다.
     이름이 맞으면 그 사람, 아니면 각 역할의 첫 사람이 맡는다. */
  const pick = (nm: string | undefined, role: string) => {
    const pool = people.filter(p => p.roles.includes(role))
    const hit = nm ? pool.find(p => p.nm === nm.trim()) : undefined
    return (hit || pool[0])?.nm || ''
  }
  const rec = pick(b.recruiter, '리크루터')

  /* ---- 면접관 세 자리 ----
     TalentCore 는 사번과 이름을 함께 보낸다. 사번이 맞으면 그 사람이고,
     사번이 없거나 아직 명부 동기화 전이면 이름으로 한 번 더 찾아본다.
     못 찾으면 그 자리는 비워 둔 채로 공고를 연다 — 여기서 실패시키면
     사람 하나 안 맞았다고 채용 전체가 안 열린다. 대신 응답에 적어 보낸다. */
  const findPerson = (p?: PanelPerson | null): string | undefined => {
    if (!p) return undefined
    const no = (p.emp_no || '').trim()
    const nm = (p.name || '').trim()
    const live = people.filter(x => x.active !== false)
    const byNo = no ? live.find(x => (x.empNo || '') === no) : undefined
    if (byNo) return byNo.id
    if (!nm) return undefined
    const hits = live.filter(x => x.nm === nm)
    /* 동명이인이면 고르지 않는다. 아무나 집어넣는 것보다 비워 두는 게 낫다. */
    return hits.length === 1 ? hits[0].id : undefined
  }
  const hmId = findPerson(b.panel?.hm)
  const upperId = findPerson(b.panel?.upper)
  const collabId = findPerson(b.panel?.collab)
  const missing = [
    b.panel?.hm && !hmId ? '부서장' : null,
    b.panel?.upper && !upperId ? '차상위 리더' : null,
    b.panel?.collab && !collabId ? '협업 리더' : null,
  ].filter(Boolean) as string[]

  /* 공고 머리의 HM 이름 — 요청서가 지목한 부서장이 주인이다.
     못 찾았을 때만 Hire 명부의 첫 하이어링 매니저로 떨어진다. */
  const hm = (hmId ? personById(hmId)?.nm : '') || pick(b.hiring_manager, '하이어링 매니저')

  /* 면접 역할을 달아 준다. TalentCore 에서 넘어온 사람은 역할이 비어 있어서
     단계 설정 화면의 면접관 목록에 아예 안 뜬다 — 배정은 됐는데 화면에서는
     안 보이는, 제일 헷갈리는 상태가 된다. 역할은 Hire 것이라 동기화가
     덮어쓰지 않으니 여기서 붙여도 안전하다. */
  for (const [uid, extra] of [
    [hmId, ['인터뷰어', '하이어링 매니저']],
    [upperId, ['인터뷰어']],
    [collabId, ['인터뷰어']],
  ] as [string | undefined, string[]][]) {
    if (!uid) continue
    const cur = personById(uid)?.roles || []
    const add = extra.filter(r => !cur.includes(r))
    if (add.length) await setPersonRoles(uid, [...cur, ...add])
  }

  /* 희망 입사일·채용 유형은 Hire 에 담을 칸이 없다. 칸을 새로 파기보다
     JD 머리에 한 줄로 남긴다 — 리크루터가 실제로 보는 자리가 거기다. */
  const head = [
    b.req_ref ? `TalentCore 요청 ${b.req_ref}` : null,
    codes.length > 1 ? `자리 ${codes.length}장 (${codes.join(', ')})` : `자리 ${codes[0]}`,
    b.hire_type || null,
    b.target_start ? `희망 입사일 ${b.target_start}` : null,
  ].filter(Boolean).join(' · ')
  const jd = [`※ ${head}`, '', (b.jd || '').trim()].join('\n').trim()

  const r = await createPosition({
    title,
    dept: (b.dept || '').trim(),
    team: (b.team || b.dept || '').trim(),
    emp: (b.emp || '정규직').trim(),
    rec, hm,
    bandLo: Math.max(0, Number(b.band_lo) || 0),
    bandHi: Math.max(0, Number(b.band_hi) || 0),
    jd,
    template: 'std',
    reqRef: (b.req_ref || '').trim() || undefined,
    level: (b.level || '').trim() || undefined,
    openingCodes: codes,
    panel: {
      ...(hmId ? { r1: [hmId] } : {}),
      ...((upperId || collabId)
        ? { r2: [upperId, collabId].filter(Boolean) as string[] }
        : {}),
    },
  })

  if (!r.ok || !r.id) return bad(r.reason || 'create-failed', 500)

  const origin = new URL(req.url).origin
  return NextResponse.json({
    ok: true,
    position_id: r.id,
    openings: codes.length,
    /* 공고에는 자체 첫 화면이 없다 — 보드가 곧 그 공고의 얼굴이다. */
    board_url: `${origin}/p/${r.id}/board`,
    setup_url: `${origin}/p/${r.id}/setup`,
    /* Supabase 가 아직 안 붙은 개발 환경이면 서버가 꺼질 때 사라진다는 뜻 */
    ...(missing.length ? { panel_missing: missing } : {}),
    ...(r.reason === 'not-configured' ? { warning: 'not-configured' } : {}),
  })
}
