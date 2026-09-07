/* =========================================================
   면접 조율 메일 문안 — 순수 모듈 (I/O 없음)
   ---------------------------------------------------------
   왜 파일을 따로 두는가:
   mailer.ts 는 '어떻게 내보내는가'(Resend·Slack), reminders.ts 는
   '언제 보낼까'를 맡는다. 여기는 '뭐라고 쓸까'만 맡는다. 셋을 섞으면
   문안 한 줄 고치려고 발송 배관을 건드리게 된다.

   순수 모듈이라 화면에서도 그대로 부를 수 있다 — 그래서 코디네이터가
   후보자 서랍에서 "보내기" 를 누르기 전에 실제로 나갈 메일을 미리 볼 수 있다.
   (미리보기와 실제 발송이 같은 함수를 쓰지 않으면 반드시 어긋난다.)

   시장 기준으로 맞춘 것 (Greenhouse 자가예약 / Ashby 안내 메일 참고):
     · 확정 메일 한 통에 필요한 게 전부 있어야 한다 —
       날짜·시각(시간대 명시)·소요시간·방식(링크 또는 장소)·면접관 이름과 직함·준비물.
     · 선택 요청 메일에는 기한을 분명히 적는다. 기한이 없으면 미뤄진다.
     · 못 오게 됐을 때 어떻게 알리는지를 항상 한 줄 넣는다(노쇼의 절반이
       "말할 데를 몰라서" 생긴다).

   모든 시각 표기는 한국 시간(KST) 기준이다. 후보자가 해외인 경우는
   아직 다루지 않는다 — 다루게 되면 ctx.tz 를 받아 여기서만 바꾸면 된다.
   ========================================================= */
import type { StageKind } from './data'

export interface Msg { subject: string; text: string }

/** 메일 한 통을 쓰는 데 필요한 사실들. 화면과 서버가 같은 걸 넘긴다. */
export interface IvMailCtx {
  candNm: string
  company?: string                // 우리 회사 이름. 설정 전이면 비운다(문장에서 통째로 빠진다)
  posTitle: string
  stageNm: string
  stageKind?: StageKind
  round: number
  totalMin: number
  mode: string                    // '화상' | '대면'
  loc?: string                    // 화상 링크 또는 장소
  seq: boolean                    // 두 사람을 이어서 보는가
  who: { nm: string; role: string; tt?: string; dur: number; offMin: number }[]
  rcNm: string                    // 담당 리크루터
  rcEmail?: string
}

const SIGN = '— Cadence'
/* 빈 문자열은 '일부러 넣은 빈 줄'이고, false/null 은 '조건이 안 맞아 뺀 줄'이다.
   둘을 같이 걸러 내면 메일이 한 덩어리로 붙어 버린다 — 구분해서 지운다. */
const join = (lines: (string | false | null | undefined)[]) =>
  lines.filter(l => l !== false && l !== null && l !== undefined).join('\n')

/* 면접관 소개 줄. 이어서 보는 면접이면 순서를 붙인다 —
   후보자가 "두 번 나눠 잡힌 건가?" 하고 헷갈리지 않게. */
function whoLines(ctx: IvMailCtx): string[] {
  return ctx.who.map((w, i) => {
    const nm = `${w.nm}${w.tt ? ` ${w.tt}` : ''}`
    const head = ctx.seq ? `  ${i + 1}. ` : '  · '
    return `${head}${nm} (${w.role}) · ${w.dur}분`
  })
}

/* '면접 정보' 목록 안에 들어가는 면접관 줄.
   한 명이면 한 줄로 붙인다 — 빈 '면접관 :' 줄 밑에 이름만 떨어져 있으면
   뭐가 빠진 것처럼 보인다. 또 한 명뿐일 때의 '· 90분'은 바로 위 소요 시간과
   같은 말이라 뺀다. */
function whoInline(ctx: IvMailCtx): string[] {
  if (!ctx.who.length) return []
  const nm = (w: IvMailCtx['who'][number]) => `${w.nm}${w.tt ? ` ${w.tt}` : ''} (${w.role})`
  if (ctx.who.length === 1) return [`  · 면접관 : ${nm(ctx.who[0])}`]
  return ['  · 면접관 :', ...ctx.who.map((w, i) =>
    `      ${ctx.seq ? `${i + 1}) ` : '- '}${nm(w)} · ${w.dur}분`)]
}

