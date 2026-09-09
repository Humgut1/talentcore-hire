/* =========================================================
   Cadence — 샘플 데이터 (프로토타입 data.js 이식)
   ※ 전부 기능 설명용 예시 데이터입니다. 실제 지표가 아닙니다.
   기준일 2026-08-12
   ========================================================= */

import type { Rating } from './scorecard'
import type { Offer } from './offer'
import { rejectDef, REJECT_REASONS, type RejectCode, type RejectSide } from './decision'

export const TODAY = new Date(2026, 7, 12)

/** 데모 시계 — 날짜는 TODAY, 시각은 실제 지금.
    엔진은 TODAY 기준으로 자리를 잡는데 '가예약 만료' 같은 비교만 진짜 오늘 날짜로
    재면, 보내자마자 만료로 보인다. 지금과 비교하는 값은 전부 이 시계를 쓴다. */
export function demoNow(): Date {
  const r = new Date()
  const d = new Date(TODAY)
  d.setHours(r.getHours(), r.getMinutes(), r.getSeconds(), r.getMilliseconds())
  return d
}

export type Status = 'idle' | 'esc' | 'late' | 'done'
export type StageKind =
  | 'apply' | 'screen' | 'interview' | 'task' | 'offer' | 'hired' | 'reject'

export interface Person {
  id: string; nm: string; tt: string; dept: string
  roles: string[]; ea: boolean; ch: string; sla: number; resp: string; eaNm?: string
  email?: string   // 실제 발송용. 데모 데이터에는 비워 두고 env 의 테스트 주소로 보낸다.
  /* ---- TalentCore 직원 명부 연동(T4). 마이그레이션 008 전 DB 에는 없다 ---- */
  empNo?: string   // TalentCore 사번. 동기화가 사람을 알아보는 열쇠
  src?: 'core' | 'hire'  // core = 이름·직함·부서·메일의 주인이 TalentCore 다
  active?: boolean // 재직 중인가. false 면 새 면접에 배정하지 않는다(기록엔 남는다)
  coreRole?: string      // TalentCore 상의 역할(manager/recruiter/employee)
  coreLevel?: number     // TalentCore 직급(1~9). 실장 8 / 본부장·부문장 9.
                         // 면접 발송 직전 '고위 확인' 을 띄울지 여기서 판단한다.
}
export interface Position {
  id: string; title: string; dept: string; team: string; emp: string
  st: 'open' | 'hold' | 'closed'; rec: string; hm: string; opened: string; ttf: number; jd: string
  band?: [number, number]   // 연봉 밴드(만원). 오퍼 초안을 만들 때 여기서 복사해 간다.
  /* TalentCore 에서 넘어온 공고에만 있다(T3). 사람이 Hire 에서 직접 연 공고는 비어 있다. */
  reqRef?: string           // 채용 요청서 번호(REQ-12) — 출처 표시·역추적
  openings?: number         // 이 공고가 채우는 자리 수. 없으면 1명.
  openingCodes?: string[]   // 자리 카드 코드(OP-12-1 …). 합격자를 어느 카드에 채울지 고를 때 쓴다
  /* 자리 카드가 들고 있던 직급 라벨('L4 — Senior'). 오퍼 초안의 '직급' 기본값이다.
     Hire 에서 사람이 직접 연 공고에는 없다 — 그때는 공고 제목으로 떨어진다. */
  level?: string
  /* ---- 채용 사이트(공개 공고)용. 마이그레이션 012 전 DB 에는 없다 ---- */
  pub?: boolean    // 채용 사이트에 내걸었는가. undefined = 아직 판단한 적 없음(= 내걸림)
  loc?: string     // 근무지. 공고를 보는 사람이 두 번째로 보는 값이다
  exp?: string     // 경력 요건 한 줄 ('경력 3년 이상' / '신입·경력')
  due?: string     // 마감일(YYYY-MM-DD). 없으면 '상시 채용'
}
export interface Stage {
  id: string; nm: string; kind: StageKind; sla: number; dur: number
  mode: string; ivs: string[]; color: string; auto: boolean; rail?: boolean
}
export interface Meeting {
  id: string; nm: string; s: Status; v: string; ag: string; dur: number; who: string[]; act?: string[]
}
export interface Candidate {
  id: string; nm: string; p: string; st: string; s: Status; d: number
  ap: string; en: string; why: string; src: string; yr: number; role: string; act?: string[]
  email?: string   // 위와 동일 — 실제 후보자 주소는 데모에 담지 않는다.
  ex?: string      // 불합격/사퇴로 빠진 경우, 어느 단계까지 갔었는지(단계 id).
                   // 지표(퍼널)를 계산하려면 "어디서 떨어졌는지"가 필요하다.
  rj?: RejectCode  // 불합격 사유 코드. '우리가 거절'인지 '후보자가 이탈'인지가 여기서 갈린다.
  rjMemo?: string  // 사유에 덧붙인 내용(선택).
  decided?: string // 판정일. 사유 리포트의 기간 필터에 쓴다.
  /* ---- 채용 사이트로 직접 들어온 지원건. 마이그레이션 012 전 DB 에는 없다 ---- */
  phone?: string   // 연락처. 지원 폼에서만 들어온다
  note?: string    // 지원자가 직접 쓴 지원 동기. 'why'(상태 사유)와 섞지 않는다
  pk?: string      // '사람' 식별자. 중복 병합이 끝난 지원건에만 붙는다.
                   // 자기 id 면 '확인했고 다른 사람', 남의 id 면 '그 사람과 같은 사람'.
                   // 지원건을 합치지 않는 이유는 pool.ts 머리글에 적어 둔다.
}

export const me = { name: '정수민', role: '리크루터', init: '정' }

export let people: Person[] = [
  { id:'u1', nm:'최영수', tt:'서버팀 팀장',      dept:'플랫폼본부', roles:['하이어링 매니저','인터뷰어'], ea:false, ch:'slack', sla:24, resp:'4.2h' },
  { id:'u2', nm:'정수민', tt:'채용 담당',        dept:'피플팀',     roles:['리크루터'],                   ea:false, ch:'both',  sla:12, resp:'1.1h' },
  { id:'u3', nm:'한도경', tt:'플랫폼본부 본부장', dept:'플랫폼본부', roles:['인터뷰어'],                   ea:true,  ch:'email', sla:48, resp:'—',    eaNm:'김비서' },
  { id:'u4', nm:'서민재', tt:'서버팀 테크리드',   dept:'플랫폼본부', roles:['인터뷰어'],                   ea:false, ch:'slack', sla:24, resp:'6.8h' },
  { id:'u5', nm:'노아름', tt:'데이터팀 팀장',     dept:'플랫폼본부', roles:['인터뷰어'],                   ea:false, ch:'slack', sla:24, resp:'11.4h' },
  { id:'u6', nm:'배수진', tt:'HR 코디네이터',     dept:'피플팀',     roles:['코디네이터'],                 ea:false, ch:'both',  sla:12, resp:'0.6h' },
  { id:'u7', nm:'윤태경', tt:'CTO',              dept:'경영진',     roles:['인터뷰어'],                   ea:true,  ch:'email', sla:48, resp:'—',    eaNm:'김비서' },
  { id:'u8', nm:'김서진', tt:'디자인팀 팀장',     dept:'프로덕트본부', roles:['하이어링 매니저','인터뷰어'], ea:false, ch:'slack', sla:24, resp:'3.4h' },
  { id:'u9', nm:'박현우', tt:'채용 담당',        dept:'피플팀',     roles:['리크루터'],                   ea:false, ch:'both',  sla:12, resp:'2.3h' },
  { id:'u10', nm:'이강민', tt:'사업본부 본부장',  dept:'사업본부',   roles:['하이어링 매니저','인터뷰어'], ea:true,  ch:'email', sla:48, resp:'—',    eaNm:'박실장' },
  { id:'u11', nm:'유하린', tt:'프로덕트 디자이너', dept:'프로덕트본부', roles:['인터뷰어'],                 ea:false, ch:'slack', sla:24, resp:'5.1h' },
  { id:'u12', nm:'강태윤', tt:'데이터팀 테크리드', dept:'플랫폼본부', roles:['인터뷰어'],                   ea:false, ch:'slack', sla:24, resp:'8.7h' },
  { id:'u13', nm:'임수정', tt:'품질팀 리드',      dept:'플랫폼본부', roles:['하이어링 매니저','인터뷰어'], ea:false, ch:'both',  sla:24, resp:'2.9h' },
]

export let positions: Position[] = [
  { id:'p1', title:'백엔드 엔지니어 (시니어)', dept:'플랫폼본부', team:'서버팀',   emp:'정규직', st:'open',   rec:'정수민', hm:'최영수', opened:'2026-07-20', ttf:23, band:[8000,10000], jd:'분산 트랜잭션 처리와 대용량 이벤트 파이프라인을 설계·운영할 시니어 백엔드 엔지니어를 찾습니다.', loc:'서울 강남', exp:'경력 5년 이상', due:'2026-09-30' },
  { id:'p2', title:'프로덕트 디자이너',        dept:'프로덕트본부', team:'디자인팀', emp:'정규직', st:'open',   rec:'정수민', hm:'김서진', opened:'2026-07-28', ttf:15, band:[6500,8500],  jd:'B2B SaaS 제품의 핵심 플로우를 설계합니다.', loc:'서울 강남', exp:'경력 3년 이상' },
  { id:'p3', title:'데이터 엔지니어',          dept:'플랫폼본부', team:'데이터팀', emp:'정규직', st:'open',   rec:'박현우', hm:'노아름', opened:'2026-06-30', ttf:43, band:[7500,9500],  jd:'데이터 웨어하우스 구축과 파이프라인 운영.', loc:'서울 강남 · 주 2회 재택', exp:'경력 3년 이상', due:'2026-09-20' },
  { id:'p4', title:'세일즈 매니저',            dept:'사업본부',   team:'세일즈팀', emp:'정규직', st:'hold',   rec:'박현우', hm:'이강민', opened:'2026-07-02', ttf:41, band:[6000,8000],  jd:'엔터프라이즈 신규 고객 발굴.', loc:'서울 강남', exp:'경력 7년 이상' },
  { id:'p5', title:'QA 엔지니어',              dept:'플랫폼본부', team:'품질팀',   emp:'계약직', st:'closed', rec:'정수민', hm:'임수정', opened:'2026-05-11', ttf:58, band:[5500,7000],  jd:'자동화 테스트 설계.', loc:'서울 강남', exp:'신입·경력' },
]

