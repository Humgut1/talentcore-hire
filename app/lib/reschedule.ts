/* =========================================================
   Cadence — 일정 변경·취소 (E-4)
   ---------------------------------------------------------
   경쟁사 조사 근거 (Greenhouse "Reschedule or cancel an interview"):
   · 변경과 취소는 같은 화면에서 갈린다. 취소는 인비를 지우고, 변경은
     인비를 지운 뒤 곧바로 다시 잡는다 — 사람이 하는 일은 "사유 고르기" 하나다.
   · Greenhouse 는 취소·변경 시 <면접관 전원에게 메일 보내기> 체크박스를 띄우고,
     후보자 안내는 별도로 챙기게 한다. 통지를 자동으로 해버리지 않는 이유는,
     "이미 전화로 말해둔" 경우에 두 번 알리면 신뢰가 깨지기 때문이다.
     그래서 여기서도 <무엇이 실행될지 미리 보여주고 끄고 켤 수 있게> 한다.
   · Ashby 는 취소 사유를 남기게 해 리포트로 뽑는다. 사유가 없으면
     "왜 이 공고만 일정이 계속 밀리나"에 아무도 답할 수 없다.

   이 파일의 책임은 <취소 한 번이 무엇을 되돌리는지>를 계산하는 것뿐이다.
   실제 저장·발송은 actions.ts, 화면은 Board.tsx.

   ※ 서버·클라이언트 양쪽에서 import 한다. I/O 없이 계산만 한다.
   ========================================================= */
import type { Status } from './data'

export type CancelCode = 'cand-request' | 'iv-unavailable' | 'internal' | 'cand-noshow'

export interface CancelDef {
  code: CancelCode
  label: string
  by: string          // 누가 못 하게 됐나 — 리포트에서 이 축으로 센다
  hint: string        // 이 사유를 고르면 다음에 무슨 일이 벌어지는지
  /* 취소(변경 아님) 후 코디네이터가 바로 누를 다음 수 */
  act: string[]
}

export const CANCEL_REASONS: CancelDef[] = [
  {
    code: 'cand-request', label: '후보자 요청', by: '후보자',
    hint: '후보자가 다시 시간을 골라야 합니다. 셀프 예약 링크를 다시 보내는 것이 가장 빠릅니다.',
    act: ['다른 시간 재탐색', '후보자에 일정 확인'],
  },
  {
    code: 'iv-unavailable', label: '면접관 불가', by: '면접관',
    hint: '같은 면접관으로 다시 잡을지, 대체 면접관을 넣을지 정해야 합니다.',
    act: ['다른 시간 재탐색', '대체 면접관 지정'],
  },
  {
    code: 'internal', label: '내부 사정', by: '우리',
    hint: '공고 보류·우선순위 변경 등. 후보자에게는 사유를 그대로 옮기지 않는 편이 낫습니다.',
    act: ['다른 시간 재탐색', '공고 상태 확인'],
  },
  {
    code: 'cand-noshow', label: '후보자 노쇼', by: '후보자',
    hint: '연락이 닿는지부터 확인합니다. 노쇼는 재조율보다 진행 여부 판단이 먼저입니다.',
    act: ['후보자에 확인', '불합격 처리'],
  },
]

export const cancelDef = (c: CancelCode): CancelDef =>
  CANCEL_REASONS.find(r => r.code === c) ?? CANCEL_REASONS[0]

/* ---------------------------------------------------------
   취소 한 번이 실제로 되돌리는 것들.
   "확정과 동시에 예약됩니다 — 취소·변경 시 자동 회수됩니다" 라고
   화면에 써 둔 문장을 이 계산이 실제로 지킨다.
   --------------------------------------------------------- */
/* key 가 있는 항목만 사람이 끄고 켤 수 있다(통지). fixed 는 되돌림 그 자체라 못 끈다. */
export interface CancelEffect { t: string; on: boolean; fixed?: boolean; key?: 'cand' | 'iv' }

export interface CancelInput {
  mode: 'cancel' | 'reschedule'
  code: CancelCode
  memo?: string
  when: string          // 취소되는 확정 시각 라벨 ('8/14(금) 14:00')
  remCount: number      // 아직 안 나간 리마인드 건수
  ivNames: string[]
  notifyCand: boolean
  notifyIv: boolean
  dur: number           // 이 단계 면접 길이(분) — 재탐색 안내에 쓴다
}

export interface CancelPlan {
  effects: CancelEffect[]
  status: Status
  why: string
  act: string[]
  trailB: string
  trailP: string
}

export function cancelPlan(i: CancelInput): CancelPlan {
  const d = cancelDef(i.code)
  const reschedule = i.mode === 'reschedule'

  const effects: CancelEffect[] = [
    /* 이 둘은 끌 수 없다 — 취소했는데 인비가 남아 있으면 후보자는 그대로 온다. */
    { t: '캘린더 인비 취소 · 화상 링크 만료', on: true, fixed: true },
    { t: `예약된 리마인드 ${i.remCount}건 회수`, on: i.remCount > 0, fixed: true },
    { t: '후보자에게 안내 발송', on: i.notifyCand, key: 'cand' },
    {
      t: `면접관 ${i.ivNames.length}명에게 안내${i.ivNames.length ? ` (${i.ivNames.join(', ')})` : ''}`,
      on: i.notifyIv && i.ivNames.length > 0,
      key: 'iv',
    },
  ]
  if (reschedule) effects.push({ t: '새 시간 곧바로 재탐색', on: true, fixed: true })

  /* why 에는 '확정'이라는 말을 쓰지 않는다 — 리마인드 엔진이 이 문자열에서
     확정 시각을 읽기 때문에, 남겨두면 취소된 면접의 리마인드가 되살아난다. */
  const why = reschedule
    ? `${i.dur}분 블록 재탐색 · ${i.when} 취소 (${d.label})`
    : `${i.when} 취소 (${d.label})${i.memo ? ` — ${i.memo}` : ''}`

  return {
    effects,
    status: reschedule ? 'idle' : 'esc',
    why,
    act: reschedule ? [] : d.act,
    trailB: reschedule ? '면접 시간 변경' : '면접 취소',
    trailP: [
      `${i.when} 취소`,
      `사유 ${d.label}(${d.by})`,
      i.memo ? `메모 ${i.memo}` : '',
      i.remCount > 0 ? `리마인드 ${i.remCount}건 회수` : '',
      i.notifyCand ? '후보자 안내 발송' : '후보자 안내 생략',
      i.notifyIv && i.ivNames.length ? '면접관 안내 발송' : '',
    ].filter(Boolean).join(' · '),
  }
}
