/* =========================================================
   Cadence — 캘린더 쓰기(가예약·확정) · 서버 전용
   ---------------------------------------------------------
   읽기(free-busy)는 google.ts 가 이미 한다. 여기는 '쓰기'다 —
     · hold    : 후보자가 고르기 전까지 면접관 캘린더를 48시간 잡아 둔다
     · release : 후보자가 고르면 안 고른 자리를 지운다
     · book    : 고른 자리를 진짜 일정으로 만들고 후보자를 초대한다

   ⚠ 남의 캘린더에 쓰려면 구글 관리자 권한(도메인 전체 위임)이 필요하고,
     그건 실제 회사 도메인이 있어야 켤 수 있다. 그래서 쓰기를 '부품'으로 떼어
     인터페이스 뒤에 두었다.
       · 지금(권한 없음) → NullWriter : 캘린더는 건드리지 않고 '가예약했다고 친다'.
         면접 기록·슬롯 상태·후보자 화면은 전부 진짜와 똑같이 굴러간다.
       · 나중(권한 있음) → GoogleWriter : 같은 인터페이스, 실제 일정 생성.
     바뀌는 건 이 파일 하나뿐이고, 흐름·화면·DB 는 손대지 않는다.

   NullWriter 가 만든 가짜 일정 id 는 'sim:' 으로 시작한다.
   나중에 진짜로 바뀌었을 때 옛 기록과 구분하려는 것이다.
   ========================================================= */

import { randomBytes } from 'crypto'
import { googleConfigured, googleStatus, validAccessToken, calendarIdFor } from './google'

/** 왜 지금 진짜 캘린더에 못 쓰는지. 화면에 그대로 한 줄로 띄운다. */
export type WriterState =
  | 'ready'          // 실제 캘린더에 쓴다
  | 'scope-missing'  // 계정은 연결됐지만 '읽기 전용' 권한뿐 → 쓰기 권한 재동의 필요
  | 'not-connected'  // 구글 계정 연결 전
  | 'unconfigured'   // 구글 앱 키 자체가 없음

export interface CalendarWriter {
  state: WriterState
  /** 가예약 1건. 실패하면 null. */
  hold(uid: string, date: string, start: number, end: number, title: string): Promise<string | null>
  /** 가예약 취소. */
  release(uid: string, eventId: string): Promise<boolean>
  /** 확정 일정 생성(후보자 초대 포함). */
  book(uid: string, date: string, start: number, end: number,
       title: string, guests: string[]): Promise<string | null>
}

/* ---- 시각 변환: 벽시계(분) → RFC3339(Asia/Seoul) ----
   앱은 '날짜 + 자정으로부터의 분'으로만 시간을 다룬다(엔진과 같은 규칙).
   구글에 넘길 때만 서울 기준 오프셋(+09:00)을 붙인다. */
const pad = (n: number) => String(n).padStart(2, '0')
export function rfc(date: string, min: number): string {
  return `${date}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00+09:00`
}

/* ---- 지금의 기본값: 캘린더를 건드리지 않는 쓰기 ---- */
export const NullWriter: CalendarWriter = {
  state: 'unconfigured',
  async hold() { return `sim:${randomBytes(6).toString('hex')}` },
  async release() { return true },
  async book() { return `sim:${randomBytes(6).toString('hex')}` },
}
function nullWith(state: WriterState): CalendarWriter {
  return { ...NullWriter, state }
}

/* ---- 권한이 생기면 이쪽이 쓰인다 ----
   구글 캘린더 API 는 읽기와 같은 토큰을 쓴다. 다른 건 권한 범위(scope)뿐이라
   관리자 승인이 떨어지면 이 파일은 그대로 두고 재동의만 하면 된다. */
const API = 'https://www.googleapis.com/calendar/v3/calendars'

async function calFetch(url: string, init: RequestInit): Promise<Response | null> {
  const token = await validAccessToken()
  if (!token) return null
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
}

export const GoogleWriter: CalendarWriter = {
  state: 'ready',
  async hold(uid, date, start, end, title) {
    const cal = calendarIdFor(uid)
    if (!cal) return null
    const res = await calFetch(`${API}/${encodeURIComponent(cal)}/events`, {
      method: 'POST',
      body: JSON.stringify({
        summary: title,
        description: 'Cadence 가예약 — 후보자가 시간을 고르면 자동으로 정리됩니다.',
        start: { dateTime: rfc(date, start), timeZone: 'Asia/Seoul' },
        end: { dateTime: rfc(date, end), timeZone: 'Asia/Seoul' },
        transparency: 'opaque',   // 다른 사람 눈에도 '바쁨'으로 보이게
      }),
    })
    if (!res?.ok) return null
    return (await res.json()).id ?? null
  },
  async release(uid, eventId) {
    const cal = calendarIdFor(uid)
    if (!cal || eventId.startsWith('sim:')) return true
    const res = await calFetch(`${API}/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}`,
      { method: 'DELETE' })
    // 이미 지워진 것도 성공으로 본다(410 Gone)
    return !!res && (res.ok || res.status === 410)
  },
  async book(uid, date, start, end, title, guests) {
    const cal = calendarIdFor(uid)
    if (!cal) return null
    const res = await calFetch(
      `${API}/${encodeURIComponent(cal)}/events?sendUpdates=all`, {
        method: 'POST',
        body: JSON.stringify({
          summary: title,
          start: { dateTime: rfc(date, start), timeZone: 'Asia/Seoul' },
          end: { dateTime: rfc(date, end), timeZone: 'Asia/Seoul' },
          attendees: guests.filter(Boolean).map(email => ({ email })),
        }),
      })
    if (!res?.ok) return null
    return (await res.json()).id ?? null
  },
}

/** 지금 쓸 수 있는 쓰기 부품을 고른다. 권한이 없으면 조용히 NullWriter. */
export function resolveWriter(): CalendarWriter {
  if (!googleConfigured()) return nullWith('unconfigured')
  const st = googleStatus()
  if (st.state !== 'connected') return nullWith('not-connected')
  // 읽기 전용 권한만 받은 상태에서는 쓰기가 반드시 실패한다 → 시도하지 않는다.
  const scope = st.scope || ''
  const canWrite = scope.includes('auth/calendar.events') ||
                   /auth\/calendar(\s|$)/.test(scope)
  return canWrite ? GoogleWriter : nullWith('scope-missing')
}

/** 화면에 그대로 띄울 한 줄. 왜 진짜 캘린더에 안 잡히는지 사람 말로. */
export function writerNote(state: WriterState): string {
  switch (state) {
    case 'ready': return '면접관 캘린더에 실제로 가예약합니다.'
    case 'scope-missing': return '구글 계정은 연결됐지만 읽기 권한만 있습니다 — 쓰기 권한을 다시 승인하면 실제 가예약이 잡힙니다. 그때까지는 Cadence 안에서만 자리를 잡아 둡니다.'
    case 'not-connected': return '구글 계정 연결 전입니다 — 지금은 Cadence 안에서만 자리를 잡아 둡니다.'
    default: return '구글 연동이 설정되지 않았습니다 — 지금은 Cadence 안에서만 자리를 잡아 둡니다.'
  }
}
/** 실제 캘린더에 쓰고 있는가(화면에서 배지 하나로 구분할 때). */
export const writesReal = (state: WriterState) => state === 'ready'
