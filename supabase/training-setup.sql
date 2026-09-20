-- =========================================================
-- Cadence(Hire) — 연습용 프로젝트 한 번에 세우기
-- ---------------------------------------------------------
-- Grow 교육 모드가 쓸 '연습용 Hire' Supabase 프로젝트를 만들 때,
-- 이 파일을 통째로 복사해 SQL Editor 에 붙여넣고 [Run] 하세요.
-- schema.sql + 마이그레이션 전부를 순서대로 이어 붙인 것입니다.
--
-- 주의: 맨 앞에서 기존 표를 지웁니다(drop). 실제로 쓰는 프로젝트에는
--       절대 돌리지 마세요 — 새로 만든 연습용 프로젝트에서만.
--
-- 이 파일은 scripts/generate-training-sql.sh 가 만듭니다. 직접 고치지 마세요.
-- =========================================================

-- ───────── schema.sql ─────────

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

-- ───────── migration-002-evals-reminders.sql ─────────

-- =========================================================
-- Cadence — 추가 마이그레이션 002
-- 평가(스코어카드) · 리마인드 실발송 · 퍼널 계산용 컬럼
-- ---------------------------------------------------------
-- 기존 표를 지우지 않는 '추가만' 하는 스크립트입니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- 1) 새 컬럼 -------------------------------------------------
alter table people     add column if not exists email      text;
alter table candidates add column if not exists email      text;
alter table candidates add column if not exists exit_stage text;

-- 2) 평가(스코어카드) ---------------------------------------
create table if not exists evaluations (
  candidate_id   text not null references candidates(id) on delete cascade,
  interviewer_id text not null,
  iv             text,
  role           text,
  st             text,
  items          jsonb default '[]',
  overall        text,
  memo           text default '',
  at             text,
  updated_at     timestamptz default now(),
  primary key (candidate_id, interviewer_id)
);

-- 3) 리마인드 발송 기록 (중복 발송 방지) ---------------------
create table if not exists reminder_log (
  key      text primary key,
  cid      text,
  uid      text,
  channel  text,
  to_addr  text,
  ok       boolean default true,
  reason   text,
  sent_at  timestamptz default now()
);

create index if not exists idx_evaluations_cand on evaluations(candidate_id);
create index if not exists idx_reminder_log_cid on reminder_log(cid);

-- 4) 접근 정책 ----------------------------------------------
alter table evaluations  enable row level security;
alter table reminder_log enable row level security;
do $$
declare t text;
begin
  foreach t in array array['evaluations','reminder_log']
  loop
    execute format('drop policy if exists demo_all on %I;', t);
    execute format('create policy demo_all on %I for all using (true) with check (true);', t);
  end loop;
end $$;

-- 5) 탈락 후보자가 '어디까지 갔었는지' 채우기 (퍼널 계산용) ---
update candidates set exit_stage = v.ex from (values
  ('c14','s2'),('c15','s2'),('c16','s3'),('c17','s3'),('c26','s2'),
  ('c34','s3'),('c35','s2'),('c39','s2'),('c40','s2'),('c42','s3'),
  ('c43','s2'),('c44','s4'),('c45','s2'),('c46','s3')
) as v(id, ex) where candidates.id = v.id;

-- 6) 샘플 평가 6건 ------------------------------------------
insert into evaluations (candidate_id, interviewer_id, iv, role, st, items, overall, memo, at) values
  ('c11', 'u1', '최영수', 'HM', '1차 인터뷰', '[["직무 역량 깊이","syes"],["문제 해결 방식","yes"],["협업 · 이견 조율","yes"],["성장 가능성","yes"]]'::jsonb, 'yes', '분산 트랜잭션 경험이 우리 문제와 정확히 맞습니다.', '7/25 15:10'),
  ('c11', 'u4', '서민재', '테크리드', '1차 인터뷰', '[["직무 역량 깊이","yes"],["문제 해결 방식","yes"],["협업 · 이견 조율","yes"],["성장 가능성","yes"]]'::jsonb, 'yes', '코드 리뷰 문화에 대한 이해가 좋습니다.', '7/25 16:02'),
  ('c24', 'u8', '김서진', 'HM', '과제 리뷰 인터뷰', '[["직무 역량 깊이","syes"],["문제 해결 방식","syes"],["협업 · 이견 조율","yes"],["성장 가능성","yes"]]'::jsonb, 'syes', '과제에서 문제를 다시 정의한 점이 인상적입니다.', '8/09 11:40'),
  ('c24', 'u11', '유하린', '디자이너', '과제 리뷰 인터뷰', '[["직무 역량 깊이","yes"],["문제 해결 방식","syes"],["협업 · 이견 조율","yes"],["성장 가능성","yes"]]'::jsonb, 'yes', '컴포넌트 체계를 스스로 만들어 본 경험이 있습니다.', '8/09 12:15'),
  ('c30', 'u12', '강태윤', '테크리드', '기술 인터뷰', '[["직무 역량 깊이","yes"],["문제 해결 방식","yes"],["협업 · 이견 조율","yes"],["성장 가능성","no"]]'::jsonb, 'no', '설계는 좋으나 대규모 장애 대응 경험은 더 확인이 필요합니다.', '8/08 17:30'),
  ('c33', 'u5', '노아름', 'HM', '임원 인터뷰', '[["조직 적합성","syes"],["중장기 기여","syes"]]'::jsonb, 'syes', '팀을 세팅해 본 경험이 우리 상황과 맞습니다. 처우 밴드만 정리되면 진행.', '7/27 10:20')
on conflict (candidate_id, interviewer_id) do nothing;

-- ───────── migration-003-offers.sql ─────────

-- =========================================================
-- Cadence — 추가 마이그레이션 003
-- 오퍼(처우안 · 승인 체인 · 거절 사유)
-- ---------------------------------------------------------
-- 기존 표를 지우지 않는 '추가만' 하는 스크립트입니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- 1) 오퍼 표 -------------------------------------------------
--  · 초안(draft)과 발송(sent)을 구분해야 수락률 분모가 망가지지 않습니다.
--  · band_lo/hi 는 '그때 그 연봉 밴드'를 복사해 둔 값입니다.
--  · chain 은 순차 승인 배열 [{uid,nm,role,s,at,memo}, …]
create table if not exists offers (
  candidate_id text primary key references candidates(id) on delete cascade,
  st           text not null default 'draft',
  level        text,
  base         integer default 0,
  sign         integer default 0,
  band_lo      integer default 0,
  band_hi      integer default 0,
  start_date   date,
  chain        jsonb default '[]',
  created_at   date,
  sent_at      date,
  resp_at      date,
  decline_code text,
  decline_memo text,
  updated_at   timestamptz default now()
);

create index if not exists idx_offers_st on offers(st);

-- 2) 접근 정책 ----------------------------------------------
alter table offers enable row level security;
drop policy if exists demo_all on offers;
create policy demo_all on offers for all using (true) with check (true);

