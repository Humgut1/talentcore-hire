/* =========================================================
   TalentCore(HRIS)로 나가는 문 — 직원 명부 읽어오기 (T4)
   ---------------------------------------------------------
   T3 은 반대 방향이었다. TalentCore 가 승인된 자리를 Hire 로 밀어 넣었고,
   Hire 는 받기만 했다(lib/inbound.ts). 자리는 한 번 정해지면 끝이라 밀어도 됐다.

   직원 명부는 다르다. 입사·퇴사·부서이동이 매일 일어난다. 바뀔 때마다 밀면
   전송이 한 번 실패했을 때 두 시스템이 어긋난 채로 남고, 아무도 모른다.
   당겨오면 다음 회차에 저절로 맞춰진다. Greenhouse·Workday·Ashby 전부 이 방향이다.

   구글·메일·inbound 와 같은 3상태 규칙을 따른다.

     unconfigured  주소나 열쇠가 없다 → 아무 일도 안 한다. 화면에는
                   "TalentCore 연동 안 됨"이라고만 뜬다.
     configured    둘 다 있다 → 당겨올 수 있다.

   열쇠는 TalentCore /hires 화면에서 발급하는 테넌트 API 토큰이다.
   합격자를 보낼 때(/api/hires) 쓰는 것과 같은 열쇠 하나를 쓴다.
   ※ 이 값은 비밀이다. 저장소에 올리지 않는다(.env.local, gitignore).
   ========================================================= */

export type CoreState = 'unconfigured' | 'configured'

export interface CorePerson {
  emp_no: string
  name: string
  email: string | null
  title: string
  /* TalentCore 직급 레벨 1~9. 실장 8 / 본부장·부문장 9.
     '실장 이상이 면접관이면 발송 전 확인' 규칙이 이 값을 본다. */
  level?: number | null
  dept: string
  role: string                 // admin / manager / recruiter / employee
  active: boolean
  employment_type?: string | null
  hire_date?: string | null
  manager_emp_no?: string | null
}

export interface CoreDirectory {
  ok: true
  as_of: string
  org?: string                 // 우리 회사 이름 — 주인은 TalentCore 다
  count: number
  active: number
  people: CorePerson[]
}

function conf() {
  const url = (process.env.CORE_URL || '').trim().replace(/\/+$/, '')
  const token = (process.env.CORE_API_TOKEN || '').trim()
  return { url, token }
}

export function coreState(): CoreState {
  const { url, token } = conf()
  return url && token ? 'configured' : 'unconfigured'
}

/** 화면에 보여줄 만큼만 — 주소는 보여도 되지만 열쇠는 절대 내보내지 않는다. */
export function coreLabel(): string {
  return conf().url || ''
}

export type FetchResult =
  | { ok: true; dir: CoreDirectory }
  | { ok: false; reason: 'not-configured' | 'unauthorized' | 'unreachable' | 'bad-response'; detail?: string }