export let stages: Record<string, Stage[]> = {
  p1: [
    { id:'s1', nm:'지원 접수',  kind:'apply',     sla:1, dur:0,   mode:'—',    ivs:[],          color:'#c3c5e2', auto:true  },
    { id:'s2', nm:'서류 검토',  kind:'screen',    sla:3, dur:0,   mode:'—',    ivs:['u1'],      color:'#b0b3e3', auto:true  },
    { id:'s3', nm:'1차 인터뷰', kind:'interview', sla:5, dur:60,  mode:'화상', ivs:['u1','u4'], color:'#9a9be4', auto:true  },
    { id:'s4', nm:'2차 인터뷰', kind:'interview', sla:7, dur:120, mode:'대면', ivs:['u3','u7'], color:'#7d7be0', auto:false },
    { id:'s5', nm:'오퍼',       kind:'offer',     sla:5, dur:0,   mode:'—',    ivs:[],          color:'#5b53d6', auto:true  },
    { id:'s6', nm:'입사',       kind:'hired',     sla:0, dur:0,   mode:'—',    ivs:[],          color:'#0a9459', auto:false, rail:true },
    { id:'s0', nm:'불합격',     kind:'reject',    sla:0, dur:0,   mode:'—',    ivs:[],          color:'#a8a8b2', auto:false, rail:true },
  ],
  /* 디자인 채용 — 포트폴리오 + 과제 중심(인터뷰가 아니라 과제가 병목). */
  p2: [
    { id:'s1', nm:'지원 접수',        kind:'apply',     sla:1, dur:0,  mode:'—',      ivs:[],            color:'#cdd0ec', auto:true  },
    { id:'s2', nm:'포트폴리오 검토',  kind:'screen',    sla:3, dur:0,  mode:'—',      ivs:['u8'],        color:'#b1b1e7', auto:true  },
    { id:'s3', nm:'디자인 과제',      kind:'task',      sla:7, dur:0,  mode:'비대면', ivs:['u8','u11'],  color:'#9492e1', auto:true  },
    { id:'s4', nm:'과제 리뷰 인터뷰', kind:'interview', sla:5, dur:90, mode:'화상',   ivs:['u8','u11'],  color:'#7872dc', auto:true  },
    { id:'s5', nm:'오퍼',             kind:'offer',     sla:5, dur:0,  mode:'—',      ivs:[],            color:'#5b53d6', auto:true  },
    { id:'s6', nm:'입사',             kind:'hired',     sla:0, dur:0,  mode:'—',      ivs:[],            color:'#0a9459', auto:false, rail:true },
    { id:'s0', nm:'불합격',           kind:'reject',    sla:0, dur:0,  mode:'—',      ivs:[],            color:'#a8a8b2', auto:false, rail:true },
  ],
  /* 데이터 채용 — 단계가 가장 길고 마지막이 EA 임원 인터뷰(자동화 제외). */
  p3: [
    { id:'s1', nm:'지원 접수',    kind:'apply',     sla:1, dur:0,  mode:'—',      ivs:[],            color:'#cdd0ec', auto:true  },
    { id:'s2', nm:'서류 검토',    kind:'screen',    sla:3, dur:0,  mode:'—',      ivs:['u5'],        color:'#b6b7e8', auto:true  },
    { id:'s3', nm:'기술 과제',    kind:'task',      sla:7, dur:0,  mode:'비대면', ivs:['u12'],       color:'#9f9ee3', auto:true  },
    { id:'s4', nm:'기술 인터뷰',  kind:'interview', sla:5, dur:90, mode:'화상',   ivs:['u5','u12'],  color:'#8985df', auto:true  },
    { id:'s5', nm:'임원 인터뷰',  kind:'interview', sla:7, dur:60, mode:'대면',   ivs:['u3'],        color:'#726cda', auto:false },
    { id:'s6', nm:'오퍼',         kind:'offer',     sla:5, dur:0,  mode:'—',      ivs:[],            color:'#5b53d6', auto:true  },
    { id:'s7', nm:'입사',         kind:'hired',     sla:0, dur:0,  mode:'—',      ivs:[],            color:'#0a9459', auto:false, rail:true },
    { id:'s0', nm:'불합격',       kind:'reject',    sla:0, dur:0,  mode:'—',      ivs:[],            color:'#a8a8b2', auto:false, rail:true },
  ],
  /* 세일즈 채용 — 보류(hold) 중. 면접관이 전부 EA 조율 대상이라 자동화가 거의 안 걸린다. */
  p4: [
    { id:'s1', nm:'지원 접수',   kind:'apply',     sla:1, dur:0,  mode:'—',    ivs:[],       color:'#cdd0ec', auto:true  },
    { id:'s2', nm:'서류 검토',   kind:'screen',    sla:3, dur:0,  mode:'—',    ivs:['u10'],  color:'#b1b1e7', auto:true  },
    { id:'s3', nm:'1차 인터뷰',  kind:'interview', sla:5, dur:60, mode:'화상', ivs:['u10'],  color:'#9492e1', auto:false },
    { id:'s4', nm:'최종 인터뷰', kind:'interview', sla:7, dur:60, mode:'대면', ivs:['u10'],  color:'#7872dc', auto:false },
    { id:'s5', nm:'오퍼',        kind:'offer',     sla:5, dur:0,  mode:'—',    ivs:[],       color:'#5b53d6', auto:true  },
    { id:'s6', nm:'입사',        kind:'hired',     sla:0, dur:0,  mode:'—',    ivs:[],       color:'#0a9459', auto:false, rail:true },
    { id:'s0', nm:'불합격',      kind:'reject',    sla:0, dur:0,  mode:'—',    ivs:[],       color:'#a8a8b2', auto:false, rail:true },
  ],
  /* QA 계약직 — 이미 채용 완료(closed). 단계가 가장 짧다. */
  p5: [
    { id:'s1', nm:'지원 접수',   kind:'apply',     sla:1, dur:0,  mode:'—',    ivs:[],             color:'#cdd0ec', auto:true  },
    { id:'s2', nm:'서류 검토',   kind:'screen',    sla:3, dur:0,  mode:'—',    ivs:['u13'],        color:'#a7a6e5', auto:true  },
    { id:'s3', nm:'실무 인터뷰', kind:'interview', sla:5, dur:60, mode:'화상', ivs:['u13','u4'],   color:'#817ddd', auto:true  },
    { id:'s4', nm:'오퍼',        kind:'offer',     sla:5, dur:0,  mode:'—',    ivs:[],             color:'#5b53d6', auto:true  },
    { id:'s5', nm:'입사',        kind:'hired',     sla:0, dur:0,  mode:'—',    ivs:[],             color:'#0a9459', auto:false, rail:true },
    { id:'s0', nm:'불합격',      kind:'reject',    sla:0, dur:0,  mode:'—',    ivs:[],             color:'#a8a8b2', auto:false, rail:true },
  ],
}

export let meetings: Record<string, Meeting[]> = {
  p1: [
    { id:'m1', nm:'킥오프',   s:'done', v:'8/4 14:00 완료', ag:'—',   dur:30, who:['최영수','한도경','서민재'] },
    { id:'m2', nm:'디브리프', s:'esc',  v:'참석자 미지정',  ag:'52h', dur:30, who:[], act:['참석자 지정 요청'] },
  ],
  p2: [
    { id:'m3', nm:'킥오프',        s:'done', v:'7/29 10:00 완료',  ag:'—',   dur:30, who:['김서진','유하린'] },
    { id:'m4', nm:'과제 기준 정렬', s:'idle', v:'8/13 16:00 예정',  ag:'—',   dur:30, who:['김서진','유하린'] },
  ],
  p3: [
    { id:'m5', nm:'킥오프',   s:'done', v:'7/2 11:00 완료',   ag:'—',   dur:30, who:['노아름','강태윤','한도경'] },
    { id:'m6', nm:'디브리프', s:'late', v:'평가지 미제출 3건', ag:'72h', dur:30, who:['노아름','강태윤'], act:['면접관에 리마인드','직접 취합'] },
  ],
  p4: [
    { id:'m7', nm:'킥오프',       s:'done', v:'7/6 14:00 완료',  ag:'—',   dur:30, who:['이강민'] },
    { id:'m8', nm:'보류 재검토',  s:'esc',  v:'보류 사유 미기재', ag:'36d', dur:30, who:[], act:['사업본부에 확인','공고 종료 검토'] },
  ],
  p5: [
    { id:'m9',  nm:'킥오프',   s:'done', v:'5/13 10:00 완료', ag:'—', dur:30, who:['임수정','최영수'] },
    { id:'m10', nm:'디브리프', s:'done', v:'7/2 15:00 완료',  ag:'—', dur:30, who:['임수정','서민재'] },
  ],
}

/* ---- F. 일정 조율 — 면접관 가용성 (수동 provider 시드) ----
   시간은 분(자정 기준) · 벽시계 로컬. Google/Cronofy 연동 시 provider 가 교체.
   EA 면접관(u3·u7)은 자동화 제외 → 가용성 불필요(코디네이터 수동). */
/* busy 한 칸 = '그 시간엔 안 된다'. kind 는 그 일정의 성격 —
   앞뒤로 이동시간을 얼마나 비워야 하는지가 여기서 갈린다(사내 0 / 외부 60).
   비어 있으면 'unknown' 취급 = 일단 60분 비우되 RC 가 풀 수 있다. */