-- 3) 샘플 오퍼 6건 ------------------------------------------
insert into offers (candidate_id, st, level, base, sign, band_lo, band_hi, start_date, chain, created_at, sent_at, resp_at, decline_code, decline_memo) values
  ('c12', 'sent', '스태프 엔지니어', 9800, 1000, 8000, 10000, '2026-09-01', '[{"uid":"u1","nm":"최영수","role":"하이어링 매니저","s":"ok","at":"7/23 09:40"}]'::jsonb, '2026-07-22', '2026-07-24', null, null, null),
  ('c13', 'accepted', '시니어 엔지니어', 8800, 0, 8000, 10000, '2026-09-01', '[{"uid":"u1","nm":"최영수","role":"하이어링 매니저","s":"ok","at":"7/25 17:20"}]'::jsonb, '2026-07-25', '2026-07-26', '2026-07-29', null, null),
  ('c25', 'approval', '프로덕트 디자이너', 7800, 0, 6500, 8500, '2026-09-15', '[{"uid":"u8","nm":"김서진","role":"하이어링 매니저","s":"pending"}]'::jsonb, '2026-08-06', null, null, null, null),
  ('c33', 'approval', '데이터 엔지니어링 리드', 10200, 1500, 7500, 9500, '2026-09-15', '[{"uid":"u5","nm":"노아름","role":"하이어링 매니저","s":"ok","at":"7/27 14:05"},{"uid":"u3","nm":"한도경","role":"본부 승인 (밴드 초과)","s":"pending"}]'::jsonb, '2026-07-27', null, null, null, null),
  ('c41', 'accepted', 'QA 엔지니어 (계약)', 6200, 0, 5500, 7000, '2026-07-13', '[{"uid":"u13","nm":"임수정","role":"하이어링 매니저","s":"ok","at":"6/24 16:10"}]'::jsonb, '2026-06-24', '2026-06-25', '2026-06-30', null, null),
  ('c44', 'declined', 'QA 리드 (계약)', 6400, 0, 5500, 7000, null, '[{"uid":"u13","nm":"임수정","role":"하이어링 매니저","s":"ok","at":"6/13 11:30"}]'::jsonb, '2026-06-13', '2026-06-14', '2026-06-20', 'comp', '현 직장 대비 인상폭이 작다는 이유. 정규직 전환 시점도 걸림돌이었습니다.')
on conflict (candidate_id) do nothing;

-- ───────── migration-004-decision.sql ─────────

-- =========================================================
-- Cadence — 추가 마이그레이션 004
-- 전형 판정 (합격 · 보류 · 불합격) + 연봉 밴드 + 판정 기록
-- ---------------------------------------------------------
-- 기존 표를 지우지 않는 '추가만' 하는 스크립트입니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- 1) 후보자 — 전형 종료 사유 칸 ------------------------------
--  · reject_code : 정해진 사유 코드(우리 판단 us / 후보자 이탈 them)
--  · reject_memo : 자유 메모(무엇이 걸렸는지 — 다음 채용의 유일한 자산)
--  · decided_at  : 판정한 날
--  · exit_stage  : 어느 단계에서 끝났는지(되돌리기가 이 값을 씁니다)
alter table candidates add column if not exists reject_code text;
alter table candidates add column if not exists reject_memo text;
alter table candidates add column if not exists decided_at  date;
alter table candidates add column if not exists exit_stage  text;

create index if not exists idx_candidates_reject on candidates(reject_code);

-- 2) 공고 — 연봉 밴드 칸 -------------------------------------
--  오퍼 초안이 자동으로 만들어질 때 '그때의 밴드'를 복사해 갑니다.
alter table positions add column if not exists band_lo integer;
alter table positions add column if not exists band_hi integer;

update positions set band_lo = 8000,  band_hi = 10000 where id = 'p1';
update positions set band_lo = 6500,  band_hi = 8500  where id = 'p2';
update positions set band_lo = 7500,  band_hi = 9500  where id = 'p3';
update positions set band_lo = 6000,  band_hi = 8000  where id = 'p4';
update positions set band_lo = 5500,  band_hi = 7000  where id = 'p5';

-- 3) 판정 기록 표 --------------------------------------------
--  "누가 언제 왜"가 없으면 되돌린 뒤 아무도 이유를 모릅니다.
--  s: done(통과) / now(보류·되돌림) / bad(불합격·이탈)
create table if not exists stage_events (
  id           bigserial primary key,
  candidate_id text not null references candidates(id) on delete cascade,
  at           text,
  b            text,
  p            text,
  s            text default 'done',
  created_at   timestamptz default now()
);

create index if not exists idx_stage_events_cand on stage_events(candidate_id);

alter table stage_events enable row level security;
drop policy if exists demo_all on stage_events;
create policy demo_all on stage_events for all using (true) with check (true);

-- 4) 종료된 샘플 후보자 14명의 사유 --------------------------
--  화면(대시보드 '전형 종료 사유')이 지금 보여주는 값과 같은 값입니다.
update candidates set exit_stage='s2', reject_code='skill',       decided_at=en::date where id='c14';
update candidates set exit_stage='s2', reject_code='exp',         decided_at=en::date where id='c15';
update candidates set exit_stage='s3', reject_code='skill',       decided_at=en::date where id='c16';
update candidates set exit_stage='s3', reject_code='other-offer', decided_at=en::date,
       reject_memo='경쟁사 오퍼 수락. 연봉보다 합류 시점이 빨랐던 점이 컸다고 합니다.' where id='c17';
update candidates set exit_stage='s2', reject_code='skill',       decided_at=en::date where id='c26';
update candidates set exit_stage='s3', reject_code='skill',       decided_at=en::date where id='c34';
update candidates set exit_stage='s2', reject_code='career',      decided_at=en::date where id='c35';
update candidates set exit_stage='s2', reject_code='exp',         decided_at=en::date where id='c39';
update candidates set exit_stage='s2', reject_code='withdraw',    decided_at=en::date,
       reject_memo='대기가 길어지며 이직 계획 자체를 미뤘습니다. 공고 홀드 기간이 원인.' where id='c40';
update candidates set exit_stage='s3', reject_code='better-fit',  decided_at=en::date where id='c42';
update candidates set exit_stage='s2', reject_code='skill',       decided_at=en::date where id='c43';
update candidates set exit_stage='s4', reject_code='comp',        decided_at=en::date where id='c44';
update candidates set exit_stage='s2', reject_code='exp',         decided_at=en::date where id='c45';
update candidates set exit_stage='s3', reject_code='collab',      decided_at=en::date where id='c46';

-- ───────── migration-005-availability.sql ─────────

-- =========================================================
-- Cadence — 추가 마이그레이션 005
-- 면접관 가용시간 (외부 링크 ④ 저장소)
-- ---------------------------------------------------------
-- 기존 표를 지우지 않는 '추가만' 하는 스크립트입니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- 1) 가용시간 표 ---------------------------------------------
--  · 사람당 한 줄입니다. 면접 건마다 다시 묻지 않기 위해서입니다.
--  · wh_lo/wh_hi 는 근무시간(자정으로부터의 분). 10:00 = 600.
--  · busy 는 [{date,start,end}, …] — '안 되는 시간'만 담습니다.
--    화면에서는 '되는 시간'을 고르지만, 일정 엔진이 읽는 형식이 busy 라
--    저장 직전에 뒤집습니다(표현을 하나로 둬야 캘린더 연동이 붙을 때 자리가 같습니다).
create table if not exists availability (
  uid        text primary key references people(id) on delete cascade,
  wh_lo      integer not null default 600,
  wh_hi      integer not null default 1080,
  busy       jsonb   not null default '[]',
  updated_at timestamptz default now()
);

-- 2) 접근 정책 ----------------------------------------------
alter table availability enable row level security;
drop policy if exists demo_all on availability;
create policy demo_all on availability for all using (true) with check (true);

