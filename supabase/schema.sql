-- =========================================================
-- Cadence (Hire / ATS) — 데이터베이스 설계도
-- Supabase SQL Editor에 통째로 붙여넣고 [Run] 하세요.
-- 안전하게 여러 번 실행 가능 (기존 표를 지우고 다시 만듭니다).
-- =========================================================

-- 기존 표가 있으면 깨끗이 제거 (의존 순서대로)
drop table if exists reminder_log cascade;
drop table if exists evaluations  cascade;
drop table if exists automation cascade;
drop table if exists candidates cascade;
drop table if exists meetings   cascade;
drop table if exists stages     cascade;
drop table if exists positions  cascade;
drop table if exists people     cascade;

-- ---------------------------------------------------------
-- 사람 (인터뷰어 · 하이어링 매니저 · 리크루터 · 코디네이터)
-- ---------------------------------------------------------
create table people (
  id      text primary key,
  nm      text not null,            -- 이름
  tt      text,                     -- 직함
  dept    text,                     -- 부서
  roles   text[] default '{}',      -- 역할 목록
  email   text,                     -- 리마인드 발송용 주소
  ea      boolean default false,    -- 비서(EA) 조율 대상 여부
  ch      text,                     -- 선호 채널 (slack/email/both)
  sla     int,                      -- 응답 기준 시간(h)
  resp    text,                     -- 평균 응답
  ea_nm   text                      -- 비서 이름 (있을 때)
);

-- ---------------------------------------------------------
-- 공고 (포지션)
-- ---------------------------------------------------------
create table positions (
  id      text primary key,
  title   text not null,
  dept    text,
  team    text,
  emp     text,                     -- 고용형태
  st      text default 'open',      -- open / hold / closed
  rec     text,                     -- 리크루터 이름
  hm      text,                     -- 하이어링 매니저 이름
  opened  date,
  ttf     int,                      -- time-to-fill(일)
  jd      text,
  band_lo int,                      -- 연봉 밴드 하단(만원) — 오퍼 초안이 복사해 간다
  band_hi int                       -- 연봉 밴드 상단(만원)
);

-- ---------------------------------------------------------
-- 단계 (공고별 파이프라인 단계)
-- ---------------------------------------------------------
create table stages (
  position_id text not null references positions(id) on delete cascade,
  id          text not null,        -- 공고 내 단계 id (s1, s2 ...)
  ord         int  not null,        -- 표시 순서
  nm          text not null,        -- 단계 이름
  kind        text,                 -- apply/screen/interview/task/offer/hired/reject
  sla         int,
  dur         int,                  -- 소요(분)
  mode        text,                 -- 진행 방식
  ivs         text[] default '{}',  -- 담당 인터뷰어 id 목록
  color       text,
  auto        boolean default false,-- 자동 진행 여부
  rail        boolean default false,-- 종료 레일(입사/불합격) 여부
  primary key (position_id, id)
);

-- ---------------------------------------------------------
-- 후보자
-- ---------------------------------------------------------
create table candidates (
  id          text primary key,
  position_id text not null references positions(id) on delete cascade,
  nm          text not null,        -- 이름
  st          text not null,        -- 현재 단계 id
  s           text default 'idle',  -- 상태 idle/esc/late/done
  d           int  default 0,       -- 현재 단계 체류일
  ap          date,                 -- 지원일
  en          date,                 -- 현재 단계 진입일
  why         text default '',      -- 상태 사유
  src         text,                 -- 유입 출처
  yr          int,                  -- 경력(년)
  role        text,                 -- 이력 요약
  act         text[],               -- 권장 액션 목록
  email       text,                 -- 리마인드 발송용 주소
  exit_stage  text,                 -- 탈락·사퇴 시 '어느 단계까지 갔었나' (퍼널 계산용)
  reject_code text,                 -- 전형 종료 사유 코드 (us=우리 판단 / them=후보자 이탈)
  reject_memo text,                 -- 전형 종료 자유 메모
  decided_at  date,                 -- 판정한 날
  updated_at  timestamptz default now(),
  foreign key (position_id, st) references stages(position_id, id)
);

-- ---------------------------------------------------------
-- 공고 미팅 (킥오프 · 디브리프 등)
-- ---------------------------------------------------------
create table meetings (
  id          text primary key,
  position_id text not null references positions(id) on delete cascade,
  nm          text not null,
  s           text default 'idle',  -- 상태
  v           text,                 -- 표시값 (일시/사유)
  ag          text,                 -- 경과
  dur         int,
  who         text[] default '{}',  -- 참석자 이름 목록
  act         text[]                -- 권장 액션
);

-- ---------------------------------------------------------
-- 자동화 설정 (공고별 · 에스컬레이션 규칙 + 슬롯 탐색/리마인더 파라미터)
-- ---------------------------------------------------------
create table automation (
  position_id text primary key references positions(id) on delete cascade,
  win         int,                    -- 슬롯 탐색 지평(영업일 수)
  hours       text,                   -- 탐색 시간대 (예: 10:00–18:00)
  buffer      int,                    -- 미팅 앞뒤 버퍼(분)
  cand_sla    int,                    -- 후보자 응답 제한(h)
  iv_sla      int,                    -- 면접관 응답 제한(h)
  remind      text,                   -- 리마인더 타이밍 (예: 12h / 4h 전)
  tz          text,                   -- 타임존
  rules       jsonb default '[]'      -- 에스컬레이션 규칙 배열
);