export interface AvailBusy { date: string; start: number; end: number; kind?: 'in' | 'out' | 'unknown' }
export let avail: Record<string, { wh: [number, number]; busy: AvailBusy[] }> = {
  u1: { wh: [600, 1080], busy: [ // 최영수(HM·인터뷰어)
    { date:'2026-08-12', start:600, end:720 }, { date:'2026-08-12', start:840, end:900 },
    { date:'2026-08-13', start:600, end:660 }, { date:'2026-08-13', start:660, end:720 },
    { date:'2026-08-14', start:840, end:900 },
    { date:'2026-08-17', start:900, end:960 },
    { date:'2026-08-18', start:600, end:960 },
    { date:'2026-08-19', start:780, end:840 },
    { date:'2026-08-20', start:600, end:660 },
    { date:'2026-08-21', start:960, end:1020 },
  ] },
  u4: { wh: [600, 1080], busy: [ // 서민재(테크리드·인터뷰어)
    { date:'2026-08-12', start:780, end:840 },
    { date:'2026-08-13', start:600, end:660 }, { date:'2026-08-13', start:900, end:960 },
    { date:'2026-08-14', start:840, end:900 }, { date:'2026-08-14', start:960, end:1020 },
    { date:'2026-08-17', start:660, end:720 },
    { date:'2026-08-18', start:600, end:660 },
    { date:'2026-08-19', start:780, end:840 },
    { date:'2026-08-20', start:840, end:900 },
    { date:'2026-08-21', start:600, end:720 },
  ] },
  u5: { wh: [600, 1080], busy: [ // 노아름(데이터팀·인터뷰어)
    { date:'2026-08-13', start:780, end:900 },
    { date:'2026-08-18', start:600, end:720 },
    { date:'2026-08-20', start:900, end:1020 },
  ] },
  u8: { wh: [600, 1140], busy: [ // 김서진(디자인팀 팀장·HM) — 리뷰 미팅이 많다
    { date:'2026-08-12', start:600, end:660 }, { date:'2026-08-12', start:900, end:990 },
    { date:'2026-08-13', start:660, end:720 },
    { date:'2026-08-14', start:600, end:720 }, { date:'2026-08-14', start:900, end:960 },
    { date:'2026-08-17', start:840, end:960 },
    { date:'2026-08-18', start:600, end:660 },
    { date:'2026-08-19', start:900, end:1020 },
    { date:'2026-08-20', start:600, end:720 },
  ] },
  u11: { wh: [600, 1140], busy: [ // 유하린(프로덕트 디자이너·인터뷰어)
    { date:'2026-08-12', start:840, end:900 },
    { date:'2026-08-13', start:600, end:660 },
    { date:'2026-08-14', start:780, end:840 },
    { date:'2026-08-17', start:600, end:720 },
    { date:'2026-08-19', start:600, end:660 },
    { date:'2026-08-21', start:900, end:1020 },
  ] },
  u12: { wh: [540, 1080], busy: [ // 강태윤(데이터팀 테크리드) — 오전 배치 운영으로 앞이 막혀 있다
    { date:'2026-08-12', start:540, end:660 }, { date:'2026-08-12', start:780, end:840 },
    { date:'2026-08-13', start:540, end:660 }, { date:'2026-08-13', start:900, end:1020 },
    { date:'2026-08-14', start:540, end:660 },
    { date:'2026-08-17', start:540, end:660 }, { date:'2026-08-17', start:780, end:900 },
    { date:'2026-08-18', start:540, end:720 },
    { date:'2026-08-19', start:540, end:660 }, { date:'2026-08-19', start:840, end:960 },
    { date:'2026-08-20', start:540, end:660 },
  ] },
  u13: { wh: [600, 1080], busy: [ // 임수정(품질팀 리드·HM)
    { date:'2026-08-13', start:600, end:660 },
    { date:'2026-08-18', start:840, end:900 },
    { date:'2026-08-20', start:600, end:660 },
  ] },
}