-- 3) 샘플 7명 ------------------------------------------------
--  표가 비어 있으면 앱은 '아무도 시간을 안 냈다'로 읽습니다.
--  데모에서 일정 탐색이 계속 돌아가도록 기존 샘플을 그대로 옮겨 둡니다.
insert into availability (uid, wh_lo, wh_hi, busy) values
  ('u1', 600, 1080, '[{"date":"2026-08-12","start":600,"end":720},{"date":"2026-08-12","start":840,"end":900},{"date":"2026-08-13","start":600,"end":660},{"date":"2026-08-13","start":660,"end":720},{"date":"2026-08-14","start":840,"end":900},{"date":"2026-08-17","start":900,"end":960},{"date":"2026-08-18","start":600,"end":960},{"date":"2026-08-19","start":780,"end":840},{"date":"2026-08-20","start":600,"end":660},{"date":"2026-08-21","start":960,"end":1020}]'::jsonb),
  ('u4', 600, 1080, '[{"date":"2026-08-12","start":780,"end":840},{"date":"2026-08-13","start":600,"end":660},{"date":"2026-08-13","start":900,"end":960},{"date":"2026-08-14","start":840,"end":900},{"date":"2026-08-14","start":960,"end":1020},{"date":"2026-08-17","start":660,"end":720},{"date":"2026-08-18","start":600,"end":660},{"date":"2026-08-19","start":780,"end":840},{"date":"2026-08-20","start":840,"end":900},{"date":"2026-08-21","start":600,"end":720}]'::jsonb),
  ('u5', 600, 1080, '[{"date":"2026-08-13","start":780,"end":900},{"date":"2026-08-18","start":600,"end":720},{"date":"2026-08-20","start":900,"end":1020}]'::jsonb),
  ('u8', 600, 1140, '[{"date":"2026-08-12","start":600,"end":660},{"date":"2026-08-12","start":900,"end":990},{"date":"2026-08-13","start":660,"end":720},{"date":"2026-08-14","start":600,"end":720},{"date":"2026-08-14","start":900,"end":960},{"date":"2026-08-17","start":840,"end":960},{"date":"2026-08-18","start":600,"end":660},{"date":"2026-08-19","start":900,"end":1020},{"date":"2026-08-20","start":600,"end":720}]'::jsonb),
  ('u11', 600, 1140, '[{"date":"2026-08-12","start":840,"end":900},{"date":"2026-08-13","start":600,"end":660},{"date":"2026-08-14","start":780,"end":840},{"date":"2026-08-17","start":600,"end":720},{"date":"2026-08-19","start":600,"end":660},{"date":"2026-08-21","start":900,"end":1020}]'::jsonb),
  ('u12', 540, 1080, '[{"date":"2026-08-12","start":540,"end":660},{"date":"2026-08-12","start":780,"end":840},{"date":"2026-08-13","start":540,"end":660},{"date":"2026-08-13","start":900,"end":1020},{"date":"2026-08-14","start":540,"end":660},{"date":"2026-08-17","start":540,"end":660},{"date":"2026-08-17","start":780,"end":900},{"date":"2026-08-18","start":540,"end":720},{"date":"2026-08-19","start":540,"end":660},{"date":"2026-08-19","start":840,"end":960},{"date":"2026-08-20","start":540,"end":660}]'::jsonb),
  ('u13', 600, 1080, '[{"date":"2026-08-13","start":600,"end":660},{"date":"2026-08-18","start":840,"end":900},{"date":"2026-08-20","start":600,"end":660}]'::jsonb)
on conflict (uid) do nothing;

-- ───────── migration-006-pool.sql ─────────

-- =========================================================
-- Cadence — 추가 마이그레이션 006
-- 인재풀 · 중복 정리 ('사람' 식별자)
-- ---------------------------------------------------------
-- 기존 표를 지우지 않는 '추가만' 하는 스크립트입니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================

-- 1) 후보자 — '사람' 식별자 칸 -------------------------------
--  지원건(candidates)은 '한 번의 지원'이고, person_key 는 '그 사람'입니다.
--  같은 사람이 여러 번 지원하면 지원건은 여러 줄로 남고,
--  person_key 만 같은 값으로 묶습니다. 지원건을 합치거나 지우지 않는 이유는
--  과거에 왜 떨어졌는지가 다음 채용의 유일한 자산이기 때문입니다.
--  · 비어 있으면 '아직 아무도 확인하지 않음' = 자기 자신이 곧 사람입니다.
alter table candidates add column if not exists person_key text;

create index if not exists idx_candidates_person on candidates(person_key);

-- 2) 중복 정리 화면용 지원건 ---------------------------------
--  한 사람이 회사에 여러 번 지원하는 일은 흔합니다.
--  신호의 세기가 서로 다른 세 경우를 일부러 심어 둡니다.
--    c47 서지호 — c14 와 이메일이 같음          → 거의 확실
--    c48 조은비 — c16 과 이름·직무·연차가 겹침  → 가능성 높음
--    c49 남궁현 — c15 와 이름만 같음            → 동명이인일 수 있음
--  (email 칸은 마이그레이션 002 에서 이미 추가돼 있습니다.)
update candidates set email = 'jiho.seo@example.com' where id = 'c14' and email is null;

insert into candidates (id, position_id, nm, st, s, d, ap, en, why, src, yr, role, email) values
  ('c47', 'p3', '서지호', 's2', 'idle', 2, '2026-08-08', '2026-08-10', '', '원티드',   4, '데이터 엔지니어 · 카카오',  'jiho.seo@example.com'),
  ('c48', 'p1', '조은비', 's2', 'idle', 1, '2026-08-10', '2026-08-11', '', '자사채용', 6, '백엔드 · 핀테크',           null),
  ('c49', 'p2', '남궁현', 's2', 'idle', 3, '2026-08-07', '2026-08-09', '', '링크드인', 5, '프로덕트 디자이너 · 토스',  null)
on conflict (id) do nothing;

-- ───────── migration-007-core-link.sql ─────────

-- =========================================================
-- migration 007 — TalentCore 자리 카드 ↔ Hire 공고 연결 (T3)
-- ---------------------------------------------------------
-- TalentCore(HRIS)에서 채용 요청서가 결재를 통과하면 요청 인원수만큼
-- '자리 카드(job_openings)'가 생긴다. 인사담당자가 그중 여러 장을 골라
-- Hire 로 밀면, 그 묶음이 이 공고 한 건이 된다.
--
--   자리 카드 3장  →  공고 1개 (openings = 3)
--
-- 왜 카드 1장 = 공고 1개가 아닌가:
--   같은 직무 3명을 뽑을 때 보드를 3개로 나누면 같은 지원자를 어느 보드에
--   넣을지 매번 골라야 한다. Greenhouse·Workday 도 요청(자리)과 공고를
--   분리하고 자리 여러 개를 공고 하나에 매단다. 합격자가 나올 때마다
--   TalentCore 쪽 카드가 한 장씩 filled 로 바뀐다.
--
-- 이 파일은 되돌릴 수 있다(칸만 추가한다). 기존 공고는 openings=1 로 남는다.
-- =========================================================

alter table positions add column if not exists req_ref       text;
alter table positions add column if not exists openings      int  default 1;
alter table positions add column if not exists opening_codes text[] default '{}';

comment on column positions.req_ref       is 'TalentCore 채용 요청서 번호(REQ-12). 출처 표시·역추적용';
comment on column positions.openings      is '이 공고가 채우는 자리 수. TalentCore 자리 카드 장수와 같다';
comment on column positions.opening_codes is 'TalentCore 자리 카드 코드 목록(OP-12-1 …). 합격자를 어느 카드에 채울지 고를 때 쓴다';