/** TalentCore 직원 명부를 통째로 읽어온다. 퇴사자도 active=false 로 함께 온다. */
export async function fetchDirectory(): Promise<FetchResult> {
  const { url, token } = conf()
  if (!url || !token) return { ok: false, reason: 'not-configured' }

  let res: Response
  try {
    res = await fetch(`${url}/api/directory`, {
      headers: { 'X-API-Token': token, Accept: 'application/json' },
      cache: 'no-store',
      /* 155명이면 한 번에 온다. 그래도 TalentCore 가 멈춰 있을 때
         Hire 화면이 같이 멈추면 안 되니 20초에서 끊는다. */
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    return { ok: false, reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) }
  }

  if (res.status === 401) return { ok: false, reason: 'unauthorized' }
  if (!res.ok) return { ok: false, reason: 'bad-response', detail: `HTTP ${res.status}` }

  let body: unknown
  try { body = await res.json() } catch { return { ok: false, reason: 'bad-response', detail: 'JSON 아님' } }

  const d = body as Partial<CoreDirectory>
  if (!d || d.ok !== true || !Array.isArray(d.people))
    return { ok: false, reason: 'bad-response', detail: '명부 모양이 다릅니다' }

  return { ok: true, dir: d as CoreDirectory }
}

/* ---------------------------------------------------------
   회사 이름 하나만 필요할 때
   ---------------------------------------------------------
   후보자에게 나가는 메일이 "TalentCore 채용 담당 정수민입니다" 로 시작한다.
   이 이름의 주인은 TalentCore 다 — Hire 에 따로 적어 두면 저쪽에서 바꿨을 때
   조용히 어긋나고, 그 사실을 아무도 모른 채 후보자에게 옛 이름이 나간다.

   그래서 명부와 같은 문(/api/directory)에서 같이 받아 온다. 메일 한 통마다
   TalentCore 를 두드리면 느리고 취약하니 10분만 기억한다. 연동이 없거나
   TalentCore 가 멈춰 있으면 .env 의 NEXT_PUBLIC_ORG_NAME 으로, 그것도 없으면
   빈 문자열로 떨어진다 — 빈 값은 문장에서 통째로 빠지게 되어 있다.
   엉뚱한 이름이 나가는 것보다 이름이 없는 편이 낫다.
   --------------------------------------------------------- */
let orgCache: { nm: string; at: number } | null = null
const ORG_TTL = 10 * 60_000

export function orgFallback(): string {
  return (process.env.NEXT_PUBLIC_ORG_NAME || '').trim()
}

export async function orgName(): Promise<string> {
  if (orgCache && Date.now() - orgCache.at < ORG_TTL) return orgCache.nm
  const { url, token } = conf()
  if (!url || !token) return orgFallback()
  try {
    const res = await fetch(`${url}/api/directory`, {
      headers: { 'X-API-Token': token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return orgFallback()
    const d = (await res.json()) as Partial<CoreDirectory>
    const nm = (d?.org || '').trim()
    if (!nm) return orgFallback()
    orgCache = { nm, at: Date.now() }
    return nm
  } catch {
    return orgFallback()
  }
}

/* =========================================================
   자리 카드 — 당겨오기 (T5)
   ---------------------------------------------------------
   공고 하나가 자리 카드 여러 장을 들고 있다(007). 그런데 카드마다
   레벨이 다르다. TalentCore 요청서에 "L5 1명 · L3 2명"이라고 적으면
   카드도 그대로 떨어진다.

   그래서 "이 공고에 남은 자리가 몇이고, 각 자리가 몇 레벨인가"를
   Hire 가 알아야 한다. 명부와 같은 이유로 당겨온다 — 자리는 채워지고
   닫히고 늘어난다. 밀어주면 한 번 실패한 전송이 두 시스템을 어긋난 채
   남기고, 남은 자리를 잘못 센 채로 오퍼가 나간다.
   ========================================================= */

export interface CoreSeat {
  code: string
  seq: number
  state: 'approved' | 'open' | 'reserved' | 'filled' | 'closed'
  open: boolean               // 아직 앉힐 수 있는가
  level: number | null        // TalentCore 레벨 1~9
  level_label: string         // "L5 Staff"
  family: string | null
  band: [number, number]      // 만원
  title: string
  who: string | null          // 앉은 사람 또는 예약한 입사 예정자
  start: string | null
  req_ref: string
}

export type SeatResult =
  | { ok: true; seats: CoreSeat[]; open: number }
  | { ok: false; reason: 'not-configured' | 'unauthorized' | 'unreachable' | 'bad-response'; detail?: string }

/** 요청서 번호(REQ-12)로 그 요청서에서 떨어진 자리 카드를 전부 가져온다. */
export async function fetchSeats(reqRef: string): Promise<SeatResult> {
  const { url, token } = conf()
  if (!url || !token) return { ok: false, reason: 'not-configured' }
  if (!reqRef.trim()) return { ok: false, reason: 'bad-response', detail: '요청서 번호가 없습니다' }

  let res: Response
  try {
    res = await fetch(`${url}/api/openings?req_ref=${encodeURIComponent(reqRef.trim())}`, {
      headers: { 'X-API-Token': token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    return { ok: false, reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) }
  }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' }
  if (!res.ok) return { ok: false, reason: 'bad-response', detail: `HTTP ${res.status}` }

  let body: unknown
  try { body = await res.json() } catch { return { ok: false, reason: 'bad-response', detail: 'JSON 아님' } }
  const d = body as { ok?: boolean; seats?: CoreSeat[]; open?: number }
  if (!d || d.ok !== true || !Array.isArray(d.seats))
    return { ok: false, reason: 'bad-response', detail: '포지션 대장 모양이 다릅니다' }

  return { ok: true, seats: d.seats, open: d.open ?? d.seats.filter(s => s.open).length }
}

/* =========================================================
   합격자 — 밀어내기 (T5)
   ---------------------------------------------------------
   여기만 방향이 반대다. "오퍼를 수락했다"는 한 번 일어나는 사건이라
   당겨올 게 없다. TalentCore 가 Hire 를 주기적으로 긁게 하면
   합격 순간과 입사 준비 사이가 벌어진다.

   실패해도 Hire 쪽 수락은 되돌리지 않는다(soft-fail). 후보자는 이미
   수락했고, 그 사실이 사라지면 안 된다. 대신 실패 사유를 돌려주어
   화면이 "TalentCore 에 전달하지 못했습니다"를 말할 수 있게 한다.
   ========================================================= */

export interface HirePush {
  name: string
  email?: string | null
  phone?: string | null
  start_date?: string | null
  department?: string | null
  position?: string | null
  job_title?: string | null
  salary?: number | null        // 원 단위 (연봉)
  memo?: string | null
  opening_code?: string | null  // 어느 자리에 앉는가
  req_ref?: string | null
  candidate_ref?: string | null // Hire 후보자 id — 나중에 역추적용
}

export type PushResult =
  | { ok: true; id: number; openingCode: string | null }
  | { ok: false; reason: 'not-configured' | 'unauthorized' | 'unreachable' | 'rejected'; detail?: string }

/** 합격자를 TalentCore 입사 예정자로 보낸다. 자리가 이미 찼으면 409 로 막힌다. */
export async function pushHire(p: HirePush): Promise<PushResult> {
  const { url, token } = conf()
  if (!url || !token) return { ok: false, reason: 'not-configured' }

  let res: Response
  try {
    res = await fetch(`${url}/api/hires`, {
      method: 'POST',
      headers: { 'X-API-Token': token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(p),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    return { ok: false, reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) }
  }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' }

  let body: {
    ok?: boolean; id?: number; opening_code?: string | null; error?: string; detail?: string
    next_dates?: string[]
  } = {}
  try { body = await res.json() } catch { /* 본문이 없을 수도 있다 */ }

  if (!res.ok || body.ok !== true) {
    /* 입사일 규칙에 걸리면(422) 가까운 입사일을 같이 보여 줘야 바로 고칠 수 있다. */
    const next = body.next_dates?.length ? ` — 가까운 입사일 ${body.next_dates.join(', ')}` : ''
    return { ok: false, reason: 'rejected', detail: (body.detail || body.error || `HTTP ${res.status}`) + next }
  }

  return { ok: true, id: body.id ?? 0, openingCode: body.opening_code ?? null }
}

/* =========================================================
   입사 가능일 — 당겨오기 (회의실·온보딩 V1 W3)
   ---------------------------------------------------------
   입사 요일(월·수)·공휴일·첫날 오리엔테이션 시간은 TalentCore 가 정한다.
   Hire 는 오퍼에서 이 목록 안에서만 입사일을 고르게 한다. 규칙을 Hire 에
   따로 적어 두면 TalentCore 에서 요일을 바꾸는 순간 두 곳이 어긋난다.
   보낼 때(/api/hires) TalentCore 가 한 번 더 검사하므로 여기는 '안내'다.
   ========================================================= */

export interface StartRule {
  dates: string[]             // YYYY-MM-DD, 가까운 순
  label: string               // "월·수"
  orientation: { room: string; roomName: string; start: string; end: string }
}

export type StartRuleResult =
  | { ok: true; rule: StartRule }
  | { ok: false; reason: 'not-configured' | 'unauthorized' | 'unreachable' | 'bad-response'; detail?: string }

/** 오늘부터 입사 가능일 n개(기본 26개 ≈ 석 달). */
export async function fetchStartRule(n = 26): Promise<StartRuleResult> {
  const { url, token } = conf()
  if (!url || !token) return { ok: false, reason: 'not-configured' }

  let res: Response
  try {
    res = await fetch(`${url}/api/workplace/start-dates?n=${n}`, {
      headers: { 'X-API-Token': token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    return { ok: false, reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) }
  }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' }
  if (!res.ok) return { ok: false, reason: 'bad-response', detail: `HTTP ${res.status}` }

  let body: unknown
  try { body = await res.json() } catch { return { ok: false, reason: 'bad-response', detail: 'JSON 아님' } }
  const d = body as {
    ok?: boolean; dates?: { date: string }[]; weekdays_label?: string
    orientation?: { room?: string; room_name?: string; start?: string; end?: string }
  }
  if (!d || d.ok !== true || !Array.isArray(d.dates))
    return { ok: false, reason: 'bad-response', detail: '입사 가능일 모양이 다릅니다' }

  const o = d.orientation ?? {}
  return {
    ok: true,
    rule: {
      dates: d.dates.map(x => x.date),
      label: d.weekdays_label ?? '',
      orientation: { room: o.room ?? '', roomName: o.room_name ?? '', start: o.start ?? '', end: o.end ?? '' },
    },
  }
}

/* =========================================================
   면접실 — 추천 받기 · 잡기 · 놓기 (회의실·온보딩 V1 W5)
   ---------------------------------------------------------
   방·층·장비·다른 예약은 TalentCore 것이다. Hire 는 "언제, 몇 명, 대면/화상"만 알려 주고
   추천을 받아 채용 담당이 고른다. 자동 배정은 하지 않는다 —
   인원이나 면접 성격(임원 면접, 과제 발표 등)에 따라 맞는 방이 달라서.
   같은 면접은 ref(면접 id) 하나로 묶인다. 다시 잡으면 방이 바뀌고, 놓으면 풀린다.
   ========================================================= */
export interface CoreRoom {
  code: string
  name: string
  floor: number
  type_label: string
  capacity: number
  equipment: string[]
  reasons: string[]
  busy?: string                // 이 시간에 이미 있는 예약 한 줄
}
export interface CoreRoomBooking {
  id: number
  room: string
  name: string
  floor: number | null
  start: string                // 'YYYY-MM-DD HH:MM' — 30분 칸에 맞춰 넓힌 시간
  end: string
  label: string                // '1층 1면접실'
}
export interface CoreRoomRecs {
  configured: boolean          // TalentCore 에 건물·회의실이 등록돼 있는가
  rooms: CoreRoom[]
  busy: CoreRoom[]
  booked: CoreRoomBooking | null
  site: { building: string; address: string }
  start?: string
  end?: string
}
type CoreFail = { ok: false; reason: 'not-configured' | 'unauthorized' | 'unreachable' | 'bad-response' | 'rejected'; detail?: string }

async function coreJson(path: string, init?: { method?: string; body?: unknown }):
  Promise<{ ok: true; status: number; body: Record<string, unknown> } | CoreFail> {
  const { url, token } = conf()
  if (!url || !token) return { ok: false, reason: 'not-configured' }
  let res: Response
  try {
    res = await fetch(`${url}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        'X-API-Token': token, Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    return { ok: false, reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) }
  }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' }
  let body: Record<string, unknown>
  try { body = await res.json() } catch { return { ok: false, reason: 'bad-response', detail: `HTTP ${res.status}` } }
  return { ok: true, status: res.status, body }
}

export async function fetchRoomRecs(q: {
  date: string; start: string; end: string; people: number; mode: 'onsite' | 'video'; ref: string
}): Promise<{ ok: true; recs: CoreRoomRecs } | CoreFail> {
  const p = new URLSearchParams({ ...q, people: String(q.people) })
  const r = await coreJson(`/api/workplace/rooms/recommend?${p}`)
  if (!r.ok) return r
  const b = r.body
  if (b.ok !== true) return { ok: false, reason: 'rejected', detail: String(b.error ?? `HTTP ${r.status}`) }
  return {
    ok: true,
    recs: {
      configured: b.configured !== false,
      rooms: (b.rooms as CoreRoom[]) ?? [],
      busy: (b.busy as CoreRoom[]) ?? [],
      booked: (b.booked as CoreRoomBooking | null) ?? null,
      site: (b.site as CoreRoomRecs['site']) ?? { building: '', address: '' },
      ...(b.start ? { start: String(b.start) } : {}),
      ...(b.end ? { end: String(b.end) } : {}),
    },
  }
}

export async function bookRoom(a: {
  room: string; date: string; start: string; end: string; ref: string
  title: string; people: number; mode: 'onsite' | 'video'; booked_by: string; note?: string
}): Promise<{ ok: true; booking: CoreRoomBooking } | CoreFail | { ok: false; reason: 'taken'; detail: string; alternatives: CoreRoom[] }> {
  const r = await coreJson('/api/workplace/rooms/book', { method: 'POST', body: a })
  if (!r.ok) return r
  const b = r.body
  if (b.ok === true && b.booking) return { ok: true, booking: b.booking as CoreRoomBooking }
  if (r.status === 409)
    return { ok: false, reason: 'taken', detail: String(b.error ?? ''), alternatives: (b.alternatives as CoreRoom[]) ?? [] }
  return { ok: false, reason: 'rejected', detail: String(b.error ?? `HTTP ${r.status}`) }
}

export async function releaseRoom(ref: string): Promise<{ ok: true; cancelled: number } | CoreFail> {
  const r = await coreJson('/api/workplace/rooms/cancel', { method: 'POST', body: { ref } })
  if (!r.ok) return r
  if (r.body.ok !== true) return { ok: false, reason: 'rejected', detail: String(r.body.error ?? '') }
  return { ok: true, cancelled: Number(r.body.cancelled ?? 0) }
}

/* =========================================================
   오퍼 밴드 초과 결재 — TalentCore 결재선에 태운다 (오퍼 O1)
   ---------------------------------------------------------
   전에는 Hire 가 직원 명부에서 '본부장'을 찾아 승인 줄에 붙였다.
   이름만 결재였다. 그 사람이 정말 그 결재를 할 사람인지, 부재 시
   누가 대신하는지, 며칠 안에 처리해야 하는지를 Hire 는 모른다.
   그 규칙은 전부 TalentCore 에 이미 있다(요청서 결재선과 같은 기계).

   그래서 방향을 뒤집었다. Hire 는 결재 건을 올리고(push) 상태를
   물어본다(pull). 승인·반려 버튼은 TalentCore 결재함에서 누른다.
   ref = Hire 후보자 id — 같은 후보자 것은 언제나 최근 한 건을 본다.
   ========================================================= */

export interface CoreOfferStep {
  step_no: number
  label: string
  name: string          // 이 단계를 맡은 사람
  pos?: string
  status: 'waiting' | 'approved' | 'rejected'
  by?: string | null    // 실제로 누른 사람
  acted_at?: string | null
  comment?: string | null
}

export interface CoreOffer {
  id: number
  ref: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'none'
  status_label: string
  base: number
  sign: number
  band_hi: number
  decided_at?: string | null
  reject_reason?: string | null
  reject_by?: string | null
  current?: { step_no: number; label: string; name: string; due_at?: string | null } | null
  steps: CoreOfferStep[]
}

export interface OfferApprovalPush {
  ref: string
  cand_name: string
  position_title?: string
  opening_code?: string | undefined
  department_name?: string
  level?: string
  base: number
  sign: number
  band_lo: number
  band_hi: number
  start_date?: string | undefined
  requester_core_id?: number | undefined
  requester_name?: string
  note?: string
}

function asOffer(b: Record<string, unknown>): CoreOffer {
  return {
    id: Number(b.id ?? 0),
    ref: String(b.ref ?? ''),
    status: (b.status as CoreOffer['status']) ?? 'none',
    status_label: String(b.status_label ?? ''),
    base: Number(b.base ?? 0),
    sign: Number(b.sign ?? 0),
    band_hi: Number(b.band_hi ?? 0),
    decided_at: (b.decided_at as string | null) ?? null,
    reject_reason: (b.reject_reason as string | null) ?? null,
    reject_by: (b.reject_by as string | null) ?? null,
    current: (b.current as CoreOffer['current']) ?? null,
    steps: (b.steps as CoreOfferStep[]) ?? [],
  }
}

/** 결재를 올린다. 이미 결재 중이거나 같은 금액으로 승인된 건이 있으면 그것이 온다. */
export async function pushOfferApproval(p: OfferApprovalPush):
  Promise<{ ok: true; offer: CoreOffer } | CoreFail> {
  const r = await coreJson('/api/offers/approval', { method: 'POST', body: p })
  if (!r.ok) return r
  if (r.body.ok !== true)
    return { ok: false, reason: 'rejected', detail: String(r.body.error ?? `HTTP ${r.status}`) }
  return { ok: true, offer: asOffer(r.body) }
}

/** 지금 어디까지 왔나. 올린 적이 없으면 status 'none'. */
export async function fetchOfferApproval(ref: string):
  Promise<{ ok: true; offer: CoreOffer } | CoreFail> {
  const r = await coreJson(`/api/offers/approval?ref=${encodeURIComponent(ref)}`)
  if (!r.ok) return r
  if (r.body.ok !== true)
    return { ok: false, reason: 'rejected', detail: String(r.body.error ?? `HTTP ${r.status}`) }
  return { ok: true, offer: asOffer(r.body) }
}

/** 결재를 내린다 — 오퍼를 초안으로 되돌릴 때. */
export async function cancelOfferApproval(ref: string):
  Promise<{ ok: true; status: string } | CoreFail> {
  const r = await coreJson('/api/offers/approval/cancel', { method: 'POST', body: { ref } })
  if (!r.ok) return r
  if (r.body.ok !== true)
    return { ok: false, reason: 'rejected', detail: String(r.body.error ?? '') }
  return { ok: true, status: String(r.body.status ?? '') }
}

/* =========================================================
   오퍼레터 문안 — 당겨오기 (오퍼 O2)
   ---------------------------------------------------------
   오퍼레터의 뼈대(처우·입사일·회신 기한)는 Hire 가 그린다. 회사마다
   달라지는 말 — 인사말·복리후생·서명자·스톡옵션 공통 조건 — 은
   TalentCore 설정(설정 > 오퍼레터)에 있다. 회사 이름·대표·주소도 같다.
   Hire 에 따로 적어 두면 회사 정보를 두 곳에서 고쳐야 한다.

   닿지 못하면 letter 없이 돌려준다 — 오퍼레터는 문안이 없어도 나가야 한다
   (처우와 입사일이 본문이고, 나머지는 인사말이다).
   ========================================================= */
export interface CoreLetter {
  company: { name: string; ceo: string; address: string }
  greeting: string
  benefits: string[]
  signer: string
  signerTitle: string
  replyDays: number
  equity: { vestYears: number; cliffMonths: number; note: string }
}

export type LetterResult =
  | { ok: true; letter: CoreLetter }
  | { ok: false; reason: 'not-configured' | 'unauthorized' | 'unreachable' | 'bad-response'; detail?: string }

export async function fetchOfferLetter(): Promise<LetterResult> {
  const { url, token } = conf()
  if (!url || !token) return { ok: false, reason: 'not-configured' }

  let res: Response
  try {
    res = await fetch(`${url}/api/offers/letter`, {
      headers: { 'X-API-Token': token, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    return { ok: false, reason: 'unreachable', detail: e instanceof Error ? e.message : String(e) }
  }
  if (res.status === 401) return { ok: false, reason: 'unauthorized' }
  if (!res.ok) return { ok: false, reason: 'bad-response', detail: `HTTP ${res.status}` }

  let body: unknown
  try { body = await res.json() } catch { return { ok: false, reason: 'bad-response', detail: 'JSON 아님' } }
  const d = body as {
    ok?: boolean
    company?: { name?: string; ceo?: string; address?: string }
    greeting?: string; benefits?: string[]; signer?: string; signer_title?: string
    reply_days?: number
    equity?: { vest_years?: number; cliff_months?: number; note?: string }
  }
  if (!d || d.ok !== true) return { ok: false, reason: 'bad-response', detail: '문안 모양이 다릅니다' }

  const c = d.company ?? {}
  const e = d.equity ?? {}
  return {
    ok: true,
    letter: {
      company: { name: c.name ?? '', ceo: c.ceo ?? '', address: c.address ?? '' },
      greeting: d.greeting ?? '',
      benefits: Array.isArray(d.benefits) ? d.benefits.filter(Boolean) : [],
      signer: d.signer ?? '',
      signerTitle: d.signer_title ?? '',
      replyDays: Number(d.reply_days) > 0 ? Number(d.reply_days) : 7,
      equity: {
        vestYears: Number(e.vest_years) > 0 ? Number(e.vest_years) : 4,
        cliffMonths: Number(e.cliff_months) >= 0 ? Number(e.cliff_months) : 12,
        note: e.note ?? '',
      },
    },
  }
}