export let cands: Candidate[] = [
  { id:'c1',  nm:'한지우', p:'p1', st:'s1', s:'idle', d:0,  ap:'2026-08-12', en:'2026-08-12', why:'', src:'리멤버',   yr:7,  role:'백엔드 엔지니어 · 카카오' },
  { id:'c2',  nm:'배준영', p:'p1', st:'s1', s:'idle', d:1,  ap:'2026-08-11', en:'2026-08-11', why:'', src:'자사채용', yr:5,  role:'서버 개발자 · 토스' },
  { id:'c3',  nm:'강도윤', p:'p1', st:'s2', s:'idle', d:2,  ap:'2026-08-06', en:'2026-08-10', why:'', src:'원티드',   yr:9,  role:'테크리드 · 당근' },
  { id:'c4',  nm:'윤서아', p:'p1', st:'s2', s:'late', d:6,  ap:'2026-08-01', en:'2026-08-06', why:'HM 미응답 48h', src:'추천',   yr:6,  role:'백엔드 · 라인', act:['HM에게 리마인드','직접 검토'] },
  { id:'c5',  nm:'문태오', p:'p1', st:'s2', s:'idle', d:1,  ap:'2026-08-09', en:'2026-08-11', why:'', src:'자사채용', yr:4,  role:'백엔드 · 스타트업' },
  { id:'c6',  nm:'신하경', p:'p1', st:'s2', s:'idle', d:3,  ap:'2026-08-04', en:'2026-08-09', why:'', src:'링크드인', yr:8,  role:'플랫폼 엔지니어 · 쿠팡' },
  { id:'c7',  nm:'박지훈', p:'p1', st:'s3', s:'late', d:5,  ap:'2026-07-28', en:'2026-08-07', why:'후보자 미확인 36h', src:'원티드', yr:10, role:'시니어 백엔드 · 네이버', act:['후보자에게 재발송','직접 연락'] },
  { id:'c8',  nm:'임채원', p:'p1', st:'s3', s:'idle', d:3,  ap:'2026-07-30', en:'2026-08-09', why:'슬롯 3개 발송', src:'리멤버', yr:6,  role:'백엔드 · 배민' },
  { id:'c9',  nm:'오시현', p:'p1', st:'s3', s:'done', d:3,  ap:'2026-07-29', en:'2026-08-09', why:'8/14 14:00 확정', src:'추천', yr:7,  role:'백엔드 · 야놀자' },
  { id:'c10', nm:'김민준', p:'p1', st:'s4', s:'idle', d:9,  ap:'2026-07-20', en:'2026-08-03', why:'2시간 블록 탐색', src:'링크드인', yr:11, role:'테크리드 · 우아한형제들' },
  { id:'c11', nm:'이서연', p:'p1', st:'s4', s:'esc',  d:12, ap:'2026-07-18', en:'2026-07-31', why:'면접관 전원 거절', src:'원티드', yr:9,  role:'시니어 백엔드 · 카카오페이', act:['범위 넓혀 재탐색','직접 조율'] },
  { id:'c12', nm:'최유나', p:'p1', st:'s5', s:'esc',  d:21, ap:'2026-07-05', en:'2026-07-22', why:'처우 재협의', src:'추천', yr:12, role:'백엔드 아키텍트 · 라인', act:['처우안 수정','HM에 확인'] },
  { id:'c13', nm:'정하늘', p:'p1', st:'s6', s:'done', d:18, ap:'2026-06-30', en:'2026-07-25', why:'9/1 입사 예정', src:'리멤버', yr:8,  role:'백엔드 · 쏘카' },
  { id:'c14', nm:'서지호', p:'p1', st:'s0', s:'done', d:11, ap:'2026-07-24', en:'2026-08-01', why:'서류 불합격', src:'원티드', yr:3,  role:'주니어 백엔드', ex:'s2', rj:'skill', email:'jiho.seo@example.com' },
  { id:'c15', nm:'남궁현', p:'p1', st:'s0', s:'done', d:9,  ap:'2026-07-26', en:'2026-08-03', why:'서류 불합격', src:'링크드인', yr:2, role:'백엔드', ex:'s2', rj:'exp' },
  { id:'c16', nm:'조은비', p:'p1', st:'s0', s:'done', d:14, ap:'2026-07-19', en:'2026-07-29', why:'1차 불합격', src:'자사채용', yr:5, role:'백엔드', ex:'s3', rj:'skill' },
  { id:'c17', nm:'백승우', p:'p1', st:'s0', s:'done', d:6,  ap:'2026-07-31', en:'2026-08-06', why:'후보자 사퇴', src:'추천', yr:7,  role:'백엔드', ex:'s3', rj:'other-offer', rjMemo:'경쟁사 오퍼 수락. 연봉보다 합류 시점이 빨랐던 점이 컸다고 합니다.' },

  /* p2 프로덕트 디자이너 — 과제 단계가 병목(마감 초과가 새 에스컬레이션 유형) */
  { id:'c18', nm:'문서윤', p:'p2', st:'s1', s:'idle', d:0,  ap:'2026-08-12', en:'2026-08-12', why:'', src:'원티드',   yr:6, role:'프로덕트 디자이너 · 토스' },
  { id:'c19', nm:'하지민', p:'p2', st:'s1', s:'idle', d:1,  ap:'2026-08-11', en:'2026-08-11', why:'', src:'링크드인', yr:4, role:'UX 디자이너 · 마켓컬리' },
  { id:'c20', nm:'권나영', p:'p2', st:'s2', s:'idle', d:2,  ap:'2026-08-07', en:'2026-08-10', why:'', src:'자사채용', yr:8, role:'시니어 프로덕트 디자이너 · 당근' },
  { id:'c21', nm:'오지환', p:'p2', st:'s2', s:'late', d:5,  ap:'2026-08-03', en:'2026-08-07', why:'HM 미응답 48h', src:'추천', yr:5, role:'프로덕트 디자이너 · 리디', act:['HM에게 리마인드','직접 검토'] },
  { id:'c22', nm:'유가온', p:'p2', st:'s3', s:'idle', d:4,  ap:'2026-08-01', en:'2026-08-08', why:'과제 발송 · 마감 8/15', src:'원티드', yr:7, role:'프로덕트 디자이너 · 카카오' },
  { id:'c23', nm:'심우진', p:'p2', st:'s3', s:'late', d:8,  ap:'2026-07-29', en:'2026-08-04', why:'과제 마감 초과 2d', src:'링크드인', yr:5, role:'UX/UI 디자이너 · 무신사', act:['마감 연장','후보자에 확인'] },
  { id:'c24', nm:'노유진', p:'p2', st:'s4', s:'done', d:3,  ap:'2026-07-30', en:'2026-08-09', why:'8/13 11:00 확정', src:'추천', yr:9, role:'디자인 리드 · 배민' },
  { id:'c25', nm:'배시우', p:'p2', st:'s5', s:'idle', d:6,  ap:'2026-07-22', en:'2026-08-06', why:'오퍼 승인 대기', src:'자사채용', yr:7, role:'프로덕트 디자이너 · 쿠팡' },
  { id:'c26', nm:'강예린', p:'p2', st:'s0', s:'done', d:10, ap:'2026-07-28', en:'2026-08-02', why:'포트폴리오 불합격', src:'원티드', yr:3, role:'주니어 디자이너', ex:'s2', rj:'skill' },

  /* p3 데이터 엔지니어 — 가장 오래된 공고(TTF 43일). 막판 임원 인터뷰가 EA라 사람 손이 많이 든다. */
  { id:'c27', nm:'임도현', p:'p3', st:'s1', s:'idle', d:0,  ap:'2026-08-12', en:'2026-08-12', why:'', src:'링크드인', yr:5, role:'데이터 엔지니어 · 야놀자' },
  { id:'c28', nm:'곽지원', p:'p3', st:'s2', s:'idle', d:3,  ap:'2026-08-05', en:'2026-08-09', why:'', src:'원티드',   yr:7, role:'데이터 플랫폼 · 쏘카' },
  { id:'c29', nm:'서하늬', p:'p3', st:'s3', s:'idle', d:5,  ap:'2026-07-31', en:'2026-08-07', why:'과제 발송 · 마감 8/17', src:'자사채용', yr:6, role:'데이터 엔지니어 · 뱅크샐러드' },
  { id:'c30', nm:'진태호', p:'p3', st:'s4', s:'idle', d:4,  ap:'2026-07-28', en:'2026-08-08', why:'90분 블록 탐색 중', src:'리멤버', yr:9, role:'데이터 엔지니어 · 라인' },
  { id:'c31', nm:'홍세라', p:'p3', st:'s4', s:'esc',  d:9,  ap:'2026-07-21', en:'2026-08-03', why:'면접관 전원 슬롯 거절', src:'원티드', yr:8, role:'시니어 데이터 엔지니어 · 네이버', act:['범위 넓혀 재탐색','대체 면접관 지정'] },
  { id:'c32', nm:'남지후', p:'p3', st:'s5', s:'idle', d:11, ap:'2026-07-15', en:'2026-08-01', why:'EA 조율 요청 발송', src:'추천', yr:11, role:'데이터 아키텍트 · 카카오' },
  { id:'c33', nm:'표민경', p:'p3', st:'s6', s:'esc',  d:16, ap:'2026-07-06', en:'2026-07-27', why:'연봉 밴드 초과 승인 필요', src:'링크드인', yr:12, role:'데이터 엔지니어링 리드 · 우아한형제들', act:['승인 요청','밴드 재검토'] },
  { id:'c34', nm:'최도경', p:'p3', st:'s0', s:'done', d:13, ap:'2026-07-20', en:'2026-07-30', why:'기술 과제 불합격', src:'자사채용', yr:4, role:'데이터 엔지니어', ex:'s3', rj:'skill' },
  { id:'c35', nm:'윤하람', p:'p3', st:'s0', s:'done', d:7,  ap:'2026-07-25', en:'2026-08-05', why:'후보자 사퇴', src:'원티드', yr:6, role:'데이터 엔지니어', ex:'s2', rj:'career' },

  /* p4 세일즈 매니저 — 공고 보류(hold). 자동화가 멈춰 후보자가 방치되는 상태를 보여준다. */
  { id:'c36', nm:'방주원', p:'p4', st:'s1', s:'idle', d:14, ap:'2026-07-29', en:'2026-07-29', why:'공고 보류 — 검토 대기', src:'원티드', yr:9, role:'엔터프라이즈 세일즈 · SAP' },
  { id:'c37', nm:'국지현', p:'p4', st:'s2', s:'late', d:19, ap:'2026-07-18', en:'2026-07-24', why:'공고 보류 19d · 후보자 방치', src:'링크드인', yr:11, role:'세일즈 매니저 · 오라클', act:['후보자에 상황 안내','공고 재개 검토'] },
  { id:'c38', nm:'천승호', p:'p4', st:'s3', s:'idle', d:21, ap:'2026-07-14', en:'2026-07-22', why:'보류로 조율 중단', src:'추천', yr:8, role:'AE · 세일즈포스' },
  { id:'c39', nm:'도경완', p:'p4', st:'s0', s:'done', d:24, ap:'2026-07-09', en:'2026-07-19', why:'서류 불합격', src:'자사채용', yr:5, role:'세일즈', ex:'s2', rj:'exp' },
  { id:'c40', nm:'편서율', p:'p4', st:'s0', s:'done', d:17, ap:'2026-07-16', en:'2026-07-26', why:'후보자 사퇴 — 대기 장기화', src:'원티드', yr:7, role:'세일즈', ex:'s2', rj:'withdraw', rjMemo:'대기가 길어지며 이직 계획 자체를 미뤘습니다. 공고 홀드 기간이 원인.' },

  /* p5 QA 엔지니어 — 이미 채용 완료(closed). 끝난 공고가 어떻게 남는지 보여준다. */
  { id:'c41', nm:'추민서', p:'p5', st:'s5', s:'done', d:31, ap:'2026-05-20', en:'2026-07-08', why:'7/13 입사 완료', src:'원티드', yr:6, role:'QA 엔지니어 · 넥슨' },
  { id:'c42', nm:'안겨울', p:'p5', st:'s0', s:'done', d:29, ap:'2026-05-22', en:'2026-06-14', why:'최종 불합격', src:'링크드인', yr:4, role:'QA', ex:'s3', rj:'better-fit' },
  { id:'c43', nm:'노건우', p:'p5', st:'s0', s:'done', d:35, ap:'2026-05-18', en:'2026-06-10', why:'서류 불합격', src:'자사채용', yr:3, role:'QA', ex:'s2', rj:'skill' },
  { id:'c44', nm:'마해원', p:'p5', st:'s0', s:'done', d:27, ap:'2026-05-29', en:'2026-06-20', why:'오퍼 거절 — 처우', src:'추천', yr:8, role:'QA 리드 · 엔씨', ex:'s4', rj:'comp' },
  { id:'c45', nm:'진소율', p:'p5', st:'s0', s:'done', d:33, ap:'2026-05-21', en:'2026-06-12', why:'서류 불합격', src:'원티드', yr:2, role:'QA', ex:'s2', rj:'exp' },
  { id:'c46', nm:'하동주', p:'p5', st:'s0', s:'done', d:22, ap:'2026-06-03', en:'2026-06-25', why:'실무 불합격', src:'리멤버', yr:5, role:'QA 엔지니어', ex:'s3', rj:'collab' },

  /* ---- 중복 정리 화면용 지원건 ----
     한 사람이 회사에 여러 번 지원하는 일은 흔하다. 신호의 세기가 서로 다른
     세 가지 경우를 일부러 심어 둔다. 판단 규칙은 lib/pool.ts 에 있다.
       c47 서지호  — c14 와 이메일이 같다        → 거의 확실 (email)
       c48 조은비  — c16 과 이름·직무·연차가 겹친다 → 가능성 높음 (name-role)
       c49 남궁현  — c15 와 이름만 같다          → 동명이인일 수 있음 (name) */
  { id:'c47', nm:'서지호', p:'p3', st:'s2', s:'idle', d:2, ap:'2026-08-08', en:'2026-08-10', why:'', src:'원티드',   yr:4, role:'데이터 엔지니어 · 카카오', email:'jiho.seo@example.com' },
  { id:'c48', nm:'조은비', p:'p1', st:'s2', s:'idle', d:1, ap:'2026-08-10', en:'2026-08-11', why:'', src:'자사채용', yr:6, role:'백엔드 · 핀테크' },
  { id:'c49', nm:'남궁현', p:'p2', st:'s2', s:'idle', d:3, ap:'2026-08-07', en:'2026-08-09', why:'', src:'링크드인', yr:5, role:'프로덕트 디자이너 · 토스' },
]

/* ---- 하이드레이션 폴백용 씨앗값 ----
   DB에 아직 없는 칸(연봉 밴드·전형 종료 사유)은 이 샘플값으로 채운다.
   반드시 '여기'에서 떠 둔다 — positions/cands 는 live binding 이라
   db.ts 쪽에서 뜨면 이미 DB 값으로 바뀐 배열을 읽게 될 수 있다. */
export const SEED_BAND: Record<string, [number, number]> = Object.fromEntries(
  positions.filter(p => p.band).map(p => [p.id, p.band!]),
)
export const SEED_RJ: Record<string, { rj: RejectCode; rjMemo?: string }> = Object.fromEntries(
  cands.filter(c => c.rj).map(c => [c.id, { rj: c.rj!, ...(c.rjMemo ? { rjMemo: c.rjMemo } : {}) }]),
)
/* 아직 DB에 칸이 없는 값(직전 단계·이메일)의 씨앗. 사유(SEED_RJ)와 같은 이유다 —
   칸이 없다고 화면에서 사라지면, 마이그레이션 전에는 기능 자체를 볼 수 없다. */
export const SEED_EX: Record<string, string> = Object.fromEntries(
  cands.filter(c => c.ex).map(c => [c.id, c.ex!]),
)
export const SEED_EMAIL: Record<string, string> = Object.fromEntries(
  cands.filter(c => c.email).map(c => [c.id, c.email!]),
)
/* 씨앗 지원건 원본 — DB에 아직 없는 건을 얹을 때 쓴다.
   _setData 가 cands 를 통째로 갈아끼우므로, 여기서 미리 떠 둬야 원본이 남는다. */
export const SEED_CANDS: Candidate[] = cands

export const LABEL: Record<Status, string> = { esc:'사람 대기', late:'지연', idle:'AI 진행', done:'완료' }
export const ORDER: Record<Status, number> = { esc:0, late:1, idle:2, done:3 }
export const KIND: Record<StageKind, string> = { apply:'접수', screen:'검토', interview:'인터뷰', task:'과제', offer:'오퍼', hired:'종료', reject:'종료' }

/* ---- 헬퍼 ---- */
export const md = (d: string) => { const p = d.split('-'); return `${+p[1]}/${+p[2]}` }
export const company = (role: string) => { const p = role.split('·'); return p[p.length - 1].trim() }

/* 우리 회사 이름은 여기 없다. 주인이 TalentCore 이라 lib/core.ts 의 orgName() 이
   /api/directory 에서 받아 온다. 위의 company() 는 '후보자가 지금 다니는 회사'라
   그 자리에 쓰면 안 된다 — 한 번 그렇게 나가서 "배민 채용 담당" 이 되었다. */