create index if not exists idx_positions_req on positions(req_ref);

-- ───────── migration-008-directory.sql ─────────

-- =========================================================
-- migration 008 — TalentCore 직원 명부 ↔ Hire 사람 명단 (T4)
-- ---------------------------------------------------------
-- Hire 가 하루 한 번 TalentCore 에서 직원 명부를 당겨온다.
--
--   TalentCore(원본)  이름 · 직함 · 부서 · 메일 · 재직여부
--   Hire(여기)        면접 역할 · EA 조율 · 알림 채널 · 응답 기준 · 평균 응답
--
-- 이 경계를 칸으로 못박는 게 이 마이그레이션의 전부다. src='core' 인 사람은
-- 위 왼쪽 칸을 동기화가 덮어쓰고, 오른쪽 칸은 절대 건드리지 않는다.
-- src='hire' 인 사람(Hire 에서 직접 만든 외부 면접관 등)은 동기화가 손대지 않는다.
--
-- 퇴사자는 지우지 않고 active=false 로 잠근다. 지우면 그 사람이 봤던
-- 과거 면접 기록에서 이름이 사라진다.
--
-- 되돌릴 수 있다(칸만 추가한다). 기존 13명은 src='hire' 로 남아 그대로 동작한다.
-- =========================================================

alter table people add column if not exists emp_no    text;
alter table people add column if not exists src       text default 'hire';
alter table people add column if not exists active    boolean default true;
alter table people add column if not exists core_role text;
alter table people add column if not exists synced_at timestamptz;

comment on column people.emp_no    is 'TalentCore 사번(TC-00001). 동기화가 사람을 알아보는 열쇠';
comment on column people.src       is 'core = TalentCore 에서 온 사람(왼쪽 칸은 동기화가 주인) / hire = Hire 에서 직접 만든 사람';
comment on column people.active    is '재직 중인가. false 면 새 면접에 배정할 수 없지만 과거 기록에는 남는다';
comment on column people.core_role is 'TalentCore 상의 역할(admin/manager/recruiter/employee). 면접관 지정 판단용 참고값';
comment on column people.synced_at is '마지막으로 TalentCore 와 맞춘 시각. 화면의 “마지막 동기화”가 이 값이다';

-- 사번은 있으면 유일해야 한다. 없는 사람(외부 면접관)은 여러 명이어도 된다.
create unique index if not exists idx_people_emp_no on people(emp_no) where emp_no is not null;
create index        if not exists idx_people_active on people(active);

-- 기존 데이터 정리 — 지금 들어 있는 사람은 전부 Hire 가 직접 만든 사람이다.
update people set src = 'hire' where src is null;
update people set active = true where active is null;

-- ───────── migration-009-seat.sql ─────────

-- =========================================================
-- migration 009 — 오퍼가 어느 자리에 앉는지 적어 둔다 (T5)
-- ---------------------------------------------------------
-- 007 에서 공고가 "자리 카드 3장"을 들고 있게 됐다. 하지만 합격자가
-- 나왔을 때 그 3장 중 어느 장에 앉는지는 아무도 적지 않았다.
--
-- 자리마다 레벨이 다르다. TalentCore 요청서에 "L5 1명 · L3 2명"이라고
-- 적었으면 카드도 그렇게 떨어진다. L3 후보자를 L5 카드에 앉히면
-- 정원도 예산도 어긋난다. 그래서 처우안을 쓸 때 자리를 고르고,
-- 그 자리 코드를 오퍼에 박아 둔다.
--
--   처우안 작성 → 자리 선택(OP-12-2) → 승인 → 발송 → 수락
--                                                    ↓
--                        TalentCore /api/hires 로 OP-12-2 와 함께 넘어간다
--
-- 자리를 잡아 두는 시점은 '수락'이다. 보낼 때 잡아 두면 거절 한 번에
-- 자리가 묶여 다음 후보자를 못 넣는다. 대신 처우안 화면에서
-- "남은 자리 2 · 진행 중 오퍼 3" 을 보여 준다.
--
-- 이 파일은 되돌릴 수 있다(칸만 추가한다). 기존 오퍼는 비어 있는 채로 남고,
-- 자리 없이 수락되면 TalentCore 에서 '정원 밖'으로 받는다.
-- =========================================================

alter table offers add column if not exists opening_code text;

comment on column offers.opening_code is 'TalentCore 자리 카드 코드(OP-12-2). 수락 시 이 카드로 합격자가 넘어간다';

create index if not exists idx_offers_opening on offers(opening_code);

-- ───────── migration-010-interviews.sql ─────────

-- =========================================================
-- Cadence — 추가 마이그레이션 010
-- 면접 조율 (S1) — 면접 1건 · 면접관 구간 · 제시 슬롯 · 조율 로그
-- ---------------------------------------------------------
-- 기존 표를 지우지 않는 '추가만' 하는 스크립트입니다.
-- 여러 번 실행해도 안전합니다.
--
-- 지금까지 면접 일정은 후보자 카드의 why 칸에 '8/14 14:00 확정' 같은
-- 글자로만 남아 있었습니다. 글자는 세 가지를 못 합니다.
--   ① 누가 언제 왜 거절했는지 못 남긴다  ② 가예약 48시간을 셀 수 없다
--   ③ 이번 주 이 사람 면접이 몇 번인지 셀 수 없다
-- 그래서 면접을 표로 세웁니다.
--
--   interviews            면접 1건 (후보자 × 회차)
--    ├ interview_parts    그 면접 안의 면접관 구간. 1차는 1줄, 2차는 2줄
--    ├ interview_slots    후보자에게 내민 시간 후보들
--    └ interview_events   조율 로그 (왜 이렇게 됐나)
--
-- 확정된 전형 규칙 (2026-09-06):
--   1차 = 하이어링 매니저 혼자 60분
--   2차 = 차상위 리더 + 협업 리더, 각 60분을 이어서 = 120분 연속, 사이 휴식 없음
-- =========================================================


-- 0) 옛 세대 표 치우기 ---------------------------------------
--  이 Supabase 프로젝트에는 2026년 4월에 접은 옛 ATS(ats-system)의 표가
--  그대로 남아 있습니다. 지금 Cadence 앱은 이 표들을 한 줄도 읽지 않습니다.
--    applications 2줄 · position_stages 14줄 · interviews 1줄 · 나머지 0줄
--  이름이 겹쳐서(interviews / interview_slots) 새 표를 못 만들기 때문에
--  legacy_ 를 앞에 붙여 옆으로 밀어 둡니다.
--
--  지우지 않고 이름만 바꾸는 이유: 되돌릴 수 있게 하기 위해서입니다.
--  나중에 확실해지면 그때 legacy_* 를 통째로 지우면 됩니다.
do $$
declare t text;
begin
  -- 옛 interviews 인지 새 interviews 인지는 total_min 칸 유무로 구분한다
  if to_regclass('public.interviews') is not null
     and to_regclass('public.legacy_interviews') is null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'interviews'
                       and column_name = 'total_min') then
    execute 'alter table public.interviews rename to legacy_interviews';
  end if;

  if to_regclass('public.interview_slots') is not null
     and to_regclass('public.legacy_interview_slots') is null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'interview_slots'
                       and column_name = 'st_min') then
    execute 'alter table public.interview_slots rename to legacy_interview_slots';
  end if;

  foreach t in array array['applications','application_stage_history','position_stages',
                           'interview_interviewers','escalations','users'] loop
    if to_regclass('public.' || t) is not null
       and to_regclass('public.legacy_' || t) is null then
      execute format('alter table public.%I rename to %I', t, 'legacy_' || t);
    end if;
  end loop;