/* 준비물 안내. 단계 종류에서 끌어낸다 — 문구를 화면마다 따로 쓰면 어긋난다. */
function prepLines(ctx: IvMailCtx): string[] {
  const out: string[] = []
  if (ctx.mode === '화상') {
    out.push('· 접속 링크는 캘린더 초대에 함께 보내드립니다. 시작 전 카메라와 마이크를 확인해 주세요.')
  } else {
    out.push(`· 장소: ${ctx.loc || '확정 후 별도 안내드립니다'}. 도착하시면 안내데스크에 성함을 말씀해 주세요.`)
  }
  if (ctx.stageKind === 'task') out.push('· 제출해 주신 과제를 함께 보며 이야기 나눕니다. 따로 준비하실 것은 없습니다.')
  if (ctx.seq) out.push(`· 중간 휴식 없이 ${ctx.totalMin}분 연속으로 진행됩니다. 필요하시면 현장에서 편하게 말씀해 주세요.`)
  return out
}

/** 제목 앞에 붙는 회사 표시. 회사명이 없으면 아무것도 붙이지 않는다. */
const tag = (ctx: IvMailCtx) => (ctx.company ? `[${ctx.company}] ` : '')

const closing = (ctx: IvMailCtx) =>
  `일정 변경이나 문의는 이 메일에 회신해 주세요. (담당 ${ctx.rcNm}${ctx.rcEmail ? ` · ${ctx.rcEmail}` : ''})`

/* =========================================================
   ① 후보자 — 시간 선택 요청
   자리를 보내는 순간 나간다. 링크 하나로 끝나야 한다.
   ========================================================= */
export function pickRequest(
  ctx: IvMailCtx, a: { slots: string[]; link: string; deadline: string },
): Msg {
  return {
    subject: `${tag(ctx)}${ctx.posTitle} ${ctx.stageNm} 일정을 선택해 주세요`,
    text: join([
      `${ctx.candNm} 님, 안녕하세요. ${ctx.company ? `${ctx.company} ` : ''}채용 담당 ${ctx.rcNm}입니다.`,
      '',
      `${ctx.posTitle} 포지션 ${ctx.stageNm} 일정을 아래에서 하나 골라 주세요.`,
      '',
      `▸ 아래 링크에서 선택 (${a.deadline}까지)`,
      `  ${a.link}`,
      '',
      `가능한 시간 (한국 시간)`,
      ...a.slots.map(s => `  · ${s}`),
      '',
      `면접 정보`,
      `  · 소요 시간 : ${ctx.totalMin}분`,
      `  · 진행 방식 : ${ctx.mode}`,
      ...whoInline(ctx),
      '',
      `위 시간이 모두 어려우시면 회신해 주세요. 다른 시간으로 다시 잡아 드립니다.`,
      `선택해 주시기 전까지 위 시간은 면접관 일정에 임시로 잡아 두고 있어, ${a.deadline}이 지나면 자동으로 해제됩니다.`,
      '',
      closing(ctx),
      '',
      SIGN,
    ]),
  }
}

/* =========================================================
   ② 후보자 — 선택 리마인드
   기한이 지나 자동 해제되면 코디네이터가 처음부터 다시 잡아야 한다.
   그 전에 한 번 찔러 주는 게 양쪽 모두에게 싸다.
   ========================================================= */
export function pickReminder(
  ctx: IvMailCtx, a: { link: string; left: string },
): Msg {
  return {
    subject: `[리마인드] ${ctx.posTitle} ${ctx.stageNm} 일정 선택 — ${a.left} 남았습니다`,
    text: join([
      `${ctx.candNm} 님, 안녕하세요.`,
      '',
      `${ctx.posTitle} ${ctx.stageNm} 일정을 아직 선택하지 않으셔서 한 번 더 안내드립니다.`,
      `잡아 둔 시간이 ${a.left} 뒤에 해제됩니다.`,
      '',
      `▸ 시간 선택하기`,
      `  ${a.link}`,
      '',
      `제시된 시간이 모두 어려우시면 회신만 주셔도 됩니다. 다시 잡아 드리겠습니다.`,
      '',
      closing(ctx),
      '',
      SIGN,
    ]),
  }
}

/* =========================================================
   ③ 후보자 — 확정 안내
   이 한 통에 필요한 게 전부 있어야 한다. 다시 물어보게 만들면 진 것이다.
   ========================================================= */