export const stagesOf = (pid: string) => stages[pid] || stages.p1
export const stageById = (pid: string, sid: string): Stage =>
  stagesOf(pid).find(s => s.id === sid) || ({ nm:'—', color:'#a8a8b2' } as Stage)
export const candsOf = (pid: string, list: Candidate[]) => list.filter(c => c.p === pid)
/* 클라이언트 번들에는 정적 샘플 공고만 들어 있다. 새로 만든 공고(p6…)는
   서버가 하이드레이트한 것을 props 로 넘겨줘야 제 이름이 보인다. 그 사이 여기서
   undefined 가 나오면 화면 전체가 죽으므로, 빈 껍데기를 돌려주고 화면은 뜨게 둔다. */
export const posById = (id: string): Position =>
  positions.find(p => p.id === id) || ({
    id, title: '—', dept: '—', team: '—', emp: '—',
    st: 'open', rec: '—', hm: '—', opened: '2026-08-12', ttf: 0, jd: '',
  } as Position)
export const personById = (id: string) => people.find(p => p.id === id)
export const byRisk = (a: Candidate, b: Candidate) => (ORDER[a.s] - ORDER[b.s]) || (b.d - a.d)
export const daysSince = (d: string) => {
  const p = d.split('-').map(Number)
  return Math.round((TODAY.getTime() - new Date(p[0], p[1] - 1, p[2]).getTime()) / 864e5)
}
export const activeCands = (pid: string) => cands.filter(c => c.p === pid && !stageById(pid, c.st).rail)
export const personByName = (nm: string) => people.find(p => p.nm === nm)

/* ---- 조율 처리함 (전 공고 에스컬레이션 집계) ---- */
export interface InboxItem { k: 'cand' | 'mtg'; s: Status; nm: string; st: string; pos: string; ag: string; why: string; act?: string[] }
export function inboxItems(): InboxItem[] {
  const out: InboxItem[] = []
  cands.forEach(c => {
    if (c.s === 'esc' || c.s === 'late')
      out.push({ k: 'cand', s: c.s, nm: c.nm, st: stageById(c.p, c.st).nm, pos: posById(c.p).title, ag: `${c.d}d`, why: c.why, act: c.act })
  })
  /* 미팅은 여기서 세지 않는다 — 저장된 s 가 아니라 지금 계산한 상태가 진짜라서,
     meetings.ts 의 inboxAll() 이 후보자 목록과 합쳐 준다(순환 import 회피). */
  return out.sort((a, b) => ORDER[a.s] - ORDER[b.s])
}

/* ---- C-4 자동화 설정 ---- */
export interface Rule { id: string; nm: string; d: string; on: boolean; th: string; lock?: boolean }
/* 면접 조율 정책 — 마이그레이션 010 이 automation 표에 추가한 칸과 1:1.
   전부 '코드 상수'가 아니라 '공고별 값'이다. 운영하면서 바뀌는 것들이라
   숫자를 코드에 박지 않고 여기(=DB)로 뺐다. 기본값은 사용자가 확정한 9건. */
export interface IvPolicy {
  holdH: number        // 가예약을 몇 시간 잡아 두는가 (48)
  weekCap: number      // 면접관 1명당 주당 권장 면접 수 (3)
  weekBlock: boolean   // 넘으면 막을 것인가 (false = 넛지만 띄운다)
  // 여유(버퍼). 확정값은 셋 다 0 — "여유 0분으로 다 잡고 RC 가 앞뒤를 보고 판단한다".
  // 칸을 남겨 둔 이유는 회사마다 이동시간 정책이 다르고, 나중에 로그가 쌓이면
  // 여기 숫자만 올려서 되돌릴 수 있게 하기 위해서다(코드는 손대지 않는다).
  bufIn: number        // 앞뒤 일정이 '사내'일 때 비울 분
  bufOut: number       // '외부'일 때 (이동시간)
  bufUnknown: number   // 성격을 모를 때
  slotMin: number      // 최소 이만큼은 찾아서 보낸다 (2)
  slotMax: number      // 후보자에게 한 번에 제시하는 자리 수 (5)
                       // 근거: Greenhouse·Ashby 는 3영업일 이상에 걸쳐 5~8개를 표준으로 본다.
                       // 많이 줄수록 첫 회신에 잡히지만 그만큼 면접관 캘린더를 오래 잡아 둔다.
  sendDays: number     // 자리를 찾는 범위 — 보내는 날부터 며칠(달력일) 안에서 (7 = 1주일)
                       // 훑는 시작점은 '오늘 자정'이 아니라 '지금'이다. 이미 지난 시각을 제시하면 안 된다.
  sendMode: 'parallel' | 'serial'  // 면접관에게 동시 발송(parallel)
  notifyCh: string     // 알림 경로 ('email')
  seniorLv: number     // 이 직급 이상이 끼면 발송 전 확인 (8 = 실장)
  r1Min: number        // 1차 길이 (60)
  r2Min: number        // 2차 면접관 1명당 길이 (60)
  r2Gap: number        // 2차 두 사람 사이 쉬는 시간 (0 = 연속)
}
export const DEFAULT_POLICY: IvPolicy = {
  holdH: 48, weekCap: 3, weekBlock: false,
  bufIn: 0, bufOut: 0, bufUnknown: 0,
  slotMin: 2, slotMax: 5, sendDays: 7, sendMode: 'parallel', notifyCh: 'email',
  seniorLv: 8, r1Min: 60, r2Min: 60, r2Gap: 0,
}
export interface AutoConfig { window: number; hours: string; buffer: number; candSla: number; ivSla: number; remind: string; tz: string; rules: Rule[]; pol?: IvPolicy }
/* 규칙 8종은 전 공고 공통 카탈로그다. 공고마다 on/off·임계값만 다르게 쓴다.
   over 로 넘긴 항목만 덮어써서, 공고별 차이가 한눈에 보이게 한다. */
function ruleSet(over: Record<string, Partial<Rule>> = {}): Rule[] {
  const base: Rule[] = [
    { id: 'r1', nm: '면접관 전원 슬롯 거절', d: '교집합이 0개일 때', on: true, th: '즉시' },
    { id: 'r2', nm: '면접관 미응답', d: '응답 제한 시간 초과', on: true, th: '24h' },
    { id: 'r3', nm: '후보자 미확인', d: '슬롯 발송 후 무응답', on: true, th: '36h' },
    { id: 'r4', nm: 'HM 평가지 미작성', d: '인터뷰 종료 후 미제출', on: true, th: '48h' },
    { id: 'r5', nm: '킥오프 참석자 미지정', d: '지정 요청 후 무응답', on: true, th: '48h' },
    { id: 'r6', nm: 'EA 조율 대상 포함', d: '자동화 제외 → 코디네이터 라우팅', on: true, th: '즉시', lock: true },
    { id: 'r7', nm: '일정 확정 후 취소 발생', d: '인비 취소 감지', on: true, th: '즉시' },
    { id: 'r8', nm: '단계 SLA 초과', d: '단계별 기준 체류일 초과', on: false, th: '기준 +2d' },
  ]
  return base.map(r => (over[r.id] ? { ...r, ...over[r.id] } : r))
}

export let auto: Record<string, AutoConfig> = {
  p1: {
    window: 10, hours: '10:00–18:00', buffer: 15, candSla: 48, ivSla: 24, remind: '12h / 4h 전', tz: '자동 감지',
    rules: ruleSet(),
  },
  // 과제 마감이 병목이라 SLA 초과 감시(r8)를 켠다.
  p2: {
    window: 14, hours: '10:00–19:00', buffer: 15, candSla: 48, ivSla: 24, remind: '24h / 2h 전', tz: '자동 감지',
    rules: ruleSet({ r8: { on: true, th: '기준 +1d' } }),
  },
  // 면접관 캘린더가 빡빡해 탐색 범위를 넓게, 응답 제한은 길게 잡았다.
  p3: {
    window: 15, hours: '09:00–18:00', buffer: 30, candSla: 72, ivSla: 48, remind: '12h / 4h 전', tz: '자동 감지',
    rules: ruleSet({ r2: { th: '48h' }, r8: { on: true, th: '기준 +3d' } }),
  },
  // 보류 공고 — 후보자·면접관을 재촉하는 자동 알림은 꺼 두고, 방치만 감시한다.
  p4: {
    window: 10, hours: '09:00–18:00', buffer: 15, candSla: 48, ivSla: 48, remind: '12h / 1h 전', tz: '자동 감지',
    rules: ruleSet({ r2: { on: false }, r3: { on: false }, r7: { on: false }, r8: { on: true, th: '기준 +5d' } }),
  },
  // 종료된 공고 — 조율 자동화는 전부 정지.
  p5: {
    window: 10, hours: '10:00–18:00', buffer: 15, candSla: 48, ivSla: 24, remind: '12h / 4h 전', tz: '자동 감지',
    rules: ruleSet({
      r1: { on: false }, r2: { on: false }, r3: { on: false },
      r4: { on: false }, r5: { on: false }, r7: { on: false },
    }),
  },
}