end $$;


-- 1) 면접관 직급 레벨 ----------------------------------------
--  실장(L8) 이상이 면접에 들어가면 발송 직전 리크루터에게 확인을 받습니다.
--  판단하려면 그 사람의 직급 숫자가 있어야 합니다. TalentCore 가 주인인 칸이라
--  008 의 경계 규칙대로 동기화가 덮어씁니다.
alter table people add column if not exists core_level int;
comment on column people.core_level is 'TalentCore 직급 레벨(1~9). 8 이상이면 발송 전 리크루터 확인 모달';


-- 2) 조율 규칙 값 --------------------------------------------
--  확정한 9가지를 코드에 박지 않고 공고별 설정으로 둡니다.
--  기존 automation.buffer(15분 일괄)는 남겨 두되 아래 세 칸이 대신합니다.
alter table automation add column if not exists hold_h      int     default 48;
alter table automation add column if not exists week_cap    int     default 3;
alter table automation add column if not exists week_block  boolean default false;
alter table automation add column if not exists buf_in      int     default 0;
alter table automation add column if not exists buf_out     int     default 60;
alter table automation add column if not exists buf_unknown int     default 60;
alter table automation add column if not exists slot_min    int     default 2;
alter table automation add column if not exists send_mode   text    default 'parallel';
alter table automation add column if not exists notify_ch   text    default 'email';
alter table automation add column if not exists senior_lv   int     default 8;
alter table automation add column if not exists r1_min      int     default 60;
alter table automation add column if not exists r2_min      int     default 60;
alter table automation add column if not exists r2_gap      int     default 0;

comment on column automation.hold_h      is '가예약을 붙잡아 두는 시간(h). 지나면 캘린더에서 떼어 낸다';
comment on column automation.week_cap    is '한 면접관의 주당 면접 권장 상한. 넘어도 막지 않고 화면에 표시만 한다';
comment on column automation.week_block  is 'true 면 상한을 넘긴 사람을 후보에서 뺀다. 확정값은 false(넛지만)';
comment on column automation.buf_in      is '사내 일정 뒤에 두는 여유(분). 확정값 0';
comment on column automation.buf_out     is '외부 일정 뒤에 두는 여유(분)';
comment on column automation.buf_unknown is '직전 일정 성격을 모를 때 두는 여유(분). 리크루터가 한 번 눌러 해제할 수 있다';
comment on column automation.slot_min    is '이 개수만 모이면 후보자에게 보낸다. 확정값 2';
comment on column automation.send_mode   is 'parallel = 면접관·후보자 동시 발송 / serial = 면접관 확정 후 후보자';
comment on column automation.notify_ch   is '후보자 알림 채널. 확정값 email (알림톡 제외)';
comment on column automation.senior_lv   is '이 레벨 이상이 면접관에 있으면 발송 전 확인 모달';
comment on column automation.r1_min      is '1차 길이(분)';
comment on column automation.r2_min      is '2차 면접관 1명당 길이(분). 2명이면 이 값 × 2';
comment on column automation.r2_gap      is '2차 두 면접 사이 쉬는 시간(분). 확정값 0 — 현장에서 조율한다';

update automation set buf_in = 0, buf_out = 60, buf_unknown = 60 where buf_in is null;


-- 3) 면접 1건 ------------------------------------------------
--  후보자 1명의 1차 면접이 1줄, 2차 면접이 또 1줄입니다.
--  다시 잡을 때는 새 줄을 만들지 않고 이 줄의 슬롯을 갈아 끼웁니다.
--  총 길이는 total_min 한 곳에만 적습니다 — 1차 60, 2차 120.
create table if not exists interviews (
  id           text primary key,
  candidate_id text not null references candidates(id) on delete cascade,
  position_id  text not null references positions(id)  on delete cascade,
  stage_id     text,                           -- 어느 단계의 면접인가 (s3 / s4)
  round        int  not null default 1,        -- 1차 / 2차
  kind         text not null default 'solo',   -- solo(혼자) / seq(이어서 여러 명)
  total_min    int  not null default 60,       -- 후보자가 앉아 있는 총 시간
  st           text not null default 'draft',  -- 진행 상태 (아래 설명)
  s            text not null default 'idle',   -- 카드 색 idle/esc/late/done
  why          text default '',                -- 상태 한 줄 사유

  sched_date   date,                           -- 확정된 날
  sched_start  int,                            -- 시작 (자정으로부터 분). 14:00 = 840
  sched_end    int,                            -- 끝
  mode         text,                           -- 화상 / 대면
  loc          text,                           -- 회의실 또는 화상 링크

  sent_at      timestamptz,                    -- 후보자에게 슬롯을 보낸 시각
  replied_at   timestamptz,                    -- 후보자가 고른 시각
  hold_until   timestamptz,                    -- 가예약이 풀리는 시각 (보낸 시각 + 48h)
  senior_ack   boolean default false,          -- 고위 면접관 확인 모달을 통과했는가
  pick_token   text,                           -- 후보자 선택 페이지 주소에 붙는 열쇠
  cal_event_id text,                           -- 확정 후 만든 캘린더 일정 id

  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

comment on table  interviews            is '면접 1건 = 후보자 1명 × 회차 1개';
comment on column interviews.st         is 'draft 준비 / searching 슬롯 탐색 / proposed 후보자에게 발송(가예약 중) / confirmed 확정 / done 종료 / canceled 취소';
comment on column interviews.kind       is 'solo = 면접관 1명 / seq = 여러 명이 쉬는 시간 없이 이어서';
comment on column interviews.pick_token is '메일 링크용 1회성 열쇠. 로그인 없이 이 면접만 볼 수 있게 한다';

create unique index if not exists idx_interviews_token      on interviews(pick_token) where pick_token is not null;
create unique index if not exists idx_interviews_cand_round on interviews(candidate_id, round);
create index        if not exists idx_interviews_cand       on interviews(candidate_id);
create index        if not exists idx_interviews_pos        on interviews(position_id);
create index        if not exists idx_interviews_st         on interviews(st);
create index        if not exists idx_interviews_date       on interviews(sched_date);


-- 4) 면접관 구간 ---------------------------------------------
--  1차는 1줄, 2차는 2줄입니다. off_min 은 면접 시작으로부터 몇 분 뒤에
--  이 사람 차례가 오는가 — 2차 두 번째 면접관은 60 입니다(사이 휴식 0분).
--  이름·직함을 복사해 두는 이유는 evaluations 와 같습니다. 사람이 부서를
--  옮기거나 퇴사해도 '그때 누가 봤는지'가 남아야 합니다.
create table if not exists interview_parts (
  interview_id   text not null references interviews(id) on delete cascade,
  ord            int  not null,                -- 순서 1, 2
  interviewer_id text not null references people(id),
  iv_nm          text,                         -- 당시 이름
  iv_role        text,                         -- 당시 직함
  src            text,                         -- 이 자리가 어디서 왔나 (아래 설명)
  core_level     int,                          -- 당시 직급 레벨
  off_min        int  not null default 0,      -- 시작으로부터 (분)
  dur            int  not null default 60,     -- 이 사람 몫 (분)

  resp           text default 'none',          -- none / accepted / declined
  resp_at        timestamptz,
  decline_code   text,                         -- 아래 설명
  decline_memo   text,
  cal_event_id   text,                         -- 이 사람에게 걸어 둔 가예약 일정 id

  primary key (interview_id, ord)
);