-- ---------------------------------------------------------
-- 평가 (스코어카드) — 면접관 1명이 후보자 1명에게 낸 평가 1건
-- 같은 면접관이 다시 내면 덮어쓴다(수정 = 재제출) → PK 가 (후보자, 면접관)
-- ---------------------------------------------------------
create table evaluations (
  candidate_id   text not null references candidates(id) on delete cascade,
  interviewer_id text not null,
  iv             text,               -- 면접관 이름(당시 값 보존)
  role           text,               -- 당시 역할 (HM / 테크리드 …)
  st             text,               -- 당시 단계 이름
  items          jsonb default '[]',  -- [["직무 역량 깊이","syes"], …]
  overall        text,               -- 종합 의견 sno/no/yes/syes
  memo           text default '',
  at             text,               -- 제출 시각 라벨
  updated_at     timestamptz default now(),
  primary key (candidate_id, interviewer_id)
);

-- ---------------------------------------------------------
-- 오퍼 — 후보자 1명당 1건
-- · 초안(draft)과 발송(sent)을 구분해야 수락률 분모가 망가지지 않는다.
-- · band_lo/hi 는 '이 오퍼를 판단하던 시점의 연봉 밴드'를 복사해 둔 값.
--   나중에 밴드가 바뀌어도 그때 판단 근거가 남게 하기 위함.
-- · chain 은 순차 승인 배열 [{uid,nm,role,s,at,memo}, …]
-- ---------------------------------------------------------
create table offers (
  candidate_id text primary key references candidates(id) on delete cascade,
  st           text not null default 'draft', -- draft/approval/sent/accepted/declined
  level        text,                          -- 직급 라벨
  base         integer default 0,             -- 기본 연봉(만원)
  sign         integer default 0,             -- 사이닝(만원)
  band_lo      integer default 0,
  band_hi      integer default 0,
  start_date   date,                          -- 입사 예정일
  chain        jsonb default '[]',
  created_at   date,
  sent_at      date,
  resp_at      date,
  decline_code text,                          -- 고정 사유 코드(comp/other-offer/…)
  decline_memo text,
  updated_at   timestamptz default now()
);

-- ---------------------------------------------------------
-- 리마인드 발송 기록 — 같은 알림이 두 번 나가는 것을 막는다
-- key 예: 'c11:720:i:u1' = 후보자 c11 · 12시간 전 · 면접관 u1
-- ---------------------------------------------------------
create table reminder_log (
  key      text primary key,
  cid      text,                     -- 후보자 id
  uid      text,                     -- 면접관 id (후보자 알림이면 null)
  channel  text,                     -- 이메일 / Slack / Slack·이메일
  to_addr  text,                     -- 실제 수신 주소(테스트 주소로 덮인 경우 그 값)
  ok       boolean default true,
  reason   text,                     -- 실패 사유
  sent_at  timestamptz default now()
);

-- ---------------------------------------------------------
-- 판정 기록 — 합격·보류·불합격을 누른 흔적
-- "누가 언제 왜"가 없으면 되돌린 뒤 아무도 이유를 모른다.
-- s: done(통과) / now(보류·되돌림) / bad(불합격·이탈)
-- ---------------------------------------------------------
create table stage_events (
  id           bigserial primary key,
  candidate_id text not null references candidates(id) on delete cascade,
  at           text,                   -- 화면에 찍는 시각 라벨 (예: 9/01 15:22)
  b            text,                   -- 굵은 줄 (무슨 일이 있었나)
  p            text,                   -- 설명 줄 (왜)
  s            text default 'done',
  created_at   timestamptz default now()
);

-- 조회 성능용 인덱스
create index idx_candidates_position on candidates(position_id);
create index idx_candidates_reject   on candidates(reject_code);
create index idx_stage_events_cand   on stage_events(candidate_id);
create index idx_stages_position     on stages(position_id);
create index idx_meetings_position   on meetings(position_id);
create index idx_evaluations_cand    on evaluations(candidate_id);
create index idx_offers_st           on offers(st);
create index idx_reminder_log_cid    on reminder_log(cid);

-- =========================================================
-- 접근 정책 (RLS)
-- ※ 아직 로그인 기능이 없는 데모 단계라, 공개키(anon)로
--    읽기·쓰기를 모두 허용합니다. 로그인 붙일 때 좁힙니다.
-- =========================================================
alter table people     enable row level security;
alter table positions  enable row level security;
alter table stages     enable row level security;
alter table candidates enable row level security;
alter table meetings   enable row level security;
alter table automation enable row level security;
alter table evaluations   enable row level security;
alter table reminder_log  enable row level security;
alter table offers        enable row level security;
alter table stage_events  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['people','positions','stages','candidates','meetings','automation','evaluations','reminder_log','offers','stage_events']
  loop
    execute format('drop policy if exists demo_all on %I;', t);
    execute format('create policy demo_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;