/* ---- C-5 지원 링크 ---- */
export interface LinkRow { ch: string; url: string; v: number; a: number }
export const links: Record<string, LinkRow[]> = {
  p1: [
    { ch: '자사 채용페이지', url: 'careers.example.com/p/be-senior', v: 412, a: 23 },
    { ch: '원티드', url: 'careers.example.com/p/be-senior?utm_source=wanted', v: 1240, a: 31 },
    { ch: '링크드인', url: 'careers.example.com/p/be-senior?utm_source=li', v: 880, a: 12 },
    { ch: '리멤버', url: 'careers.example.com/p/be-senior?utm_source=rmb', v: 530, a: 18 },
    { ch: '임직원 추천', url: 'careers.example.com/r/be-senior?ref=EMP', v: 96, a: 9 },
  ],
  p2: [
    { ch: '자사 채용페이지', url: 'careers.example.com/p/product-designer', v: 268, a: 19 },
    { ch: '원티드', url: 'careers.example.com/p/product-designer?utm_source=wanted', v: 940, a: 27 },
    { ch: '링크드인', url: 'careers.example.com/p/product-designer?utm_source=li', v: 610, a: 14 },
    { ch: '노트폴리오', url: 'careers.example.com/p/product-designer?utm_source=ntf', v: 355, a: 21 },
    { ch: '임직원 추천', url: 'careers.example.com/r/product-designer?ref=EMP', v: 72, a: 6 },
  ],
  p3: [
    { ch: '자사 채용페이지', url: 'careers.example.com/p/data-engineer', v: 331, a: 12 },
    { ch: '원티드', url: 'careers.example.com/p/data-engineer?utm_source=wanted', v: 1105, a: 24 },
    { ch: '링크드인', url: 'careers.example.com/p/data-engineer?utm_source=li', v: 792, a: 16 },
    { ch: '리멤버', url: 'careers.example.com/p/data-engineer?utm_source=rmb', v: 448, a: 11 },
    { ch: '임직원 추천', url: 'careers.example.com/r/data-engineer?ref=EMP', v: 58, a: 4 },
  ],
  p4: [
    { ch: '자사 채용페이지', url: 'careers.example.com/p/sales-manager', v: 187, a: 8 },
    { ch: '원티드', url: 'careers.example.com/p/sales-manager?utm_source=wanted', v: 623, a: 15 },
    { ch: '링크드인', url: 'careers.example.com/p/sales-manager?utm_source=li', v: 704, a: 19 },
    { ch: '임직원 추천', url: 'careers.example.com/r/sales-manager?ref=EMP', v: 41, a: 3 },
  ],
  p5: [
    { ch: '자사 채용페이지', url: 'careers.example.com/p/qa-engineer', v: 240, a: 14 },
    { ch: '원티드', url: 'careers.example.com/p/qa-engineer?utm_source=wanted', v: 812, a: 22 },
    { ch: '리멤버', url: 'careers.example.com/p/qa-engineer?utm_source=rmb', v: 396, a: 9 },
  ],
}

/* ---- 후보자 상세 타임라인 ---- */
export interface TLItem { t: string; b: string; p: string; s: string }
export const timeline: Record<string, TLItem[]> = {
  c11: [
    { t: '7/18 09:12', b: '지원 접수', p: '원티드 유입 · 자동 기록', s: 'done' },
    { t: '7/19 11:40', b: '서류 검토 통과', p: '최영수 · Pass', s: 'done' },
    { t: '7/22 14:00', b: '1차 인터뷰 확정', p: '슬롯 3개 발송 → 후보자 선택 · 자동 인비 발송', s: 'done' },
    { t: '7/25 14:00', b: '1차 인터뷰 완료', p: '최영수 Yes / 서민재 Yes · 전원 찬성', s: 'done' },
    { t: '7/31 09:00', b: '2차 인터뷰 슬롯 탐색', p: '2시간 연속 블록 · 영업일 10일 범위', s: 'done' },
    { t: '8/03 17:20', b: '면접관 전원 슬롯 거절', p: '한도경(EA 조율) · 윤태경(EA 조율) 모두 불가', s: 'bad' },
    { t: '8/03 17:20', b: '코디네이터로 라우팅', p: 'EA 조율 대상 포함 → 자동화 제외', s: 'now' },
  ],
}

/* ---- 전형 기록 (판정 흔적) ----
   위 timeline 은 화면 설명용으로 손으로 써 둔 예시다.
   이쪽에는 '실제로 사람이 누른 일'만 쌓인다 — 판정, 단계 이동, 되돌리기.
   그래야 나중에 "누가 언제 왜 이렇게 정했나"를 화면에서 답할 수 있다. */
export interface TrailItem {
  at: string      // 표시용 시각 라벨 (8/12 14:03)
  b: string       // 무슨 일이 있었나
  p: string       // 근거·사유
  s: string       // done | now | bad — 색이 아니라 상태 표시
}
export let trail: Record<string, TrailItem[]> = {}

/* ---- G. 평가 (스코어카드) ----
   척도 정의는 lib/scorecard.ts. 여기엔 제출된 평가만 담는다.
   각 평가는 자기 항목 이름을 들고 있으므로, 기본 항목 목록을
   나중에 바꿔도 과거 평가는 그대로 보존된다. */
export interface EvalItem {
  uid: string                    // 면접관 id
  iv: string                     // 면접관 이름(제출 시점 기준)
  role: string                   // 역할 표기
  st: string                     // 평가한 단계 이름
  items: [string, Rating][]      // [항목, 4점 척도]
  overall: Rating                // 종합 의견 — 항목 평균이 아니라 별도 판단
  memo: string
  at: string                     // 제출 시각 라벨
}
export let evals: Record<string, EvalItem[]> = {
  c11: [
    { uid:'u1', iv:'최영수', role:'HM', st:'1차 인터뷰', at:'7/25 15:10',
      items:[['직무 역량 깊이','syes'],['문제 해결 방식','yes'],['협업 · 이견 조율','yes'],['성장 가능성','yes']],
      overall:'yes', memo:'분산 트랜잭션 경험이 우리 문제와 정확히 맞습니다.' },
    { uid:'u4', iv:'서민재', role:'테크리드', st:'1차 인터뷰', at:'7/25 16:02',
      items:[['직무 역량 깊이','yes'],['문제 해결 방식','yes'],['협업 · 이견 조율','yes'],['성장 가능성','yes']],
      overall:'yes', memo:'코드 리뷰 문화에 대한 이해가 좋습니다.' },
  ],
  c24: [
    { uid:'u8', iv:'김서진', role:'HM', st:'과제 리뷰 인터뷰', at:'8/09 11:40',
      items:[['직무 역량 깊이','syes'],['문제 해결 방식','syes'],['협업 · 이견 조율','yes'],['성장 가능성','yes']],
      overall:'syes', memo:'과제에서 문제를 다시 정의한 점이 인상적입니다.' },
    { uid:'u11', iv:'유하린', role:'디자이너', st:'과제 리뷰 인터뷰', at:'8/09 12:15',
      items:[['직무 역량 깊이','yes'],['문제 해결 방식','syes'],['협업 · 이견 조율','yes'],['성장 가능성','yes']],
      overall:'yes', memo:'컴포넌트 체계를 스스로 만들어 본 경험이 있습니다.' },
  ],
  /* 이견이 남은 사례 — 한 명이 반대면 '전원 찬성'으로 덮지 않는다. */
  c30: [
    { uid:'u12', iv:'강태윤', role:'테크리드', st:'기술 인터뷰', at:'8/08 17:30',
      items:[['직무 역량 깊이','yes'],['문제 해결 방식','yes'],['협업 · 이견 조율','yes'],['성장 가능성','no']],
      overall:'no', memo:'설계는 좋으나 대규모 장애 대응 경험은 더 확인이 필요합니다.' },
  ],
  c33: [
    { uid:'u5', iv:'노아름', role:'HM', st:'임원 인터뷰', at:'7/27 10:20',
      items:[['조직 적합성','syes'],['중장기 기여','syes']],
      overall:'syes', memo:'팀을 세팅해 본 경험이 우리 상황과 맞습니다. 처우 밴드만 정리되면 진행.' },
  ],
}

/* ---- H. 오퍼 ----
   상태·승인·거절사유 규칙은 lib/offer.ts. 여기엔 오퍼 자체만 담는다.
   band 를 오퍼마다 복사해 두는 이유: 밴드는 해마다 바뀌는데,
   "그때 이 오퍼가 밴드를 넘었는가"는 나중에도 그대로 남아야 한다. */
export let offers: Record<string, Offer> = {
  /* 최유나 — 밴드 상단으로 승인까지 끝내고 나갔지만 후보자가 21일째 무응답.
     오퍼가 늘어지는 전형적 모습(응답 없음 = 조용한 위험). */
  c12: {
    cid: 'c12', st: 'sent', level: '스태프 엔지니어',
    base: 9800, sign: 1000, band: [8000, 10000],
    start: '2026-09-01', createdAt: '2026-07-22', sentAt: '2026-07-24',
    chain: [
      { uid:'u1', nm:'최영수', role:'하이어링 매니저', s:'ok', at:'7/23 09:40' },
    ],
  },
  /* 정하늘 — 정상 수락(3일 만에 응답). */
  c13: {
    cid: 'c13', st: 'accepted', level: '시니어 엔지니어',
    base: 8800, sign: 0, band: [8000, 10000],
    start: '2026-09-01', createdAt: '2026-07-25', sentAt: '2026-07-26', respAt: '2026-07-29',
    chain: [
      { uid:'u1', nm:'최영수', role:'하이어링 매니저', s:'ok', at:'7/25 17:20' },
    ],
  },
  /* 배시우 — 6일째 HM 승인 대기. 후보자는 이 사실을 모른다.
     '누가 공을 쥐고 있는지'가 안 보이면 이렇게 조용히 늘어진다. */
  c25: {
    cid: 'c25', st: 'approval', level: '프로덕트 디자이너',
    base: 7800, sign: 0, band: [6500, 8500],
    start: '2026-09-15', createdAt: '2026-08-06',
    chain: [
      { uid:'u8', nm:'김서진', role:'하이어링 매니저', s:'pending' },
    ],
  },
  /* 표민경 — 밴드 초과(9,500 상한에 10,200). 승인 단계가 하나 늘어
     본부장 결재가 붙었고, 16일째 거기서 멈춰 있다. */
  c33: {
    cid: 'c33', st: 'approval', level: '데이터 엔지니어링 리드',
    base: 10200, sign: 1500, band: [7500, 9500],
    start: '2026-09-15', createdAt: '2026-07-27',
    chain: [
      { uid:'u5', nm:'노아름', role:'하이어링 매니저', s:'ok', at:'7/27 14:05' },
      { uid:'u3', nm:'한도경', role:'본부 승인 (밴드 초과)', s:'pending' },
    ],
  },
  /* 추민서 — 종료된 공고의 수락 건. 끝난 오퍼가 어떻게 남는지. */
  c41: {
    cid: 'c41', st: 'accepted', level: 'QA 엔지니어 (계약)',
    base: 6200, sign: 0, band: [5500, 7000],
    start: '2026-07-13', createdAt: '2026-06-24', sentAt: '2026-06-25', respAt: '2026-06-30',
    chain: [
      { uid:'u13', nm:'임수정', role:'하이어링 매니저', s:'ok', at:'6/24 16:10' },
    ],
  },
  /* 마해원 — 거절. 사유가 항목으로 남아 있어야 다음 채용에 쓸 수 있다.
     밴드 상한(7,000)에 한참 못 미치는 6,400으로 나갔던 건이다. */
  c44: {
    cid: 'c44', st: 'declined', level: 'QA 리드 (계약)',
    base: 6400, sign: 0, band: [5500, 7000],
    createdAt: '2026-06-13', sentAt: '2026-06-14', respAt: '2026-06-20',
    declineCode: 'comp',
    declineMemo: '현 직장 대비 인상폭이 작다는 이유. 정규직 전환 시점도 걸림돌이었습니다.',
    chain: [
      { uid:'u13', nm:'임수정', role:'하이어링 매니저', s:'ok', at:'6/13 11:30' },
    ],
  },
}