comment on column interview_parts.src          is 'hm = 요청서의 하이어링 매니저(1차) / upper = 그 위 조직의 리더(2차) / collab = 요청서에 적은 협업 리더(2차) / manual = 리크루터가 직접 넣음';
comment on column interview_parts.off_min      is '면접 시작으로부터 몇 분 뒤. 2차 두 번째 면접관은 60 (사이 휴식 없음)';
comment on column interview_parts.decline_code is 'conflict 다른 일정 / calendar_missing 캘린더에 안 적힌 일정 / travel 이동 시간 부족 / other 기타';

create index if not exists idx_iv_parts_uid  on interview_parts(interviewer_id);
create index if not exists idx_iv_parts_resp on interview_parts(resp);


-- 5) 제시 슬롯 -----------------------------------------------
--  후보자에게 내민 시간 후보들입니다. 2개만 모여도 보냅니다(확정값).
--  buf_note 는 '직전 일정이 사내인지 외부인지 모르겠다'를 담는 칸입니다.
--  모를 때 여유를 걸어 두되, 리크루터가 한 번 눌러 풀 수 있게 표시를 남깁니다.
create table if not exists interview_slots (
  id           bigserial primary key,
  interview_id text not null references interviews(id) on delete cascade,
  ord          int  not null default 0,        -- 화면에 보이는 순서
  d            date not null,                  -- 날짜
  st_min       int  not null,                  -- 시작 (분)
  en_min       int  not null,                  -- 끝 (분)
  st           text not null default 'offered',-- offered / picked / dropped / expired
  buf_note     text,                           -- 'unknown' 이면 직전 일정 성격 불명
  hold_ids     text[] default '{}',            -- 이 슬롯으로 걸어 둔 가예약 일정 id 목록
  hold_until   timestamptz,                    -- 이 슬롯 가예약이 풀리는 시각
  created_at   timestamptz default now()
);

comment on column interview_slots.st       is 'offered 제시됨 / picked 후보자가 고름 / dropped 다른 슬롯이 확정돼 뗌 / expired 48시간 지나 풀림';
comment on column interview_slots.buf_note is 'unknown = 직전 일정 성격을 몰라 여유를 걸어 둔 슬롯. 리크루터가 해제할 수 있다';

create index if not exists idx_iv_slots_iv   on interview_slots(interview_id);
create index if not exists idx_iv_slots_date on interview_slots(d);


-- 6) 조율 로그 -----------------------------------------------
--  stage_events 와 같은 모양입니다. 일정이 왜 이렇게 됐는지 남기지 않으면
--  다음 사람이 처음부터 다시 추측해야 합니다.
create table if not exists interview_events (
  id           bigserial primary key,
  interview_id text not null references interviews(id) on delete cascade,
  at           text,                           -- 화면에 찍는 시각 라벨 (8/12 15:22)
  b            text,                           -- 굵은 줄 (무슨 일)
  p            text,                           -- 설명 줄 (왜)
  s            text default 'idle',            -- 색 idle/esc/late/done
  actor        text,                           -- 누가 (사람 id 또는 'auto')
  created_at   timestamptz default now()
);

create index if not exists idx_iv_events_iv on interview_events(interview_id);


-- 7) 접근 정책 ----------------------------------------------
alter table interviews       enable row level security;
alter table interview_parts  enable row level security;
alter table interview_slots  enable row level security;
alter table interview_events enable row level security;

drop policy if exists demo_all on interviews;
drop policy if exists demo_all on interview_parts;
drop policy if exists demo_all on interview_slots;
drop policy if exists demo_all on interview_events;

create policy demo_all on interviews       for all using (true) with check (true);
create policy demo_all on interview_parts  for all using (true) with check (true);
create policy demo_all on interview_slots  for all using (true) with check (true);
create policy demo_all on interview_events for all using (true) with check (true);


-- 8) 면접관 직급 채우기 ---------------------------------------
--  TalentCore 동기화가 붙기 전까지 화면이 돌아가도록 넣어 둡니다.
update people set core_level = 9 where id in ('u3','u7','u10') and core_level is null;
update people set core_level = 6 where id in ('u1','u5','u8','u13') and core_level is null;
update people set core_level = 5 where id in ('u4','u12') and core_level is null;
update people set core_level = 4 where id in ('u11') and core_level is null;
update people set core_level = 3 where id in ('u2','u6','u9') and core_level is null;


-- 9) 샘플 면접 5건 -------------------------------------------
--  지금 보드에 글자로만 적혀 있는 상태를 그대로 표로 옮깁니다.
--    c7  박지훈  1차 발송했는데 후보자 무응답 36h
--    c8  임채원  1차 슬롯 3개 발송, 가예약 중
--    c9  오시현  1차 8/14 14:00 확정
--    c10 김민준  2차 120분 연속 블록 탐색 중
--    c11 이서연  2차 면접관 전원 거절
insert into interviews
  (id, candidate_id, position_id, stage_id, round, kind, total_min, st, s, why,
   sched_date, sched_start, sched_end, mode, loc,
   sent_at, replied_at, hold_until, senior_ack, pick_token) values
  ('iv1','c7' ,'p1','s3',1,'solo', 60,'proposed' ,'late','후보자 미확인 36h',
     null,null,null,'화상',null,
     '2026-08-11 10:20+09', null, '2026-08-13 10:20+09', false, 'demo-tok-c7'),
  ('iv2','c8' ,'p1','s3',1,'solo', 60,'proposed' ,'idle','슬롯 3개 발송',
     null,null,null,'화상',null,
     '2026-08-12 09:05+09', null, '2026-08-14 09:05+09', false, 'demo-tok-c8'),
  ('iv3','c9' ,'p1','s3',1,'solo', 60,'confirmed','done','8/14 14:00 확정',
     '2026-08-14',840,900,'화상','https://meet.example.com/cadence-c9',
     '2026-08-10 11:00+09', '2026-08-10 15:42+09', null, false, 'demo-tok-c9'),
  ('iv4','c10','p1','s4',2,'seq' ,120,'searching','idle','2시간 연속 블록 탐색',
     null,null,null,'대면',null,
     null, null, null, false, null),
  ('iv5','c11','p1','s4',2,'seq' ,120,'searching','esc' ,'면접관 전원 거절',
     null,null,null,'대면',null,
     null, null, null, true, null)
on conflict (id) do nothing;

insert into interview_parts
  (interview_id, ord, interviewer_id, iv_nm, iv_role, src, core_level, off_min, dur,
   resp, resp_at, decline_code, decline_memo) values
  ('iv1',1,'u1','최영수','서버팀 팀장'      ,'hm'    ,6,  0,60,'accepted','2026-08-11 10:40+09',null,null),
  ('iv2',1,'u1','최영수','서버팀 팀장'      ,'hm'    ,6,  0,60,'accepted','2026-08-12 09:30+09',null,null),
  ('iv3',1,'u1','최영수','서버팀 팀장'      ,'hm'    ,6,  0,60,'accepted','2026-08-10 11:20+09',null,null),
  ('iv4',1,'u3','한도경','플랫폼본부 본부장','upper' ,9,  0,60,'none'    ,null,null,null),
  ('iv4',2,'u7','윤태경','CTO'              ,'collab',9, 60,60,'none'    ,null,null,null),
  ('iv5',1,'u3','한도경','플랫폼본부 본부장','upper' ,9,  0,60,'declined','2026-08-11 16:10+09','conflict','같은 시간 본부 리뷰가 잡혀 있습니다.'),
  ('iv5',2,'u7','윤태경','CTO'              ,'collab',9, 60,60,'declined','2026-08-11 17:35+09','calendar_missing','캘린더에 없는 외부 미팅이 있었습니다.')
