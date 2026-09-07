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
import { positions, people } from '../../lib/data'
import { createPosition } from '../../lib/actions'

export const dynamic = 'force-dynamic'

interface OpeningIn { id?: number | string; code?: string }
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
  openings?: OpeningIn[]
  recruiter?: string      // Hire 쪽 담당자 이름. 없으면 첫 리크루터가 맡는다.
  hiring_manager?: string
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
  const hm = pick(b.hiring_manager, '하이어링 매니저')

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
    openingCodes: codes,
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
    ...(r.reason === 'not-configured' ? { warning: 'not-configured' } : {}),
  })
}