export function candConfirm(ctx: IvMailCtx, a: { when: string }): Msg {
  return {
    subject: `${tag(ctx)}[확정] ${ctx.posTitle} ${ctx.stageNm} · ${a.when}`,
    text: join([
      `${ctx.candNm} 님, ${ctx.stageNm} 일정이 아래와 같이 확정되었습니다.`,
      '',
      `  ${a.when} (한국 시간)`,
      `  ${ctx.posTitle} · ${ctx.stageNm} · ${ctx.totalMin}분 · ${ctx.mode}`,
      '',
      ctx.who.length ? `면접관` : '',
      ...whoLines(ctx),
      '',
      `안내`,
      ...prepLines(ctx),
      '',
      `캘린더 초대를 함께 보내드렸습니다. 수락해 주시면 일정이 잡힙니다.`,
      `부득이하게 참석이 어려워지시면 가능한 한 빨리 이 메일에 회신해 주세요.`,
      '',
      closing(ctx),
      '',
      SIGN,
    ]),
  }
}

/* =========================================================
   ④ 면접관 — 확정 안내
   면접관은 '내가 언제 들어가면 되는가'만 알면 된다.
   2차처럼 이어서 보는 면접은 사람마다 자기 구간이 다르므로 한 통씩 쓴다.
   ========================================================= */
export function partConfirm(
  ctx: IvMailCtx,
  a: { when: string; myWhen: string; ord: number; link?: string },
): Msg {
  const me = ctx.who[a.ord]
  const others = ctx.who.filter((_, i) => i !== a.ord)
  return {
    subject: `[면접] ${ctx.candNm} 님 ${ctx.round}차 · ${a.myWhen}`,
    text: join([
      `${me?.nm ?? ''} 님, ${ctx.posTitle} ${ctx.stageNm} 일정이 확정되었습니다.`,
      '',
      `  내 시간 : ${a.myWhen} · ${me?.dur ?? ctx.totalMin}분`,
      ctx.seq ? `  전체    : ${a.when} (${ctx.totalMin}분 연속)` : '',
      `  후보자  : ${ctx.candNm}`,
      `  포지션  : ${ctx.posTitle}`,
      `  방식    : ${ctx.mode}${ctx.loc ? ` · ${ctx.loc}` : ''}`,
      me?.role ? `  역할    : ${me.role}` : '',
      '',
      ctx.seq && others.length
        ? `이어서 보는 면접입니다. ${others.map(o => `${o.nm}(${o.role})`).join(', ')} 님과 연달아 진행되니 시간을 지켜 주세요.`
        : '',
      a.link ? `` : '',
      a.link ? `이력서와 평가지: ${a.link}` : '',
      '',
      `참석이 어려워지시면 바로 알려 주세요 — 늦게 알수록 후보자 일정을 다시 잡기 어렵습니다. (담당 ${ctx.rcNm})`,
      '',
      SIGN,
    ]),
  }
}

/* =========================================================
   ⑤ 후보자 — 기한이 지나 자동 해제됨
   후보자를 탓하는 문장을 쓰지 않는다. 다음 행동만 알려 준다.
   ========================================================= */
export function expiredNotice(ctx: IvMailCtx): Msg {
  return {
    subject: `[안내] ${ctx.posTitle} ${ctx.stageNm} 일정을 다시 잡아 드리겠습니다`,
    text: join([
      `${ctx.candNm} 님, 안녕하세요.`,
      '',
      `앞서 안내드린 ${ctx.stageNm} 시간의 선택 기한이 지나 임시로 잡아 두었던 일정이 해제되었습니다.`,
      `면접이 취소된 것은 아닙니다 — 담당자가 새로운 시간을 찾아 곧 다시 안내드리겠습니다.`,
      '',
      `혹시 편하신 요일이나 시간대가 있으시면 회신으로 알려 주세요. 그에 맞춰 잡아 드리겠습니다.`,
      '',
      closing(ctx),
      '',
      SIGN,
    ]),
  }
}

/* =========================================================
   ⑥ 코디네이터 — 면접관 불가 알림 (내부용)
   사람에게 가는 알림이 아니라 '지금 손을 봐야 한다'는 신호다.
   그래서 상황과 다음 동작만 짧게 적는다.
   ========================================================= */
export function declineAlert(
  ctx: IvMailCtx, a: { partNm: string; reason: string; act: string[] },
): Msg {
  return {
    subject: `[조율] ${ctx.candNm} 님 ${ctx.round}차 — ${a.partNm} 면접관 불가`,
    text: join([
      `${ctx.candNm} 님 ${ctx.stageNm} 조율 중 면접관 불가가 접수되었습니다.`,
      '',
      `  면접관 : ${a.partNm}`,
      `  사유   : ${a.reason}`,
      `  포지션 : ${ctx.posTitle}`,
      a.act.length ? `  조치   : ${a.act.join(' · ')}` : '',
      '',
      SIGN,
    ]),
  }
}