on conflict (interview_id, ord) do nothing;

insert into interview_slots (interview_id, ord, d, st_min, en_min, st, buf_note)
select v.iid, v.o, v.dt, v.a, v.b, v.stt, v.note
from (values
  ('iv1',1,date '2026-08-17', 600, 660,'offered',null),
  ('iv1',2,date '2026-08-18', 840, 900,'offered','unknown'),
  ('iv1',3,date '2026-08-19', 660, 720,'offered',null),
  ('iv2',1,date '2026-08-17', 900, 960,'offered',null),
  ('iv2',2,date '2026-08-19', 600, 660,'offered',null),
  ('iv2',3,date '2026-08-20', 780, 840,'offered',null),
  ('iv3',1,date '2026-08-14', 840, 900,'picked' ,null),
  ('iv3',2,date '2026-08-14', 960,1020,'dropped',null),
  ('iv3',3,date '2026-08-17', 660, 720,'dropped',null),
  ('iv5',1,date '2026-08-18', 600, 720,'dropped',null),
  ('iv5',2,date '2026-08-20', 840, 960,'dropped',null)
) as v(iid, o, dt, a, b, stt, note)
where not exists (select 1 from interview_slots x where x.interview_id = v.iid and x.ord = v.o);

insert into interview_events (interview_id, at, b, p, s, actor)
select v.iid, v.lbl, v.bb, v.pp, v.ss, v.who
from (values
  ('iv1','8/11 10:20','슬롯 3개 발송','최영수 확인 후 후보자에게 동시 발송','idle','auto'),
  ('iv1','8/12 22:20','후보자 미확인 36h','리마인드 1회 발송. 다음은 리크루터 판단','late','auto'),
  ('iv2','8/12 09:05','슬롯 3개 발송','가예약 48시간 — 8/14 09:05 까지','idle','auto'),
  ('iv3','8/10 15:42','8/14 14:00 확정','후보자가 첫 번째 슬롯 선택. 나머지 가예약 해제','done','auto'),
  ('iv4','8/12 08:00','2시간 연속 블록 탐색','한도경 + 윤태경 공통 공백 120분. 사이 휴식 없음','idle','auto'),
  ('iv5','8/11 17:35','면접관 전원 거절','한도경 일정 충돌 · 윤태경 캘린더 밖 일정. 범위를 넓혀 재탐색해야 합니다','esc','auto')
) as v(iid, lbl, bb, pp, ss, who)
where not exists (select 1 from interview_events x where x.interview_id = v.iid and x.at = v.lbl);

-- ── 자리 제시 정책 (2026-09-06 확정: 보내는 날부터 1주일 안에서 5개) ──
-- 없어도 코드가 기본값(5 / 7)으로 돌아간다. 공고마다 다르게 하고 싶을 때만 필요하다.
alter table automation add column if not exists slot_max  int default 5;
alter table automation add column if not exists send_days int default 7;
comment on column automation.slot_max  is '후보자에게 한 번에 제시하는 자리 수. 확정값 5';
comment on column automation.send_days is '자리를 찾는 범위 — 보내는 날부터 며칠(달력일). 확정값 7';

-- ───────── migration-011-docs-mail.sql ─────────

-- =========================================================
-- Cadence — 마이그레이션 011 : 제출서류 + 메일 기록
-- Supabase SQL Editor 에 통째로 붙여넣고 [Run] 하세요.
-- 여러 번 실행해도 안전합니다.
-- ---------------------------------------------------------
-- 왜 필요한가
--   후보자 카드 하나에서 모든 일이 끝나야 한다. 그러려면
--   ① 이력서·포트폴리오 '진짜 파일'이 어딘가에 있어야 하고
--   ② 그 사람에게 나간 메일이 남아 있어야 한다.
--   지금까지 둘 다 화면에만 있고 저장소가 없었다.
-- =========================================================

-- ---------------------------------------------------------
-- ① 제출서류 — 파일 자체는 Storage 에, 목록은 이 표에
-- ---------------------------------------------------------
create table if not exists cand_docs (
  id         uuid primary key default gen_random_uuid(),
  cid        text not null,                 -- 후보자 id
  kind       text not null default 'etc',   -- resume | portfolio | cert | etc
  nm         text not null,                 -- 원본 파일 이름
  path       text not null,                 -- Storage 안의 경로
  size       bigint not null default 0,
  mime       text,
  by_nm      text,                          -- 올린 사람
  created_at timestamptz not null default now()
);
create index if not exists cand_docs_cid_idx on cand_docs (cid, created_at desc);

alter table cand_docs enable row level security;
drop policy if exists demo_all on cand_docs;
create policy demo_all on cand_docs for all using (true) with check (true);

