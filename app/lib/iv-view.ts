/* =========================================================
   Cadence — 면접 조율 화면이 쓰는 읽기 전용 계산
   ---------------------------------------------------------
   화면(page.tsx / 컴포넌트)이 저장소를 직접 뒤지지 않게 한 겹 둔다.
   저장·판단은 여기 없다 — 줄 세우기와 라벨 만들기만 한다.
   ========================================================= */

import { cands, posById, personById, stageById, demoNow, type Status } from './data'
import { interviews, partsOf, slotsOf, eventsOf, type Interview, type IvState } from './iv-store'
import { fmtMin, seatTaken } from './schedule'
import { DECLINE, type DeclineCode } from './iv-flow'

const DOW = ['일', '월', '화', '수', '목', '금', '토']
/** '8/12(수)' — 격자 머리와 슬롯 줄에서 같은 표기를 쓴다. */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${m}/${d}(${DOW[new Date(y, m - 1, d).getDay()]})`
}

export interface CoordSlot {
  ord: number; date: string; start: number; end: number
  st: string; label: string; day: string; time: string
  /** 벌크(선착순)에서 다른 후보자가 먼저 확정해 버린 자리.
      후보자 화면에서는 이미 사라졌으므로, 코디네이터 화면에서도 살아 있는 척하면 안 된다. */
  taken?: boolean
}
export interface CoordRow {
  id: string; cid: string; cand: string; posId: string; pos: string; stageNm: string
  round: number; kind: 'solo' | 'seq'; totalMin: number
  st: IvState; s: Status; why: string
  who: { ord: number; nm: string; role: string; resp: string; reason?: string }[]
  slots: CoordSlot[]
  sentAt?: string; holdUntil?: string; holdLeft?: string
  token?: string           // 후보자 선택 링크 /pick/<token>
  fixed?: string            // 확정된 자리
  days: number              // 이 단계에서 며칠째
  need: boolean             // 사람이 손대야 하는가
}

/** 가예약이 풀리기까지 남은 시간. 지났으면 '만료'. */
export function holdLeft(iso?: string, now = demoNow()): string | undefined {
  if (!iso) return undefined
  const ms = new Date(iso).getTime() - now.getTime()
  if (ms <= 0) return '만료'
  const h = Math.floor(ms / 3600_000)
  return h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간 남음` : `${h}시간 남음`
}

const RESP: Record<string, string> = { none: '대기', accepted: '수락', declined: '불가' }

function rowOf(iv: Interview): CoordRow {
  const cand = cands.find(c => c.id === iv.cid)
  const pos = posById(iv.pid)
  const parts = partsOf(iv.id)
  const slots = slotsOf(iv.id)
    .filter(s => s.st !== 'dropped' && s.st !== 'expired')
    .map(s => ({
      ord: s.ord, date: s.date, start: s.start, end: s.end, st: s.st,
      day: dayLabel(s.date), time: `${fmtMin(s.start)}–${fmtMin(s.end)}`,
      label: `${dayLabel(s.date)} ${fmtMin(s.start)}–${fmtMin(s.end)}`,
      ...(s.st === 'offered' && seatTaken(iv.id, s.date, parts.map(p => ({
        uid: p.uid, start: s.start + p.offMin, end: s.start + p.offMin + p.dur,
      }))) ? { taken: true } : {}),
    }))
  const picked = slots.find(s => s.st === 'picked')
  return {
    id: iv.id, cid: iv.cid, cand: cand?.nm ?? '(삭제된 후보자)',
    posId: iv.pid, pos: pos.title, stageNm: stageById(iv.pid, iv.sid).nm,
    round: iv.round, kind: iv.kind, totalMin: iv.totalMin,
    st: iv.st, s: iv.s, why: iv.why,
    who: parts.map(p => ({
      // ord 는 화면의 몇 번째가 아니라 DB 가 아는 자리 번호다 — 액션에 그대로 넘긴다.
      ord: p.ord,
      nm: p.nm || personById(p.uid || '')?.nm || '(미지정)',
      role: p.role, resp: RESP[p.resp] ?? p.resp,
      ...(p.resp === 'declined'
        ? { reason: DECLINE[(p.code as DeclineCode) || 'other']?.nm ?? '사유 없음' }
        : {}),
    })),
    slots,
    ...(iv.token ? { token: iv.token } : {}),
    ...(iv.sentAt ? { sentAt: iv.sentAt } : {}),
    ...(iv.holdUntil ? { holdUntil: iv.holdUntil, holdLeft: holdLeft(iv.holdUntil) } : {}),
    ...(picked ? { fixed: picked.label } : {}),
    days: cand?.d ?? 0,
    // 사람이 손대야 하는 줄: 아직 안 보냈거나(searching), 면접관이 불가라 했거나(esc),
    // 가예약이 풀렸거나(late). 보낸 뒤 조용히 기다리는 건은 손댈 것이 없다.
    need: iv.st === 'searching' || iv.s === 'esc' || iv.s === 'late',
  }
}

/** 코디네이터 줄 — 손대야 할 것이 위로. 끝난 면접은 빼지 않고 아래로 내린다. */
export function coordRows(): CoordRow[] {
  const rank = (r: CoordRow) =>
    r.s === 'esc' ? 0 : r.s === 'late' ? 1 : r.st === 'searching' ? 2 : r.st === 'proposed' ? 3 : 4
  return interviews
    .filter(v => v.st !== 'canceled')
    .map(rowOf)
    .sort((a, b) => rank(a) - rank(b) || b.days - a.days || a.cand.localeCompare(b.cand))
}

export const coordCounts = (rows: CoordRow[]) => ({
  need: rows.filter(r => r.need).length,
  waiting: rows.filter(r => r.st === 'proposed' && !r.need).length,
  fixed: rows.filter(r => r.st === 'confirmed').length,
})

/** 조율 기록(면접 1건). 화면 타임라인이 그대로 쓴다. */
export function coordLog(iid: string) {
  return eventsOf(iid).slice().reverse()
}
