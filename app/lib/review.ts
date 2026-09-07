/* =========================================================
   Cadence — 서류 검토 큐 (HM 화면)
   ---------------------------------------------------------
   경쟁사 조사 근거 (Greenhouse "Application Review" / Ashby "Review"):
   · 서류 검토는 목록에서 한 명씩 눌러 들어갔다 나오는 일이 아니다.
     한 화면에 세워두고 <다음 / 다음 / 다음>으로 넘기는 전용 모드가 따로 있다.
     들어갔다 나오는 왕복이 검토 한 건당 두 번씩 붙으면, 20명이 쌓였을 때
     HM 은 그냥 안 본다 — 이 단계가 막히는 진짜 이유가 그것이다.
   · 그래서 여기서는 <판정하면 자동으로 다음 사람>이 기본 동작이다.
   · 판정 세 갈래(합격·보류·불합격)와 불합격 사유 규칙은 lib/decision.ts 한 곳에만
     둔다. 이 파일은 "누구 것이 지금 내 앞에 쌓여 있는가"만 계산한다.

   ※ 서버·클라이언트 양쪽에서 import 한다. I/O 없이 계산만 한다.
   ========================================================= */
import {
  cands, positions, stagesOf, stageById, posById, people,
  type Person, type Status,
} from './data'

export interface ReviewItem {
  cid: string; nm: string; yr: number; role: string; src: string; ap: string
  pid: string; pos: string; dept: string; jd: string
  stage: string; sid: string; d: number; sla: number; over: boolean
  s: Status; why: string
  /* 보류로 판정한 사람. 큐에서 사라지지는 않는다 — 보류는 '안 봄'이 아니라
     '지금 결정 안 함'이라서, 다시 볼 수 있어야 한다. 다만 맨 뒤로 보낸다. */
  held: boolean
  /* 이 단계를 같이 보는 사람들(나 제외). 혼자 보는 건지 아닌지가 판정 부담을 바꾼다. */
  withMe: string[]
}

/** 이 사람이 서류를 봐야 하는 후보자들. HM 이거나, 그 단계 검토자로 지정된 경우. */
export function reviewQueue(p: Person): ReviewItem[] {
  const out: ReviewItem[] = []
  for (const c of cands) {
    const pos = posById(c.p)
    if (pos.st === 'closed') continue
    const st = stageById(c.p, c.st)
    if (st.kind !== 'screen') continue
    const isMine = pos.hm === p.nm || st.ivs.indexOf(p.id) >= 0
    if (!isMine) continue
    out.push({
      cid: c.id, nm: c.nm, yr: c.yr, role: c.role, src: c.src, ap: c.ap,
      pid: pos.id, pos: pos.title, dept: `${pos.dept} · ${pos.team}`, jd: pos.jd,
      stage: st.nm, sid: st.id, d: c.d, sla: st.sla, over: c.d > st.sla,
      s: c.s, why: c.why, held: c.why.indexOf('판정 보류') === 0,
      withMe: st.ivs.filter(u => u !== p.id)
        .map(u => (people.find(x => x.id === u) || { nm: u }).nm),
    })
  }
  /* 오래 기다린 사람부터. 기준 초과는 무조건 위로 올린다 — 여기서 밀리면
     아래 단계 전체가 같이 밀리기 때문이다. 이미 보류한 사람은 맨 뒤로 보낸다:
     한 번 결정을 미룬 사람 때문에 아직 아무도 안 본 사람이 밀리면 안 된다. */
  return out.sort((a, b) =>
    Number(a.held) - Number(b.held) ||
    Number(b.over) - Number(a.over) ||
    b.d - a.d)
}

/** 서류 검토가 열려 있는 공고(= 이 사람이 담당인 것) 수 — 헤더 문구용. */
export function reviewPositions(p: Person): number {
  return positions.filter(pos =>
    pos.st !== 'closed' &&
    (pos.hm === p.nm || stagesOf(pos.id).some(s => s.kind === 'screen' && s.ivs.indexOf(p.id) >= 0)),
  ).length
}