-- 파일이 실제로 들어갈 저장소. public=false → 링크는 그때그때 만들어 준다.
insert into storage.buckets (id, name, public)
values ('cand-docs', 'cand-docs', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- ② 메일 기록 — 후보자에게 나간 모든 연락
-- ---------------------------------------------------------
create table if not exists mail_log (
  id         uuid primary key default gen_random_uuid(),
  cid        text not null,                 -- 후보자 id
  iid        text,                          -- 관련 면접 id (있으면)
  kind       text not null default 'etc',   -- 어떤 종류의 연락인가
  channel    text not null default 'email', -- email | slack
  to_addr    text,
  subject    text not null,
  body       text not null,
  ok         boolean not null default false,-- 실제로 나갔는가
  reason     text,                          -- 못 나갔으면 왜
  by_nm      text,
  created_at timestamptz not null default now()
);
create index if not exists mail_log_cid_idx on mail_log (cid, created_at desc);

alter table mail_log enable row level security;
drop policy if exists demo_all on mail_log;
create policy demo_all on mail_log for all using (true) with check (true);

-- ───────── migration-012-careers.sql ─────────

-- =========================================================
-- 012. 채용 사이트(공개 공고)와 직접 지원
-- ---------------------------------------------------------
-- 공고에 '내걸었는가 / 근무지 / 경력 요건 / 마감일'을 더하고,
-- 후보자에 '연락처 / 지원 동기 / 개인정보 동의 시각'을 더한다.
--
-- pub 의 기본값이 true 인 이유:
--   이미 열려 있던 공고들이 이 마이그레이션 한 번으로 조용히 내려가면 안 된다.
--   내리는 것은 담당자가 명시적으로 하는 행동이어야 한다.
--
-- privacy_at 을 따로 두는 이유:
--   '동의했다'가 아니라 '언제 동의했다'를 남겨야 보유 기간(전형 종료 후 1년)을
--   셀 수 있다. 동의 없이 들어온 지원건이 있으면 이 칸이 비어 있는 것으로 보인다.
-- =========================================================

alter table positions add column if not exists pub  boolean not null default true;
alter table positions add column if not exists loc  text;
alter table positions add column if not exists exp  text;
alter table positions add column if not exists due  date;

alter table candidates add column if not exists phone      text;
alter table candidates add column if not exists note       text;
alter table candidates add column if not exists privacy_at timestamptz;

-- 채용 사이트는 '열려 있고 내걸린 공고'만 읽는다. 그 조합으로만 훑으므로
-- 공고가 수백 건이 되어도 목록이 느려지지 않게 색인을 둔다.
create index if not exists positions_public_idx on positions (st, pub);

comment on column positions.pub  is '채용 사이트에 내걸었는가. false 면 주소를 직접 쳐도 열리지 않는다';
comment on column positions.loc  is '근무지 — 공고를 보는 사람이 제목 다음으로 보는 값';
comment on column positions.exp  is '경력 요건 한 줄 (예: 경력 3년 이상)';
comment on column positions.due  is '마감일. 비어 있으면 상시 채용';
comment on column candidates.phone      is '연락처. 채용 사이트 지원 폼으로만 들어온다';
comment on column candidates.note       is '지원자가 직접 쓴 지원 동기. 상태 사유(why)와 섞지 않는다';
comment on column candidates.privacy_at is '개인정보 수집·이용에 동의한 시각. 보유 기간 계산의 기준';

-- ───────── migration-013-position-level.sql ─────────

-- =========================================================
-- 013. 공고에 '직급'을 더한다
-- ---------------------------------------------------------
-- TalentCore 의 자리 카드는 직급(L4 — Senior)을 들고 있는데, Hire 로 넘어올 때
-- 그 값이 사라지고 있었다. 그래서 오퍼 초안이 '직급' 칸을 공고 제목
-- ('프론트엔드 엔지니어 (시니어) 2차')으로 채웠고, 리크루터가 매번 손으로
-- 고쳐야 했다. 고치지 않고 보내면 그 제목이 그대로 TalentCore 의
-- 입사예정자 직급으로 돌아가고, 직원 전환 화면의 직급 프리필이 깨진다.
--
-- 비어 있어도 되는 칸이다 — 사람이 Hire 안에서 직접 연 공고에는 직급이 없다.
-- 그때는 지금처럼 공고 제목으로 떨어진다.
-- =========================================================

alter table positions add column if not exists level text;

comment on column positions.level is
  'TalentCore 자리 카드의 직급 라벨(L4 — Senior). 오퍼 초안의 직급 기본값이 된다. Hire 에서 직접 연 공고는 비어 있다';

-- ───────── migration-014-app-tokens.sql ─────────

-- =========================================================
-- 014. 구글 토큰을 파일에서 DB 로 옮긴다
-- ---------------------------------------------------------
-- 지금까지 구글 연결 토큰은 프로젝트 폴더의 .google-tokens.json 에
-- 들어 있었다. 내 컴퓨터에서 돌 때는 문제가 없다 — 파일이 그 자리에 남으니까.
--
-- 그런데 Vercel 같은 곳에 올리면 앱이 요청마다 새로 켜졌다 꺼지고,
-- 디스크에 쓴 파일은 그때마다 사라진다. 게다가 요청이 여러 인스턴스로
-- 흩어지면 각자 다른 디스크를 본다. 그러면 "구글 연결" 을 눌러 동의까지
-- 끝내도 다음 화면에서는 연결이 안 된 상태로 보인다. 영원히.
--
-- 그래서 토큰을 DB 에 둔다. 로컬에서도 똑같이 DB 를 쓴다 —
-- 두 곳이 다르게 동작하면 "내 컴퓨터에서는 되는데" 가 생긴다.
--
-- ⚠️ 이 표에는 다른 표와 달리 demo_all 정책을 만들지 않는다.
--    이 앱의 다른 표들은 데모로 열어 두려고 anon 키에게 전부 허용해 뒀는데,
--    anon 키는 브라우저까지 실려 나가는 공개 키다. 여기 들어가는 것은
--    구글 계정에 접근하는 열쇠(refresh token)라서, 그걸 주우면 남의
--    메일을 대신 보낼 수 있다. 정책을 하나도 만들지 않으면 RLS 가
--    service_role(서버에만 있는 키) 외에는 전부 막는다. 그게 목적이다.
-- =========================================================

create table if not exists app_tokens (
  id         text primary key,          -- 'google'
  data       jsonb not null,            -- 토큰 묶음 그대로
  updated_at timestamptz not null default now()
);

alter table app_tokens enable row level security;
-- 정책 없음 = service_role 만 접근 가능 (위 주석 참고)
drop policy if exists demo_all on app_tokens;

comment on table app_tokens is
  '서버만 읽는 외부 서비스 토큰 보관함. RLS 정책을 일부러 두지 않아 service_role 외에는 접근 불가';

-- ───────── migration-015-hm-comments-users.sql ─────────

-- =========================================================
-- 015. HM 대행 · 전형 코멘트 · 로그인 사용자
-- ---------------------------------------------------------
-- H3  positions.hm_*      : 기간 있는 HM 대행. 종료일이 지나면 앱이 원래 HM 으로 읽는다.
-- H4  stage_comments      : 단계마다 합격/보류/불합격 + 코멘트(필수). 고칠 때마다 새 줄 —
--                           마지막 줄이 지금 값이고, 앞 줄들이 수정 이력이다.
-- H2  app_users           : TalentCore 계정으로 들어온 사람. HR Admin 이 승인하며 역할을 준다.
--                           로그인 열쇠에 닿는 표라 demo_all 정책을 만들지 않는다(service_role 만).
-- =========================================================

alter table positions add column if not exists hm_proxy text;
alter table positions add column if not exists hm_from  date;
alter table positions add column if not exists hm_until date;
alter table positions add column if not exists hm_note  text;

create table if not exists stage_comments (
  id           bigserial primary key,
  candidate_id text not null references candidates(id) on delete cascade,
  stage_id     text not null,
  verdict      text check (verdict in ('pass', 'hold', 'fail')),
  body         text not null,
  author       text not null,          -- 쓴 사람 이름
  for_nm       text,                   -- 대행으로 썼으면 원래 HM 이름
  created_at   timestamptz not null default now()
);
create index if not exists idx_stage_comments_cand on stage_comments(candidate_id, stage_id);
alter table stage_comments enable row level security;
drop policy if exists demo_all on stage_comments;
create policy demo_all on stage_comments for all using (true) with check (true);

create table if not exists app_users (
  id          text primary key,         -- TalentCore 사용자 id (core:<tenant>:<user>)
  email       text,
  nm          text not null,
  dept        text,
  role        text,                     -- admin | recruiter | hm | interviewer (승인 전 null)
  st          text not null default 'pending' check (st in ('pending', 'active', 'blocked')),
  person_id   text,                     -- Hire 명부(people.id) 연결
  approved_by text,
  approved_at timestamptz,
  last_login  timestamptz,
  created_at  timestamptz not null default now()
);
alter table app_users enable row level security;
-- 정책 없음 = service_role 만 접근 가능

-- ───────── migration-016-offer-equity.sql ─────────

-- 016 오퍼 스톡옵션 조건 (O3) — 수량·1주 행사가만. 현재가치는 적지 않는다.
alter table offers add column if not exists equity_units integer;
alter table offers add column if not exists equity_strike integer;

-- ───────── 마이그레이션 장부 ─────────

create table if not exists schema_migrations (
  name    text primary key,
  run_at  timestamptz not null default now()
);
comment on table schema_migrations is '실행된 마이그레이션 장부. 무엇이 돌았는지의 정본';
insert into schema_migrations (name) values ('migration-002-evals-reminders.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-003-offers.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-004-decision.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-005-availability.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-006-pool.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-007-core-link.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-008-directory.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-009-seat.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-010-interviews.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-011-docs-mail.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-012-careers.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-013-position-level.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-014-app-tokens.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-015-hm-comments-users.sql') on conflict do nothing;
insert into schema_migrations (name) values ('migration-016-offer-equity.sql') on conflict do nothing;