/** 이 후보자의 오퍼 (없으면 undefined). */
export const offerOf = (cid: string) => offers[cid]

/** 오퍼 목록 — 만든 순으로. */
export const offerList = () =>
  Object.values(offers).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1)

/* ---- J. 대시보드 — 집계 ----
   숫자를 미리 적어두지 않고 위의 후보자·단계 데이터에서 그때그때 계산한다.
   (const 가 아니라 함수인 이유: DB 로 데이터를 갈아끼우면 결과도 같이 바뀌어야 한다)

   공고마다 단계 이름이 다르므로(‘서류 검토’ / ‘포트폴리오 검토’ …)
   공통 축은 단계 이름이 아니라 단계 유형(kind)으로 잡는다.
   과제(task)는 있는 공고와 없는 공고가 갈려 퍼널 축에서는 뺀다.
   — 검토와 인터뷰 사이 구간에 포함시켜 센다. */
const KIND_ORDER: StageKind[] = ['apply', 'screen', 'task', 'interview', 'offer', 'hired']
const kindRank = (k: StageKind) => KIND_ORDER.indexOf(k)

/** 이 후보자가 지금까지 도달한 가장 깊은 단계 유형.
    탈락자는 ex(빠진 단계)로, 진행 중인 사람은 현재 단계로 본다. */
function reachedKind(c: Candidate): StageKind {
  const sid = c.st === 's0' ? (c.ex || 's1') : c.st
  return stageById(c.p, sid).kind || 'apply'
}

const reachedAtLeast = (k: StageKind, list: Candidate[]) =>
  list.filter(c => kindRank(reachedKind(c)) >= kindRank(k)).length

/** 퍼널 — 각 구간을 '몇 명이 들어와서 몇 명이 넘어갔나'로 본다. */
export function funnelRows(list: Candidate[] = cands) {
  const steps: [StageKind, StageKind, string][] = [
    ['apply', 'screen', '지원 → 검토'],
    ['screen', 'interview', '검토 → 인터뷰'],
    ['interview', 'offer', '인터뷰 → 오퍼'],
    ['offer', 'hired', '오퍼 → 입사'],
  ]
  return steps.map(([from, to, l]) => {
    const n = reachedAtLeast(from, list)
    const d = reachedAtLeast(to, list)
    return { l, n, d, r: n ? Math.round((d / n) * 100) : 0 }
  })
}

/** 전형 종료 사유 — '우리가 거절'과 '후보자가 이탈'을 절대 한 줄로 합치지 않는다.
    합쳐 놓으면 탈락률이 높을 때 기준이 빡센 건지 우리가 안 팔린 건지 모른다.
    앞은 JD·소싱을 고쳐야 하고, 뒤는 처우·속도를 고쳐야 한다. */
