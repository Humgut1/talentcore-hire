/* =========================================================
   전형 프로세스 템플릿 — 새 공고를 열 때 고르는 단계 묶음
   ---------------------------------------------------------
   왜 템플릿인가:
   Greenhouse·Lever·Workday 모두 공고 개설 화면에서 단계를 한 칸씩
   짜게 하지 않는다. 미리 만들어 둔 '인터뷰 플랜/파이프라인'을 고르게 하고,
   세부 조정은 공고를 만든 뒤 설정 화면에서 하게 한다.
   이유는 둘이다 —
     ① 공고를 여는 사람은 대개 단계를 새로 설계하려는 게 아니라
        "우리 회사가 늘 하던 대로" 열려는 것이다.
     ② 개설 화면에서 단계까지 짜게 하면 폼이 길어져 개설 자체가 미뤄진다.
   그래서 여기서는 템플릿 4종만 고르게 하고, 미세 조정은 /p/{id}/setup 이 맡는다.

   순수 모듈 — I/O 없음. 서버 액션과 클라이언트 폼이 같은 정의를 본다.
   ========================================================= */
import type { Stage, StageKind } from './data'

export interface TemplateStage {
  nm: string; kind: StageKind; sla: number; dur: number; mode: string
}
export interface PipelineTemplate {
  id: string
  nm: string
  why: string                 // 언제 이걸 고르는가 (카드에 한 줄로 보인다)
  body: TemplateStage[]       // 지원 접수 ~ 오퍼 (입사·불합격 레일은 자동으로 붙는다)
}

/* 지원 접수는 모든 템플릿의 첫 칸이고, 입사·불합격은 고정 레일이라
   템플릿 본문에 넣지 않는다(설계 문서 §4 "입사·불합격은 고정 단계"). */
const APPLY: TemplateStage = { nm: '지원 접수', kind: 'apply', sla: 1, dur: 0, mode: '—' }
const OFFER: TemplateStage = { nm: '오퍼', kind: 'offer', sla: 5, dur: 0, mode: '—' }

export const TEMPLATES: PipelineTemplate[] = [
  {
    id: 'std',
    nm: '표준 채용',
    why: '서류 → 1차 → 2차. 대부분의 정규직 채용이 여기에 해당합니다.',
    body: [
      APPLY,
      { nm: '서류 검토', kind: 'screen', sla: 3, dur: 0, mode: '—' },
      { nm: '1차 인터뷰', kind: 'interview', sla: 5, dur: 60, mode: '화상' },
      { nm: '2차 인터뷰', kind: 'interview', sla: 7, dur: 120, mode: '대면' },
      OFFER,
    ],
  },
  {
    id: 'task',
    nm: '과제형',
    why: '포트폴리오·과제로 실력을 먼저 봅니다. 디자인·마케팅 직군에 맞습니다.',
    body: [
      APPLY,
      { nm: '서류 검토', kind: 'screen', sla: 3, dur: 0, mode: '—' },
      { nm: '사전 과제', kind: 'task', sla: 7, dur: 0, mode: '비대면' },
      { nm: '과제 리뷰 인터뷰', kind: 'interview', sla: 5, dur: 90, mode: '화상' },
      OFFER,
    ],
  },
  {
    id: 'exec',
    nm: '임원 면접 포함',
    why: '과제 → 실무 → 임원. 시니어·리더급처럼 결정권자가 직접 보는 자리에 씁니다.',
    body: [
      APPLY,
      { nm: '서류 검토', kind: 'screen', sla: 3, dur: 0, mode: '—' },
      { nm: '기술 과제', kind: 'task', sla: 7, dur: 0, mode: '비대면' },
      { nm: '기술 인터뷰', kind: 'interview', sla: 5, dur: 90, mode: '화상' },
      { nm: '임원 인터뷰', kind: 'interview', sla: 7, dur: 60, mode: '대면' },
      OFFER,
    ],
  },
  {
    id: 'lean',
    nm: '간소',
    why: '서류 → 실무 면접 한 번. 계약직·인턴처럼 빨리 채워야 하는 자리에 씁니다.',
    body: [
      APPLY,
      { nm: '서류 검토', kind: 'screen', sla: 3, dur: 0, mode: '—' },
      { nm: '실무 인터뷰', kind: 'interview', sla: 5, dur: 60, mode: '화상' },
      OFFER,
    ],
  },
]

export const templateById = (id: string) =>
  TEMPLATES.find(t => t.id === id) || TEMPLATES[0]

/* 비레일 단계 색 램프: 연한 라벤더 → 브랜드 인디고.
   단계가 진행될수록 브랜드색에 수렴한다(설계 문서 §0 '단계 램프'). */
export function ramp(n: number, i: number): string {
  const a = [205, 208, 236], b = [91, 83, 214]
  const t = n <= 1 ? 1 : i / (n - 1)
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * t))
  return '#' + c.map(x => x.toString(16).padStart(2, '0')).join('')
}

/* 템플릿 → 실제 단계 배열.
   id 는 s1..sN 순번, 불합격만 s0 (기존 공고들과 같은 규칙).
   auto 는 전부 켠 채로 시작한다 — 아직 면접관을 안 붙였으니 EA 조율 대상도 없다.
   설정 화면에서 EA 면접관을 넣는 순간 그 단계는 자동화에서 빠진다. */
export function stagesFromTemplate(tid: string): Stage[] {
  const t = templateById(tid)
  const out: Stage[] = t.body.map((s, i) => ({
    id: `s${i + 1}`,
    nm: s.nm,
    kind: s.kind,
    sla: s.sla,
    dur: s.dur,
    mode: s.mode,
    ivs: [],
    color: ramp(t.body.length, i),
    auto: true,
  }))
  out.push({
    id: `s${t.body.length + 1}`, nm: '입사', kind: 'hired', sla: 0, dur: 0,
    mode: '—', ivs: [], color: '#0a9459', auto: false, rail: true,
  })
  out.push({
    id: 's0', nm: '불합격', kind: 'reject', sla: 0, dur: 0,
    mode: '—', ivs: [], color: '#a8a8b2', auto: false, rail: true,
  })
  return out
}
