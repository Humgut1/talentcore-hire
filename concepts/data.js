/* =========================================================
   Cadence — 프로토타입 데이터
   ※ 전부 기능 설명용 예시 데이터입니다. 실제 지표가 아닙니다.
   기준일 2026-08-12
   ========================================================= */
var TODAY = new Date(2026, 7, 12);

var DB = {

  me: { name: '정수민', role: '리크루터', init: '정' },

  /* ---------- I. 면접관 프로필 ---------- */
  people: [
    { id:'u1', nm:'최영수', tt:'서버팀 팀장',      dept:'플랫폼본부',   roles:['하이어링 매니저','인터뷰어'], ea:false, ch:'slack', sla:24, resp:'4.2h' },
    { id:'u2', nm:'정수민', tt:'채용 담당',        dept:'피플팀',       roles:['리크루터'],                   ea:false, ch:'both',  sla:12, resp:'1.1h' },
    { id:'u3', nm:'한도경', tt:'플랫폼본부 본부장', dept:'플랫폼본부',   roles:['인터뷰어'],                   ea:true,  ch:'email', sla:48, resp:'—',    eaNm:'김비서' },
    { id:'u4', nm:'서민재', tt:'서버팀 테크리드',   dept:'플랫폼본부',   roles:['인터뷰어'],                   ea:false, ch:'slack', sla:24, resp:'6.8h' },
    { id:'u5', nm:'노아름', tt:'데이터팀 팀장',     dept:'플랫폼본부',   roles:['인터뷰어'],                   ea:false, ch:'slack', sla:24, resp:'11.4h' },
    { id:'u6', nm:'배수진', tt:'HR 코디네이터',     dept:'피플팀',       roles:['코디네이터'],                 ea:false, ch:'both',  sla:12, resp:'0.6h' },
    { id:'u7', nm:'윤태경', tt:'CTO',              dept:'경영진',       roles:['인터뷰어'],                   ea:true,  ch:'email', sla:48, resp:'—',    eaNm:'김비서' }
  ],

  /* ---------- C-1. 공고 ---------- */
  positions: [
    { id:'p1', title:'백엔드 엔지니어 (시니어)', dept:'플랫폼본부', team:'서버팀',   emp:'정규직',
      st:'open', rec:'정수민', hm:'최영수', opened:'2026-07-20', ttf:23, jd:'분산 트랜잭션 처리와 대용량 이벤트 파이프라인을 설계·운영할 시니어 백엔드 엔지니어를 찾습니다.' },
    { id:'p2', title:'프로덕트 디자이너',        dept:'프로덕트본부', team:'디자인팀', emp:'정규직',
      st:'open', rec:'정수민', hm:'김서진', opened:'2026-07-28', ttf:15, jd:'B2B SaaS 제품의 핵심 플로우를 설계합니다.' },
    { id:'p3', title:'데이터 엔지니어',          dept:'플랫폼본부', team:'데이터팀', emp:'정규직',
      st:'open', rec:'박현우', hm:'노아름', opened:'2026-06-30', ttf:43, jd:'데이터 웨어하우스 구축과 파이프라인 운영.' },
    { id:'p4', title:'세일즈 매니저',            dept:'사업본부',   team:'세일즈팀', emp:'정규직',
      st:'hold', rec:'박현우', hm:'이강민', opened:'2026-07-02', ttf:41, jd:'엔터프라이즈 신규 고객 발굴.' },
    { id:'p5', title:'QA 엔지니어',              dept:'플랫폼본부', team:'품질팀',   emp:'계약직',
      st:'closed', rec:'정수민', hm:'최영수', opened:'2026-05-11', ttf:58, jd:'자동화 테스트 설계.' }
  ],

  /* ---------- C-2. 공고별 전형 단계 (커스터마이즈 대상) ---------- */
  /* kind: apply | screen | interview | task | offer | hired | reject */
  stages: {
    p1: [
      { id:'s1', nm:'지원 접수',  kind:'apply',     sla:1, dur:0,   mode:'—',    ivs:[],             color:'#c3c5e2', auto:true  },
      { id:'s2', nm:'서류 검토',  kind:'screen',    sla:3, dur:0,   mode:'—',    ivs:['u1'],         color:'#b0b3e3', auto:true  },
      { id:'s3', nm:'1차 인터뷰', kind:'interview', sla:5, dur:60,  mode:'화상', ivs:['u1','u4'],    color:'#9a9be4', auto:true  },
      { id:'s4', nm:'2차 인터뷰', kind:'interview', sla:7, dur:120, mode:'대면', ivs:['u3','u7'],    color:'#7d7be0', auto:false },
      { id:'s5', nm:'오퍼',       kind:'offer',     sla:5, dur:0,   mode:'—',    ivs:[],             color:'#5b53d6', auto:true  },
      { id:'s6', nm:'입사',       kind:'hired',     sla:0, dur:0,   mode:'—',    ivs:[],             color:'#0a9459', auto:false, rail:true },
      { id:'s0', nm:'불합격',     kind:'reject',    sla:0, dur:0,   mode:'—',    ivs:[],             color:'#a8a8b2', auto:false, rail:true }
    ]
  },

  /* ---------- C-4. 공고 자동화 설정 ---------- */
  auto: {
    p1: {
      window: 10,        /* 슬롯 탐색 범위 (영업일) */
      hours: '10:00–18:00',
      buffer: 15,        /* 면접 간 버퍼 (분) */
      candSla: 48,       /* 후보자 응답 제한 (시간) */
      ivSla: 24,         /* 면접관 응답 제한 (시간) */
      remind: '12h / 4h 전',
      tz: '자동 감지',
      rules: [
        { id:'r1', nm:'면접관 전원 슬롯 거절',      d:'교집합이 0개일 때',              on:true,  th:'즉시' },
        { id:'r2', nm:'면접관 미응답',              d:'응답 제한 시간 초과',            on:true,  th:'24h' },
        { id:'r3', nm:'후보자 미확인',              d:'슬롯 발송 후 무응답',            on:true,  th:'36h' },
        { id:'r4', nm:'HM 평가지 미작성',           d:'인터뷰 종료 후 미제출',          on:true,  th:'48h' },
        { id:'r5', nm:'킥오프 참석자 미지정',       d:'지정 요청 후 무응답',            on:true,  th:'48h' },
        { id:'r6', nm:'EA 조율 대상 포함',          d:'자동화 제외 → 코디네이터 라우팅', on:true, th:'즉시', lock:true },
        { id:'r7', nm:'일정 확정 후 취소 발생',     d:'인비 취소 감지',                 on:true,  th:'즉시' },
        { id:'r8', nm:'단계 SLA 초과',              d:'단계별 기준 체류일 초과',        on:false, th:'기준 +2d' }
      ]
    }
  },

  /* ---------- C-5. 지원 링크 ---------- */
  links: {
    p1: [
      { ch:'자사 채용페이지', url:'careers.example.com/p/be-senior',                    v:412, a:23 },
      { ch:'원티드',          url:'careers.example.com/p/be-senior?utm_source=wanted',  v:1240, a:31 },
      { ch:'링크드인',        url:'careers.example.com/p/be-senior?utm_source=li',      v:880,  a:12 },
      { ch:'리멤버',          url:'careers.example.com/p/be-senior?utm_source=rmb',     v:530,  a:18 },
      { ch:'임직원 추천',     url:'careers.example.com/r/be-senior?ref=EMP',            v:96,   a:9  }
    ]
  },

  /* ---------- F. 공고 단위 미팅 ---------- */
  meetings: {
    p1: [
      { id:'m1', nm:'킥오프',   s:'done', v:'8/4 14:00 완료', ag:'—',   dur:30, who:['최영수','한도경','서민재'] },
      { id:'m2', nm:'디브리프', s:'esc',  v:'참석자 미지정',  ag:'52h', dur:30, who:[], act:['참석자 지정 요청'] }
    ]
  },

  /* ---------- D. 후보자 ----------
     st  전형 단계 id
     s   조율 상태 idle | esc | late | done
     ap  유입(지원)일 · en 현재 단계 진입일 · d 단계 체류일
  ------------------------------------------------------- */
  cands: [
    { id:'c1',  nm:'한지우', p:'p1', st:'s1', s:'idle', d:0,  ap:'2026-08-12', en:'2026-08-12', why:'', src:'리멤버',   yr:7,  role:'백엔드 엔지니어 · 카카오' },
    { id:'c2',  nm:'배준영', p:'p1', st:'s1', s:'idle', d:1,  ap:'2026-08-11', en:'2026-08-11', why:'', src:'자사채용', yr:5,  role:'서버 개발자 · 토스' },
    { id:'c3',  nm:'강도윤', p:'p1', st:'s2', s:'idle', d:2,  ap:'2026-08-06', en:'2026-08-10', why:'', src:'원티드',   yr:9,  role:'테크리드 · 당근' },
    { id:'c4',  nm:'윤서아', p:'p1', st:'s2', s:'late', d:6,  ap:'2026-08-01', en:'2026-08-06', why:'HM 미응답 48h',    src:'추천',     yr:6,  role:'백엔드 · 라인', act:['HM에게 리마인드','직접 검토'] },
    { id:'c5',  nm:'문태오', p:'p1', st:'s2', s:'idle', d:1,  ap:'2026-08-09', en:'2026-08-11', why:'', src:'자사채용', yr:4,  role:'백엔드 · 스타트업' },
    { id:'c6',  nm:'신하경', p:'p1', st:'s2', s:'idle', d:3,  ap:'2026-08-04', en:'2026-08-09', why:'', src:'링크드인', yr:8,  role:'플랫폼 엔지니어 · 쿠팡' },
    { id:'c7',  nm:'박지훈', p:'p1', st:'s3', s:'late', d:5,  ap:'2026-07-28', en:'2026-08-07', why:'후보자 미확인 36h', src:'원티드', yr:10, role:'시니어 백엔드 · 네이버', act:['후보자에게 재발송','직접 연락'] },
    { id:'c8',  nm:'임채원', p:'p1', st:'s3', s:'idle', d:3,  ap:'2026-07-30', en:'2026-08-09', why:'슬롯 3개 발송',     src:'리멤버', yr:6,  role:'백엔드 · 배민' },
    { id:'c9',  nm:'오시현', p:'p1', st:'s3', s:'done', d:3,  ap:'2026-07-29', en:'2026-08-09', why:'8/14 14:00 확정',   src:'추천',   yr:7,  role:'백엔드 · 야놀자' },
    { id:'c10', nm:'김민준', p:'p1', st:'s4', s:'idle', d:9,  ap:'2026-07-20', en:'2026-08-03', why:'2시간 블록 탐색',   src:'링크드인', yr:11, role:'테크리드 · 우아한형제들' },
    { id:'c11', nm:'이서연', p:'p1', st:'s4', s:'esc',  d:12, ap:'2026-07-18', en:'2026-07-31', why:'면접관 전원 거절',  src:'원티드', yr:9,  role:'시니어 백엔드 · 카카오페이', act:['범위 넓혀 재탐색','직접 조율'] },
    { id:'c12', nm:'최유나', p:'p1', st:'s5', s:'esc',  d:21, ap:'2026-07-05', en:'2026-07-22', why:'처우 재협의',       src:'추천',   yr:12, role:'백엔드 아키텍트 · 라인', act:['처우안 수정','HM에 확인'] },
    { id:'c13', nm:'정하늘', p:'p1', st:'s6', s:'done', d:18, ap:'2026-06-30', en:'2026-07-25', why:'9/1 입사 예정',     src:'리멤버', yr:8,  role:'백엔드 · 쏘카' },
    { id:'c14', nm:'서지호', p:'p1', st:'s0', s:'done', d:11, ap:'2026-07-24', en:'2026-08-01', why:'서류 불합격',       src:'원티드', yr:3,  role:'주니어 백엔드' },
    { id:'c15', nm:'남궁현', p:'p1', st:'s0', s:'done', d:9,  ap:'2026-07-26', en:'2026-08-03', why:'서류 불합격',       src:'링크드인', yr:2, role:'백엔드' },
    { id:'c16', nm:'조은비', p:'p1', st:'s0', s:'done', d:14, ap:'2026-07-19', en:'2026-07-29', why:'1차 불합격',        src:'자사채용', yr:5, role:'백엔드' },
    { id:'c17', nm:'백승우', p:'p1', st:'s0', s:'done', d:6,  ap:'2026-07-31', en:'2026-08-06', why:'후보자 사퇴',       src:'추천',   yr:7,  role:'백엔드' }
  ],

  /* ---------- 후보자 상세 타임라인 (샘플) ---------- */
  timeline: {
    c11: [
      { t:'7/18 09:12', b:'지원 접수',            p:'원티드 유입 · 자동 기록',                       s:'done' },
      { t:'7/19 11:40', b:'서류 검토 통과',        p:'최영수 · Pass',                                 s:'done' },
      { t:'7/22 14:00', b:'1차 인터뷰 확정',       p:'슬롯 3개 발송 → 후보자 선택 · 자동 인비 발송',   s:'done' },
      { t:'7/25 14:00', b:'1차 인터뷰 완료',       p:'최영수 4.2 / 서민재 4.0 · Pass',                s:'done' },
      { t:'7/31 09:00', b:'2차 인터뷰 슬롯 탐색',  p:'2시간 연속 블록 · 영업일 10일 범위',            s:'done' },
      { t:'8/03 17:20', b:'면접관 전원 슬롯 거절', p:'한도경(EA 조율) · 윤태경(EA 조율) 모두 불가',   s:'bad'  },
      { t:'8/03 17:20', b:'코디네이터로 라우팅',   p:'EA 조율 대상 포함 → 자동화 제외',               s:'now'  }
    ]
  },

  /* ---------- G. 평가 (샘플) ---------- */
  evals: {
    c11: [
      { iv:'최영수', role:'HM',      st:'1차', tot:4.2, res:'Pass', items:[['기술 깊이',5],['설계 역량',4],['협업',4],['성장 가능성',4]], memo:'분산 트랜잭션 경험이 우리 문제와 정확히 맞습니다.' },
      { iv:'서민재', role:'테크리드', st:'1차', tot:4.0, res:'Pass', items:[['기술 깊이',4],['설계 역량',4],['협업',4],['성장 가능성',4]], memo:'코드 리뷰 문화에 대한 이해가 좋습니다.' }
    ]
  },

  /* ---------- J. 대시보드 ---------- */
  funnel: [
    { l:'지원 → 서류', n:96, d:62, r:65 },
    { l:'서류 → 1차',  n:62, d:34, r:55 },
    { l:'1차 → 2차',   n:34, d:19, r:56 },
    { l:'2차 → 오퍼',  n:19, d:11, r:58 },
    { l:'오퍼 → 수락', n:11, d:8,  r:73 }
  ],
  dwell: [
    { l:'지원 접수', v:1.2 }, { l:'서류 검토', v:3.1 }, { l:'1차 인터뷰', v:4.4 },
    { l:'2차 인터뷰', v:9.6, hot:true }, { l:'오퍼', v:6.8 }
  ],
  sources: [
    { s:'원티드',   ap:31, hire:2, ttH:38, rate:6.5 },
    { s:'리멤버',   ap:18, hire:2, ttH:31, rate:11.1 },
    { s:'추천',     ap:9,  hire:2, ttH:24, rate:22.2 },
    { s:'링크드인', ap:12, hire:1, ttH:44, rate:8.3 },
    { s:'자사채용', ap:23, hire:1, ttH:35, rate:4.3 }
  ],

  /* ---------- E-3. 일정 ---------- */
  events: [
    { d:'8/13 (목)', ls:[
      { t:'10:00–11:00', nm:'임채원', st:'1차 인터뷰', who:'최영수, 서민재', mode:'화상', s:'done' },
      { t:'15:00–15:30', nm:'킥오프', st:'공고 미팅',  who:'최영수 외 2',   mode:'화상', s:'done' } ] },
    { d:'8/14 (금)', ls:[
      { t:'14:00–15:00', nm:'오시현', st:'1차 인터뷰', who:'최영수, 서민재', mode:'화상', s:'done' } ] },
    { d:'8/17 (월)', ls:[
      { t:'—',           nm:'이서연', st:'2차 인터뷰', who:'한도경, 윤태경', mode:'대면', s:'esc', note:'EA 조율 · 코디네이터 수동' } ] },
    { d:'8/18 (화)', ls:[
      { t:'11:00–12:00', nm:'문태오', st:'1차 인터뷰', who:'최영수',        mode:'화상', s:'idle', note:'후보자 확인 대기' } ] }
  ],

  /* ---------- K. Export 컬럼 그룹 ---------- */
  exportCols: [
    { g:'식별',      n:5,  c:'candidate_id, candidate_name, candidate_profile_url, position_id, position_title' },
    { g:'조직',      n:4,  c:'division, business_unit, team, employment_type' },
    { g:'출처',      n:6,  c:'source, source_detail, utm_source, utm_campaign, referrer_name, referrer_dept' },
    { g:'타임스탬프', n:16, c:'applied_at, screened_at, kickoff_at, interview1_at, interview2_at, debrief_at, offer_sent_at, offer_result_at, hired_at, rejected_at …' },
    { g:'소요일',    n:9,  c:'days_to_screen, days_to_interview1, days_to_interview2, days_to_offer, days_to_hire, days_in_current_stage …' },
    { g:'조율',      n:4,  c:'scheduling_attempts, scheduling_hours, manual_intervention, escalation_count' },
    { g:'결과',      n:3,  c:'final_result, reject_reason, offer_decline_reason' }
  ]
};

var LABEL = { esc:'사람 대기', late:'지연', idle:'AI 진행', done:'완료' };
var ORDER = { esc:0, late:1, idle:2, done:3 };
var KIND  = { apply:'접수', screen:'검토', interview:'인터뷰', task:'과제', offer:'오퍼', hired:'종료', reject:'종료' };
