/* =========================================================
   Cadence — 면접관 가용시간 (외부 링크 ④)
   ---------------------------------------------------------
   경쟁사 조사 근거:
   · Calendly / GoodTime 은 캘린더를 연동해 빈 시간을 자동으로 읽는다.
     연동이 되면 제일 좋다 — 사람이 아무것도 안 해도 되니까.
   · 하지만 실제 현장에서 캘린더 연동이 막히는 경우가 늘 있다(외부 면접관,
     보안 정책, 개인 계정). 그때 대안이 없으면 다시 메일 왕복으로 돌아간다.
     Greenhouse 의 "Interview availability" 요청 링크가 그 자리를 메운다.
   · 그래서 이 화면은 <연동 실패 시의 정식 경로>다. 캘린더에서 읽어온 일정은
     회색으로 미리 박아두고, 사람은 그 위에서 <빼기만> 한다.
     빈 칸을 하나씩 채우게 하면 아무도 끝까지 안 한다.

   저장 형태에 대한 결정:
   · 화면에서는 '가능한 시간'을 고르지만, 저장은 기존 스케줄 엔진과 같은
     bad-block 형식(busy)으로 한다. 엔진(schedule.ts)이 이미 busy 만 읽고,
     표현을 하나로 두면 나중에 캘린더 연동이 붙어도 같은 자리에 들어간다.

   ※ 서버·클라이언트 양쪽에서 import 한다. I/O 없이 계산만 한다.
   ========================================================= */
import { avail, personById } from './data'
import { businessDays, fmtMin, type BusyBlock } from './schedule'

/* 30분 격자. 15분은 칸이 두 배가 되어 모바일에서 못 쓰고,
   60분은 '10:30 시작' 같은 실제 면접을 표현하지 못한다. */
export const SLOT = 30

export const cellKey = (date: string, start: number) => `${date}|${start}`
export const cellOf = (k: string): { date: string; start: number } => {
  const [date, s] = k.split('|')
  return { date, start: Number(s) }
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export interface DayCol { date: string; md: string; dow: string; wknd: boolean }

export interface AvailGrid {
  ok: boolean
  reason?: 'no-interviewer'
  uid?: string; nm?: string; tt?: string
  wh?: [number, number]       // 근무시간(분)
  days?: DayCol[]
  times?: number[]            // 각 행의 시작 분
  /* 캘린더에서 이미 일정이 잡혀 있는 칸 — 사람이 손대지 않는다 */
  busy?: string[]
  /* 지금 '가능'으로 표시돼 있는 칸 */
  open?: string[]
  /* 저장된 기록이 있는가 (없으면 근무시간 전체를 가능으로 시작) */
  saved?: boolean
}

/* 한 날짜의 busy 블록을 30분 칸 키로 펼친다. 블록이 칸 경계에 안 맞아도
   겹치기만 하면 그 칸은 못 쓰는 것으로 본다(면접을 반쯤 걸칠 수는 없다). */
function busyCells(
  blocks: BusyBlock[], dates: string[], wh: [number, number],
): string[] {
  const set = new Set<string>()
  for (const b of blocks) {
    if (dates.indexOf(b.date) < 0) continue
    for (let t = wh[0]; t + SLOT <= wh[1]; t += SLOT) {
      if (b.start < t + SLOT && b.end > t) set.add(cellKey(b.date, t))
    }
  }
  return Array.from(set)
}

export function availGrid(uid: string, base: Date, windowDays = 14): AvailGrid {
  const p = personById(uid)
  if (!p) return { ok: false, reason: 'no-interviewer' }

  const a = avail[uid]
  const wh: [number, number] = a?.wh ?? [600, 1080]   // 기본 10:00–18:00
  const dates = businessDays(base, windowDays)

  const days: DayCol[] = dates.map(d => {
    const [y, mo, dd] = d.split('-').map(Number)
    const w = new Date(y, mo - 1, dd).getDay()
    return { date: d, md: `${mo}/${dd}`, dow: DOW[w], wknd: w === 0 || w === 6 }
  })

  const times: number[] = []
  for (let t = wh[0]; t + SLOT <= wh[1]; t += SLOT) times.push(t)

  const busy = busyCells(a?.busy ?? [], dates, wh)
  const bset = new Set(busy)

  /* 처음 여는 사람에게는 '근무시간 전부 가능'을 기본값으로 준다.
     빈 판에서 시작하면 클릭 수가 수십 번이 되고, 그러면 아무도 안 끝낸다. */
  const open: string[] = []
  for (const d of dates) for (const t of times) {
    const k = cellKey(d, t)
    if (!bset.has(k)) open.push(k)
  }

  return {
    ok: true,
    uid, nm: p.nm, tt: p.tt,
    wh, days, times, busy, open,
    saved: !!a,
  }
}

/* 화면의 선택(가능한 칸) → 저장용 busy 블록.
   붙어 있는 칸은 한 블록으로 합친다 — 칸 단위로 저장하면 행이 수백 개가 되고,
   엔진이 읽을 때도 느려진다. */
export function toBusy(
  days: DayCol[], times: number[], open: string[],
): BusyBlock[] {
  const oset = new Set(open)
  const out: BusyBlock[] = []
  for (const d of days) {
    let run: { start: number; end: number } | null = null
    for (const t of times) {
      const free = oset.has(cellKey(d.date, t))
      if (free) {
        if (run) { out.push({ date: d.date, ...run }); run = null }
      } else if (run) {
        run.end = t + SLOT
      } else {
        run = { start: t, end: t + SLOT }
      }
    }
    if (run) out.push({ date: d.date, ...run })
  }
  return out
}

/* 화면 위 요약 — '몇 칸 골랐다'가 아니라 '면접 몇 건이 들어갈 수 있다'로 말한다.
   면접관이 판단할 수 있는 단위는 클릭 수가 아니라 면접 건수다. */
export function capacity(
  days: DayCol[], times: number[], open: string[], dur = 60,
): { hours: number; fits: number; thin: boolean } {
  const oset = new Set(open)
  const need = Math.ceil(dur / SLOT)
  let cells = 0, fits = 0
  for (const d of days) {
    let run = 0
    for (const t of times) {
      if (oset.has(cellKey(d.date, t))) { run++; cells++ }
      else { fits += Math.floor(run / need); run = 0 }
    }
    fits += Math.floor(run / need)
  }
  return { hours: (cells * SLOT) / 60, fits, thin: fits < 3 }
}

export const label = (m: number) => fmtMin(m)