export function rejectRows(list: Candidate[] = cands) {
  const rows = list.filter(c => c.rj)
  const count = (side: RejectSide) =>
    rows.filter(c => rejectDef(c.rj as RejectCode).side === side).length
  const items = REJECT_REASONS
    .map(def => ({ def, n: rows.filter(c => c.rj === def.v).length }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n)
  return { total: rows.length, us: count('us'), them: count('them'), items }
}

/** 단계별 평균 체류일 — 지금 그 단계에 앉아 있는 사람들의 d 평균.
    가장 오래 걸리는 단계에 hot 을 달아 병목으로 표시한다. */
export function dwellRows(list: Candidate[] = cands) {
  const LABEL_OF: Partial<Record<StageKind, string>> = {
    apply: '지원 접수', screen: '서류 · 포트폴리오 검토',
    task: '과제', interview: '인터뷰', offer: '오퍼',
  }
  const rows = (['apply', 'screen', 'task', 'interview', 'offer'] as StageKind[])
    .map(k => {
      const inK = list.filter(c => c.st !== 's0' && stageById(c.p, c.st).kind === k)
      const v = inK.length ? inK.reduce((a, c) => a + c.d, 0) / inK.length : 0
      return { l: LABEL_OF[k] as string, v: Math.round(v * 10) / 10, n: inK.length }
    })
    .filter(r => r.n > 0)
  const top = rows.reduce((a, b) => (b.v > a.v ? b : a), rows[0])
  return rows.map(r => (top && r.l === top.l ? { ...r, hot: true } : r)) as
    { l: string; v: number; n: number; hot?: boolean }[]
}

/** 유입 경로별 성과. 표본이 작으면 채용 소요일은 '—' 로 둔다(평균을 지어내지 않는다). */
export function sourceRows(list: Candidate[] = cands) {
  const keys = [...new Set(list.map(c => c.src))]
  return keys.map(s => {
    const rows = list.filter(c => c.src === s)
    const hires = rows.filter(c => reachedKind(c) === 'hired')
    const days = hires.map(c => Math.round(
      (new Date(c.en).getTime() - new Date(c.ap).getTime()) / 86400000))
    return {
      s, ap: rows.length, hire: hires.length,
      ttH: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
      rate: rows.length ? Math.round((hires.length / rows.length) * 1000) / 10 : 0,
    }
  }).sort((a, b) => b.ap - a.ap)
}

/** 상단 KPI 4종. */
export function kpis(list: Candidate[] = cands) {
  const live = list.filter(c => c.st !== 's0' && reachedKind(c) !== 'hired')
  const hires = list.filter(c => reachedKind(c) === 'hired')
  const ttf = positions.filter(p => p.st !== 'closed')
  const stuck = list.filter(c => c.s === 'esc' || c.s === 'late')
  const dw = dwellRows(list)
  const bottleneck = dw.reduce((a, b) => (b.v > a.v ? b : a), dw[0])
  const hireDays = hires.map(c => Math.round(
    (new Date(c.en).getTime() - new Date(c.ap).getTime()) / 86400000))
  return {
    live: live.length,
    hires: hires.length,
    avgTtf: ttf.length ? Math.round(ttf.reduce((a, p) => a + p.ttf, 0) / ttf.length) : 0,
    ttHire: hireDays.length
      ? Math.round(hireDays.reduce((a, b) => a + b, 0) / hireDays.length) : null,
    stuck: stuck.length,
    /* 이 제품의 핵심 지표 — 사람이 손대지 않고 굴러간 비율. */
    autoPct: live.length
      ? Math.round(((live.length - stuck.length) / live.length) * 100) : 0,
    bottleneck: bottleneck ? bottleneck.l : '—',
    bottleneckDays: bottleneck ? bottleneck.v : 0,
  }
}

/* ---- E-3. 일정 ---- */
export interface EventRow { t: string; nm: string; st: string; who: string; mode: string; s: Status; note?: string }
export const events: { d: string; ls: EventRow[] }[] = [
  { d: '8/13 (목)', ls: [
    { t: '10:00–11:00', nm: '임채원', st: '1차 인터뷰', who: '최영수, 서민재', mode: '화상', s: 'done' },
    { t: '11:00–12:30', nm: '노유진', st: '과제 리뷰 인터뷰', who: '김서진, 유하린', mode: '화상', s: 'done' },
    { t: '15:00–15:30', nm: '킥오프', st: '공고 미팅', who: '최영수 외 2', mode: '화상', s: 'done' },
    { t: '16:00–16:30', nm: '과제 기준 정렬', st: '공고 미팅', who: '김서진, 유하린', mode: '화상', s: 'idle' } ] },
  { d: '8/14 (금)', ls: [
    { t: '14:00–15:00', nm: '오시현', st: '1차 인터뷰', who: '최영수, 서민재', mode: '화상', s: 'done' } ] },
  { d: '8/17 (월)', ls: [
    { t: '—', nm: '이서연', st: '2차 인터뷰', who: '한도경, 윤태경', mode: '대면', s: 'esc', note: 'EA 조율 · 코디네이터 수동' },
    { t: '—', nm: '홍세라', st: '기술 인터뷰', who: '노아름, 강태윤', mode: '화상', s: 'esc', note: '면접관 전원 슬롯 거절 · 재탐색 필요' } ] },
  { d: '8/18 (화)', ls: [
    { t: '11:00–12:00', nm: '문태오', st: '1차 인터뷰', who: '최영수', mode: '화상', s: 'idle', note: '후보자 확인 대기' },
    { t: '—', nm: '진태호', st: '기술 인터뷰', who: '노아름, 강태윤', mode: '화상', s: 'idle', note: '90분 블록 탐색 중' } ] },
]

/* ---- K. Export 컬럼 그룹 ---- */
export const exportCols = [
  { g: '식별', n: 5, c: 'candidate_id, candidate_name, candidate_profile_url, position_id, position_title' },
  { g: '조직', n: 4, c: 'division, business_unit, team, employment_type' },
  { g: '출처', n: 6, c: 'source, source_detail, utm_source, utm_campaign, referrer_name, referrer_dept' },
  { g: '타임스탬프', n: 16, c: 'applied_at, screened_at, kickoff_at, interview1_at, interview2_at, debrief_at, offer_sent_at, offer_result_at, hired_at, rejected_at …' },
  { g: '소요일', n: 9, c: 'days_to_screen, days_to_interview1, days_to_interview2, days_to_offer, days_to_hire, days_in_current_stage …' },
  { g: '조율', n: 4, c: 'scheduling_attempts, scheduling_hours, manual_intervention, escalation_count' },
  { g: '결과', n: 3, c: 'final_result, reject_reason, offer_decline_reason' },
]

/* ---------------------------------------------------------
   데이터 교체 (Supabase 연결 시 db.ts 가 호출)
   ※ 위 배열들은 기본(샘플)값. 아래 함수로 DB 값으로 갈아끼운다.
     ES 모듈의 live binding 덕분에, 교체하면 이 값을 import 한
     render.ts 등 모든 곳이 자동으로 새 값을 본다.
   --------------------------------------------------------- */
/* 아직 DB에 칸이 없는 값(전형 종료 사유·직전 단계)의 덮개.
   화면에서 남긴 판정을 하이드레이션이 매번 지워 버리면 데모가 거짓말을 한다.
   마이그레이션이 끝나 DB가 값을 돌려주기 시작하면 언제나 DB 쪽이 이긴다. */
type RjPatch = { ex?: string; rj?: RejectCode; rjMemo?: string; decided?: string }
const rjOverlay: Record<string, RjPatch> = {}
/* 같은 이유의 덮개 하나 더 — '사람' 식별자(person_key)도 아직 DB에 칸이 없다.
   중복을 합쳐 놓고 새로고침하면 다시 갈라지는 일을 막는다. */
const pkOverlay: Record<string, string> = {}

/* 연봉 밴드도 같다 — 마이그레이션 004 전에는 positions 에 칸이 없어
   새로 만든 공고의 밴드가 저장되지 않는다. 그러면 오퍼 초안이 0~0 으로 만들어져
   '밴드 초과' 경고가 영원히 뜨는 만큼, 화면에서만이라도 값을 붙잡아 둔다. */
const bandOverlay: Record<string, [number, number]> = {}

export function _setData(d: Partial<{
  people: Person[]
  positions: Position[]
  stages: Record<string, Stage[]>
  meetings: Record<string, Meeting[]>
  cands: Candidate[]
  auto: Record<string, AutoConfig>
  evals: Record<string, EvalItem[]>
  offers: Record<string, Offer>
  trail: Record<string, TrailItem[]>
  avail: Record<string, { wh: [number, number]; busy: AvailBusy[] }>
}>) {
  if (d.people) people = d.people
  if (d.positions) positions = d.positions.map(p =>
    p.band ? p : bandOverlay[p.id] ? { ...p, band: bandOverlay[p.id] } : p)
  if (d.stages) stages = d.stages
  if (d.meetings) meetings = d.meetings
  if (d.cands) cands = d.cands.map(c => {
    const k = c.pk ?? pkOverlay[c.id]
    const o = rjOverlay[c.id]
    if (!o || c.rj) return k === c.pk ? c : { ...c, pk: k }
    return {
      ...c,
      ...(k ? { pk: k } : {}),
      ...(o.ex ? { ex: o.ex } : {}),
      ...(o.rj ? { rj: o.rj } : {}),
      ...(o.rjMemo ? { rjMemo: o.rjMemo } : {}),
      ...(o.decided ? { decided: o.decided } : {}),
    }
  })
  if (d.auto) auto = d.auto
  if (d.evals) evals = d.evals
  if (d.offers) offers = d.offers
  if (d.trail) trail = d.trail
  if (d.avail) avail = d.avail
}

/* 가용시간 인메모리 반영 — 면접관이 외부 링크(④)에서 저장할 때 함께 부른다.
   DB(또는 캘린더 연동)가 아직 없어도 일정 탐색이 바뀐 값을 바로 쓰게 하려는 것.
   덮어쓰기다(부분 병합 아님) — 화면이 그날의 전체 그림을 통째로 보내오기 때문. */
export function _setAvail(uid: string, wh: [number, number], busy: AvailBusy[]) {
  avail = { ...avail, [uid]: { wh, busy } }
}

/* 전형 기록 추가 — 판정 액션이 DB 저장과 함께 호출한다.
   DB 미설정이어도 후보자 상세의 타임라인에 바로 한 줄이 남는다. */
export function _pushTrail(cid: string, t: TrailItem) {
  trail = { ...trail, [cid]: [...(trail[cid] || []), t] }
}

/* 오퍼 인메모리 반영 — 승인·발송·응답 액션이 DB 저장과 함께 호출한다.
   DB 미설정이어도 데모에서 화면이 바로 바뀌게 하려는 것. */
export function _patchOffer(cid: string, patch: Partial<Offer>) {
  const cur = offers[cid]
  if (!cur) return
  offers = { ...offers, [cid]: { ...cur, ...patch } }
}

export function _setOffer(o: Offer) {
  offers = { ...offers, [o.cid]: o }
}

/* 후보자 카드 인메모리 반영 — 오퍼 수락·거절이 카드를 옮길 때 쓴다.
   DB 미설정이어도 오퍼 화면과 보드가 서로 다른 말을 하지 않게. */
/* 사람 한 명 고치기 — Hire 소유 칸(면접 역할·EA·채널·응답 기준)만 들어온다.
   TalentCore 소유 칸(이름·직함·부서·메일·재직여부)은 동기화가 주인이라 여기로 오지 않는다. */
export function _patchPerson(uid: string, patch: Partial<Person>) {
  people = people.map(u => (u.id === uid ? { ...u, ...patch } : u))
}

export function _patchCand(cid: string, patch: Partial<Candidate>) {
  cands = cands.map(c => (c.id === cid ? { ...c, ...patch } : c))
  /* 판정을 건드린 패치는 덮개에도 남긴다(되돌리기는 빈 덮개로 남아 지워진다). */
  if ('rj' in patch || 'ex' in patch || 'decided' in patch) {
    rjOverlay[cid] = { ex: patch.ex, rj: patch.rj, rjMemo: patch.rjMemo, decided: patch.decided }
  }
  if (patch.pk) pkOverlay[cid] = patch.pk
}

/* 평가 인메모리 반영 — 제출 액션이 DB 저장과 함께 호출한다.
   같은 면접관이 다시 제출하면 덮어쓴다(수정 = 재제출). */
export function _pushEval(cid: string, e: EvalItem) {
  const list = (evals[cid] || []).filter(x => x.uid !== e.uid)
  evals = { ...evals, [cid]: [...list, e] }
}

/* 공고 미팅 인메모리 반영 — 참석자 지정·시간 확정이 DB 저장과 함께 호출한다.
   미팅은 공고에 매달려 있어서 pid 를 같이 받아야 어느 목록을 고칠지 안다. */
export function _patchMeeting(pid: string, mid: string, patch: Partial<Meeting>) {
  const list = meetings[pid]
  if (!list) return
  meetings = { ...meetings, [pid]: list.map(m => (m.id === mid ? { ...m, ...patch } : m)) }
}

/* 자동화 설정 인메모리 갱신 — 서버 액션이 DB 저장과 함께 호출한다.
   DB 미설정이어도 같은 프로세스의 엔진(configFor)·렌더가 즉시 새 값을 본다. */
export function _patchAuto(pid: string, patch: Partial<AutoConfig>) {
  if (!auto[pid]) return
  auto[pid] = { ...auto[pid], ...patch }
}

/* 공고 개설 인메모리 반영 — 새 공고·단계·자동화 설정을 한꺼번에 넣는다.
   DB가 설정돼 있으면 다음 하이드레이션이 같은 값을 다시 실어 오고,
   미설정이어도 이번 세션에서는 보드가 열린다.
   ※ 기본 자동화 설정을 같이 넣지 않으면 configFor 가 p1 것을 빌려 쓰게 되어,
     새 공고가 남의 탐색 범위·응답 제한으로 돌아간다. */
export function _addPosition(p: Position, st: Stage[], a: AutoConfig) {
  if (p.band) bandOverlay[p.id] = p.band
  positions = [...positions.filter(x => x.id !== p.id), p]
  stages = { ...stages, [p.id]: st }
  auto = { ...auto, [p.id]: a }
}

/* 연봉 밴드만 고치기. 오퍼 초안이 이 값을 복사해 가므로,
   공고를 열어 둔 뒤에도 고칠 수 있어야 한다(처우가 나중에 정해지는 자리가 많다). */
export function _patchPositionBand(pid: string, band: [number, number]) {
  bandOverlay[pid] = band
  positions = positions.map(p => (p.id === pid ? { ...p, band } : p))
}

/* 공고 상태 인메모리 반영 — 마지막 자리가 차면 자동으로 닫는다(T5·D4).
   저장이 실패해도 화면은 닫힌 것으로 보여야 한다. 다음 하이드레이션에서
   DB 값으로 다시 맞춰진다. */
export function _patchPositionState(pid: string, st: Position['st']) {
  positions = positions.map(p => (p.id === pid ? { ...p, st } : p))
}

/* 채용 사이트 노출값(공개 여부·근무지·경력·마감일)만 고치기.
   마이그레이션 012 전 DB 에서는 저장이 실패하지만, 화면은 진행시킨다 —
   새로고침 전까지는 담당자가 방금 고친 대로 보인다. */
export function _patchPositionPublic(
  pid: string,
  patch: Partial<Pick<Position, 'pub' | 'loc' | 'exp' | 'due'>>,
) {
  positions = positions.map(p => (p.id === pid ? { ...p, ...patch } : p))
}

/* 인재풀에서 다시 올린 지원건 인메모리 반영.
   기존 지원건을 옮기지 않고 새 지원건을 만드는 이유는 pool.ts 머리글에 적어 뒀다.
   (과거 기록을 덮어쓰면 "왜 떨어졌었는지"가 사라진다.) */
export function _addCand(c: Candidate) {
  cands = [...cands.filter(x => x.id !== c.id), c]
  if (c.pk) pkOverlay[c.id] = c.pk
}

/* 새 지원건 id — 기존 c1..cN 뒤에 이어 붙인다. */
export function nextCandId(): string {
  const n = cands.reduce((m, c) => {
    const v = /^c(\d+)$/.exec(c.id)
    return v ? Math.max(m, +v[1]) : m
  }, 0)
  return `c${n + 1}`
}

/* 새 공고 id — 기존 p1..pN 뒤에 이어 붙인다. */
export function nextPositionId(): string {
  const n = positions.reduce((m, p) => {
    const v = /^p(\d+)$/.exec(p.id)
    return v ? Math.max(m, +v[1]) : m
  }, 0)
  return `p${n + 1}`
}

/* 새 공고의 기본 자동화 설정 — 표준값(p1과 동일)에서 시작한다. */
export function defaultAuto(): AutoConfig {
  return {
    window: 10, hours: '10:00–18:00', buffer: 15, candSla: 48, ivSla: 24,
    remind: '12h / 4h 전', tz: '자동 감지', rules: ruleSet(),
  }
}
