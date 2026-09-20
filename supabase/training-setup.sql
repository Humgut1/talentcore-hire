-- =========================================================
-- Cadence(Hire) — 연습용 프로젝트 한 번에 세우기
-- ---------------------------------------------------------
-- Grow 교육 모드가 쓸 '연습용 Hire' Supabase 프로젝트를 만들 때,
-- 이 파일을 통째로 복사해 SQL Editor 에 붙여넣고 [Run] 하세요.
--
-- 순서: ① 표 만들기(schema + 마이그레이션 전부) ② 예시 데이터(seed)
--
-- 주의: 맨 앞에서 기존 표를 지웁니다(drop). 실제로 쓰는 프로젝트에는
--       절대 돌리지 마세요 — 새로 만든 연습용 프로젝트에서만.
--
-- 이 파일은 scripts/generate-training-sql.py 가 만듭니다. 직접 고치지 마세요.
-- =========================================================

-- ═════════ ① 표 만들기 ═════════

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
-- (예시 데이터 2 문장은 뺐습니다 — 아래 seed.sql 에서 한 번에 넣습니다)

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
-- (예시 데이터 1 문장은 뺐습니다 — 아래 seed.sql 에서 한 번에 넣습니다)

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
-- (예시 데이터 19 문장은 뺐습니다 — 아래 seed.sql 에서 한 번에 넣습니다)

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
-- (예시 데이터 1 문장은 뺐습니다 — 아래 seed.sql 에서 한 번에 넣습니다)

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
-- (예시 데이터 2 문장은 뺐습니다 — 아래 seed.sql 에서 한 번에 넣습니다)

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
-- (예시 데이터 2 문장은 뺐습니다 — 아래 seed.sql 에서 한 번에 넣습니다)

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

-- ── 자리 제시 정책 (2026-09-06 확정: 보내는 날부터 1주일 안에서 5개) ──
-- 없어도 코드가 기본값(5 / 7)으로 돌아간다. 공고마다 다르게 하고 싶을 때만 필요하다.
alter table automation add column if not exists slot_max  int default 5;
alter table automation add column if not exists send_days int default 7;
comment on column automation.slot_max  is '후보자에게 한 번에 제시하는 자리 수. 확정값 5';
comment on column automation.send_days is '자리를 찾는 범위 — 보내는 날부터 며칠(달력일). 확정값 7';
-- (예시 데이터 10 문장은 뺐습니다 — 아래 seed.sql 에서 한 번에 넣습니다)

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

-- ═════════ ② 예시 데이터 ═════════

-- ───────── seed.sql ─────────

-- =========================================================
-- Cadence — 초기(샘플) 데이터
-- schema.sql 을 먼저 실행한 뒤, 이 파일을 붙여넣고 [Run] 하세요.
-- 자동 생성됨 (app/api/dev-seed) — 손으로 수정하지 마세요.
-- =========================================================

truncate stage_events, offers, evaluations, automation, candidates, meetings, stages, positions, people restart identity cascade;

-- 사람
insert into people (id, nm, tt, dept, roles, ea, ch, sla, resp, ea_nm) values
  ('u1', '최영수', '서버팀 팀장', '플랫폼본부', array['하이어링 매니저','인터뷰어'], false, 'slack', 24, '4.2h', null),
  ('u2', '정수민', '채용 담당', '피플팀', array['리크루터'], false, 'both', 12, '1.1h', null),
  ('u3', '한도경', '플랫폼본부 본부장', '플랫폼본부', array['인터뷰어'], true, 'email', 48, '—', '김비서'),
  ('u4', '서민재', '서버팀 테크리드', '플랫폼본부', array['인터뷰어'], false, 'slack', 24, '6.8h', null),
  ('u5', '노아름', '데이터팀 팀장', '플랫폼본부', array['인터뷰어'], false, 'slack', 24, '11.4h', null),
  ('u6', '배수진', 'HR 코디네이터', '피플팀', array['코디네이터'], false, 'both', 12, '0.6h', null),
  ('u7', '윤태경', 'CTO', '경영진', array['인터뷰어'], true, 'email', 48, '—', '김비서'),
  ('u8', '김서진', '디자인팀 팀장', '프로덕트본부', array['하이어링 매니저','인터뷰어'], false, 'slack', 24, '3.4h', null),
  ('u9', '박현우', '채용 담당', '피플팀', array['리크루터'], false, 'both', 12, '2.3h', null),
  ('u10', '이강민', '사업본부 본부장', '사업본부', array['하이어링 매니저','인터뷰어'], true, 'email', 48, '—', '박실장'),
  ('u11', '유하린', '프로덕트 디자이너', '프로덕트본부', array['인터뷰어'], false, 'slack', 24, '5.1h', null),
  ('u12', '강태윤', '데이터팀 테크리드', '플랫폼본부', array['인터뷰어'], false, 'slack', 24, '8.7h', null),
  ('u13', '임수정', '품질팀 리드', '플랫폼본부', array['하이어링 매니저','인터뷰어'], false, 'both', 24, '2.9h', null);

-- 공고
insert into positions (id, title, dept, team, emp, st, rec, hm, opened, ttf, jd, band_lo, band_hi) values
  ('p1', '백엔드 엔지니어 (시니어)', '플랫폼본부', '서버팀', '정규직', 'open', '정수민', '최영수', '2026-07-20', 23, '분산 트랜잭션 처리와 대용량 이벤트 파이프라인을 설계·운영할 시니어 백엔드 엔지니어를 찾습니다.', 8000, 10000),
  ('p2', '프로덕트 디자이너', '프로덕트본부', '디자인팀', '정규직', 'open', '정수민', '김서진', '2026-07-28', 15, 'B2B SaaS 제품의 핵심 플로우를 설계합니다.', 6500, 8500),
  ('p3', '데이터 엔지니어', '플랫폼본부', '데이터팀', '정규직', 'open', '박현우', '노아름', '2026-06-30', 43, '데이터 웨어하우스 구축과 파이프라인 운영.', 7500, 9500),
  ('p4', '세일즈 매니저', '사업본부', '세일즈팀', '정규직', 'hold', '박현우', '이강민', '2026-07-02', 41, '엔터프라이즈 신규 고객 발굴.', 6000, 8000),
  ('p5', 'QA 엔지니어', '플랫폼본부', '품질팀', '계약직', 'closed', '정수민', '임수정', '2026-05-11', 58, '자동화 테스트 설계.', 5500, 7000);

-- 단계 (p1)
insert into stages (position_id, id, ord, nm, kind, sla, dur, mode, ivs, color, auto, rail) values
  ('p1', 's1', 0, '지원 접수', 'apply', 1, 0, '—', '{}', '#c3c5e2', true, false),
  ('p1', 's2', 1, '서류 검토', 'screen', 3, 0, '—', array['u1'], '#b0b3e3', true, false),
  ('p1', 's3', 2, '1차 인터뷰', 'interview', 5, 60, '화상', array['u1','u4'], '#9a9be4', true, false),
  ('p1', 's4', 3, '2차 인터뷰', 'interview', 7, 120, '대면', array['u3','u7'], '#7d7be0', false, false),
  ('p1', 's5', 4, '오퍼', 'offer', 5, 0, '—', '{}', '#5b53d6', true, false),
  ('p1', 's6', 5, '입사', 'hired', 0, 0, '—', '{}', '#0a9459', false, true),
  ('p1', 's0', 6, '불합격', 'reject', 0, 0, '—', '{}', '#a8a8b2', false, true);

-- 단계 (p2)
insert into stages (position_id, id, ord, nm, kind, sla, dur, mode, ivs, color, auto, rail) values
  ('p2', 's1', 0, '지원 접수', 'apply', 1, 0, '—', '{}', '#cdd0ec', true, false),
  ('p2', 's2', 1, '포트폴리오 검토', 'screen', 3, 0, '—', array['u8'], '#b1b1e7', true, false),
  ('p2', 's3', 2, '디자인 과제', 'task', 7, 0, '비대면', array['u8','u11'], '#9492e1', true, false),
  ('p2', 's4', 3, '과제 리뷰 인터뷰', 'interview', 5, 90, '화상', array['u8','u11'], '#7872dc', true, false),
  ('p2', 's5', 4, '오퍼', 'offer', 5, 0, '—', '{}', '#5b53d6', true, false),
  ('p2', 's6', 5, '입사', 'hired', 0, 0, '—', '{}', '#0a9459', false, true),
  ('p2', 's0', 6, '불합격', 'reject', 0, 0, '—', '{}', '#a8a8b2', false, true);

-- 단계 (p3)
insert into stages (position_id, id, ord, nm, kind, sla, dur, mode, ivs, color, auto, rail) values
  ('p3', 's1', 0, '지원 접수', 'apply', 1, 0, '—', '{}', '#cdd0ec', true, false),
  ('p3', 's2', 1, '서류 검토', 'screen', 3, 0, '—', array['u5'], '#b6b7e8', true, false),
  ('p3', 's3', 2, '기술 과제', 'task', 7, 0, '비대면', array['u12'], '#9f9ee3', true, false),
  ('p3', 's4', 3, '기술 인터뷰', 'interview', 5, 90, '화상', array['u5','u12'], '#8985df', true, false),
  ('p3', 's5', 4, '임원 인터뷰', 'interview', 7, 60, '대면', array['u3'], '#726cda', false, false),
  ('p3', 's6', 5, '오퍼', 'offer', 5, 0, '—', '{}', '#5b53d6', true, false),
  ('p3', 's7', 6, '입사', 'hired', 0, 0, '—', '{}', '#0a9459', false, true),
  ('p3', 's0', 7, '불합격', 'reject', 0, 0, '—', '{}', '#a8a8b2', false, true);

-- 단계 (p4)
insert into stages (position_id, id, ord, nm, kind, sla, dur, mode, ivs, color, auto, rail) values
  ('p4', 's1', 0, '지원 접수', 'apply', 1, 0, '—', '{}', '#cdd0ec', true, false),
  ('p4', 's2', 1, '서류 검토', 'screen', 3, 0, '—', array['u10'], '#b1b1e7', true, false),
  ('p4', 's3', 2, '1차 인터뷰', 'interview', 5, 60, '화상', array['u10'], '#9492e1', false, false),
  ('p4', 's4', 3, '최종 인터뷰', 'interview', 7, 60, '대면', array['u10'], '#7872dc', false, false),
  ('p4', 's5', 4, '오퍼', 'offer', 5, 0, '—', '{}', '#5b53d6', true, false),
  ('p4', 's6', 5, '입사', 'hired', 0, 0, '—', '{}', '#0a9459', false, true),
  ('p4', 's0', 6, '불합격', 'reject', 0, 0, '—', '{}', '#a8a8b2', false, true);

-- 단계 (p5)
insert into stages (position_id, id, ord, nm, kind, sla, dur, mode, ivs, color, auto, rail) values
  ('p5', 's1', 0, '지원 접수', 'apply', 1, 0, '—', '{}', '#cdd0ec', true, false),
  ('p5', 's2', 1, '서류 검토', 'screen', 3, 0, '—', array['u13'], '#a7a6e5', true, false),
  ('p5', 's3', 2, '실무 인터뷰', 'interview', 5, 60, '화상', array['u13','u4'], '#817ddd', true, false),
  ('p5', 's4', 3, '오퍼', 'offer', 5, 0, '—', '{}', '#5b53d6', true, false),
  ('p5', 's5', 4, '입사', 'hired', 0, 0, '—', '{}', '#0a9459', false, true),
  ('p5', 's0', 5, '불합격', 'reject', 0, 0, '—', '{}', '#a8a8b2', false, true);

-- 미팅
insert into meetings (id, position_id, nm, s, v, ag, dur, who, act) values
  ('m1', 'p1', '킥오프', 'done', '8/4 14:00 완료', '—', 30, array['최영수','한도경','서민재'], null),
  ('m2', 'p1', '디브리프', 'esc', '참석자 미지정', '52h', 30, '{}', array['참석자 지정 요청']),
  ('m3', 'p2', '킥오프', 'done', '7/29 10:00 완료', '—', 30, array['김서진','유하린'], null),
  ('m4', 'p2', '과제 기준 정렬', 'idle', '8/13 16:00 예정', '—', 30, array['김서진','유하린'], null),
  ('m5', 'p3', '킥오프', 'done', '7/2 11:00 완료', '—', 30, array['노아름','강태윤','한도경'], null),
  ('m6', 'p3', '디브리프', 'late', '평가지 미제출 3건', '72h', 30, array['노아름','강태윤'], array['면접관에 리마인드','직접 취합']),
  ('m7', 'p4', '킥오프', 'done', '7/6 14:00 완료', '—', 30, array['이강민'], null),
  ('m8', 'p4', '보류 재검토', 'esc', '보류 사유 미기재', '36d', 30, '{}', array['사업본부에 확인','공고 종료 검토']),
  ('m9', 'p5', '킥오프', 'done', '5/13 10:00 완료', '—', 30, array['임수정','최영수'], null),
  ('m10', 'p5', '디브리프', 'done', '7/2 15:00 완료', '—', 30, array['임수정','서민재'], null);

-- 후보자
insert into candidates (id, position_id, nm, st, s, d, ap, en, why, src, yr, role, act, exit_stage, reject_code, reject_memo, decided_at) values
  ('c1', 'p1', '한지우', 's1', 'idle', 0, '2026-08-12', '2026-08-12', '', '리멤버', 7, '백엔드 엔지니어 · 카카오', null, null, null, null, null),
  ('c2', 'p1', '배준영', 's1', 'idle', 1, '2026-08-11', '2026-08-11', '', '자사채용', 5, '서버 개발자 · 토스', null, null, null, null, null),
  ('c3', 'p1', '강도윤', 's2', 'idle', 2, '2026-08-06', '2026-08-10', '', '원티드', 9, '테크리드 · 당근', null, null, null, null, null),
  ('c4', 'p1', '윤서아', 's2', 'late', 6, '2026-08-01', '2026-08-06', 'HM 미응답 48h', '추천', 6, '백엔드 · 라인', array['HM에게 리마인드','직접 검토'], null, null, null, null),
  ('c5', 'p1', '문태오', 's2', 'idle', 1, '2026-08-09', '2026-08-11', '', '자사채용', 4, '백엔드 · 스타트업', null, null, null, null, null),
  ('c6', 'p1', '신하경', 's2', 'idle', 3, '2026-08-04', '2026-08-09', '', '링크드인', 8, '플랫폼 엔지니어 · 쿠팡', null, null, null, null, null),
  ('c7', 'p1', '박지훈', 's3', 'late', 5, '2026-07-28', '2026-08-07', '후보자 미확인 36h', '원티드', 10, '시니어 백엔드 · 네이버', array['후보자에게 재발송','직접 연락'], null, null, null, null),
  ('c8', 'p1', '임채원', 's3', 'idle', 3, '2026-07-30', '2026-08-09', '슬롯 3개 발송', '리멤버', 6, '백엔드 · 배민', null, null, null, null, null),
  ('c9', 'p1', '오시현', 's3', 'done', 3, '2026-07-29', '2026-08-09', '8/14 14:00 확정', '추천', 7, '백엔드 · 야놀자', null, null, null, null, null),
  ('c10', 'p1', '김민준', 's4', 'idle', 9, '2026-07-20', '2026-08-03', '2시간 블록 탐색', '링크드인', 11, '테크리드 · 우아한형제들', null, null, null, null, null),
  ('c11', 'p1', '이서연', 's4', 'esc', 12, '2026-07-18', '2026-07-31', '면접관 전원 거절', '원티드', 9, '시니어 백엔드 · 카카오페이', array['범위 넓혀 재탐색','직접 조율'], null, null, null, null),
  ('c12', 'p1', '최유나', 's5', 'esc', 21, '2026-07-05', '2026-07-22', '처우 재협의', '추천', 12, '백엔드 아키텍트 · 라인', array['처우안 수정','HM에 확인'], null, null, null, null),
  ('c13', 'p1', '정하늘', 's6', 'done', 18, '2026-06-30', '2026-07-25', '9/1 입사 예정', '리멤버', 8, '백엔드 · 쏘카', null, null, null, null, null),
  ('c14', 'p1', '서지호', 's0', 'done', 11, '2026-07-24', '2026-08-01', '서류 불합격', '원티드', 3, '주니어 백엔드', null, 's2', 'skill', null, '2026-08-01'),
  ('c15', 'p1', '남궁현', 's0', 'done', 9, '2026-07-26', '2026-08-03', '서류 불합격', '링크드인', 2, '백엔드', null, 's2', 'exp', null, '2026-08-03'),
  ('c16', 'p1', '조은비', 's0', 'done', 14, '2026-07-19', '2026-07-29', '1차 불합격', '자사채용', 5, '백엔드', null, 's3', 'skill', null, '2026-07-29'),
  ('c17', 'p1', '백승우', 's0', 'done', 6, '2026-07-31', '2026-08-06', '후보자 사퇴', '추천', 7, '백엔드', null, 's3', 'other-offer', '경쟁사 오퍼 수락. 연봉보다 합류 시점이 빨랐던 점이 컸다고 합니다.', '2026-08-06'),
  ('c18', 'p2', '문서윤', 's1', 'idle', 0, '2026-08-12', '2026-08-12', '', '원티드', 6, '프로덕트 디자이너 · 토스', null, null, null, null, null),
  ('c19', 'p2', '하지민', 's1', 'idle', 1, '2026-08-11', '2026-08-11', '', '링크드인', 4, 'UX 디자이너 · 마켓컬리', null, null, null, null, null),
  ('c20', 'p2', '권나영', 's2', 'idle', 2, '2026-08-07', '2026-08-10', '', '자사채용', 8, '시니어 프로덕트 디자이너 · 당근', null, null, null, null, null),
  ('c21', 'p2', '오지환', 's2', 'late', 5, '2026-08-03', '2026-08-07', 'HM 미응답 48h', '추천', 5, '프로덕트 디자이너 · 리디', array['HM에게 리마인드','직접 검토'], null, null, null, null),
  ('c22', 'p2', '유가온', 's3', 'idle', 4, '2026-08-01', '2026-08-08', '과제 발송 · 마감 8/15', '원티드', 7, '프로덕트 디자이너 · 카카오', null, null, null, null, null),
  ('c23', 'p2', '심우진', 's3', 'late', 8, '2026-07-29', '2026-08-04', '과제 마감 초과 2d', '링크드인', 5, 'UX/UI 디자이너 · 무신사', array['마감 연장','후보자에 확인'], null, null, null, null),
  ('c24', 'p2', '노유진', 's4', 'done', 3, '2026-07-30', '2026-08-09', '8/13 11:00 확정', '추천', 9, '디자인 리드 · 배민', null, null, null, null, null),
  ('c25', 'p2', '배시우', 's5', 'idle', 6, '2026-07-22', '2026-08-06', '오퍼 승인 대기', '자사채용', 7, '프로덕트 디자이너 · 쿠팡', null, null, null, null, null),
  ('c26', 'p2', '강예린', 's0', 'done', 10, '2026-07-28', '2026-08-02', '포트폴리오 불합격', '원티드', 3, '주니어 디자이너', null, 's2', 'skill', null, '2026-08-02'),
  ('c27', 'p3', '임도현', 's1', 'idle', 0, '2026-08-12', '2026-08-12', '', '링크드인', 5, '데이터 엔지니어 · 야놀자', null, null, null, null, null),
  ('c28', 'p3', '곽지원', 's2', 'idle', 3, '2026-08-05', '2026-08-09', '', '원티드', 7, '데이터 플랫폼 · 쏘카', null, null, null, null, null),
  ('c29', 'p3', '서하늬', 's3', 'idle', 5, '2026-07-31', '2026-08-07', '과제 발송 · 마감 8/17', '자사채용', 6, '데이터 엔지니어 · 뱅크샐러드', null, null, null, null, null),
  ('c30', 'p3', '진태호', 's4', 'idle', 4, '2026-07-28', '2026-08-08', '90분 블록 탐색 중', '리멤버', 9, '데이터 엔지니어 · 라인', null, null, null, null, null),
  ('c31', 'p3', '홍세라', 's4', 'esc', 9, '2026-07-21', '2026-08-03', '면접관 전원 슬롯 거절', '원티드', 8, '시니어 데이터 엔지니어 · 네이버', array['범위 넓혀 재탐색','대체 면접관 지정'], null, null, null, null),
  ('c32', 'p3', '남지후', 's5', 'idle', 11, '2026-07-15', '2026-08-01', 'EA 조율 요청 발송', '추천', 11, '데이터 아키텍트 · 카카오', null, null, null, null, null),
  ('c33', 'p3', '표민경', 's6', 'esc', 16, '2026-07-06', '2026-07-27', '연봉 밴드 초과 승인 필요', '링크드인', 12, '데이터 엔지니어링 리드 · 우아한형제들', array['승인 요청','밴드 재검토'], null, null, null, null),
  ('c34', 'p3', '최도경', 's0', 'done', 13, '2026-07-20', '2026-07-30', '기술 과제 불합격', '자사채용', 4, '데이터 엔지니어', null, 's3', 'skill', null, '2026-07-30'),
  ('c35', 'p3', '윤하람', 's0', 'done', 7, '2026-07-25', '2026-08-05', '후보자 사퇴', '원티드', 6, '데이터 엔지니어', null, 's2', 'career', null, '2026-08-05'),
  ('c36', 'p4', '방주원', 's1', 'idle', 14, '2026-07-29', '2026-07-29', '공고 보류 — 검토 대기', '원티드', 9, '엔터프라이즈 세일즈 · SAP', null, null, null, null, null),
  ('c37', 'p4', '국지현', 's2', 'late', 19, '2026-07-18', '2026-07-24', '공고 보류 19d · 후보자 방치', '링크드인', 11, '세일즈 매니저 · 오라클', array['후보자에 상황 안내','공고 재개 검토'], null, null, null, null),
  ('c38', 'p4', '천승호', 's3', 'idle', 21, '2026-07-14', '2026-07-22', '보류로 조율 중단', '추천', 8, 'AE · 세일즈포스', null, null, null, null, null),
  ('c39', 'p4', '도경완', 's0', 'done', 24, '2026-07-09', '2026-07-19', '서류 불합격', '자사채용', 5, '세일즈', null, 's2', 'exp', null, '2026-07-19'),
  ('c40', 'p4', '편서율', 's0', 'done', 17, '2026-07-16', '2026-07-26', '후보자 사퇴 — 대기 장기화', '원티드', 7, '세일즈', null, 's2', 'withdraw', '대기가 길어지며 이직 계획 자체를 미뤘습니다. 공고 홀드 기간이 원인.', '2026-07-26'),
  ('c41', 'p5', '추민서', 's5', 'done', 31, '2026-05-20', '2026-07-08', '7/13 입사 완료', '원티드', 6, 'QA 엔지니어 · 넥슨', null, null, null, null, null),
  ('c42', 'p5', '안겨울', 's0', 'done', 29, '2026-05-22', '2026-06-14', '최종 불합격', '링크드인', 4, 'QA', null, 's3', 'better-fit', null, '2026-06-14'),
  ('c43', 'p5', '노건우', 's0', 'done', 35, '2026-05-18', '2026-06-10', '서류 불합격', '자사채용', 3, 'QA', null, 's2', 'skill', null, '2026-06-10'),
  ('c44', 'p5', '마해원', 's0', 'done', 27, '2026-05-29', '2026-06-20', '오퍼 거절 — 처우', '추천', 8, 'QA 리드 · 엔씨', null, 's4', 'comp', null, '2026-06-20'),
  ('c45', 'p5', '진소율', 's0', 'done', 33, '2026-05-21', '2026-06-12', '서류 불합격', '원티드', 2, 'QA', null, 's2', 'exp', null, '2026-06-12'),
  ('c46', 'p5', '하동주', 's0', 'done', 22, '2026-06-03', '2026-06-25', '실무 불합격', '리멤버', 5, 'QA 엔지니어', null, 's3', 'collab', null, '2026-06-25');

-- 자동화 설정
insert into automation (position_id, win, hours, buffer, cand_sla, iv_sla, remind, tz, rules) values
  ('p1', 10, '10:00–18:00', 15, 48, 24, '12h / 4h 전', '자동 감지', '[{"id":"r1","nm":"면접관 전원 슬롯 거절","d":"교집합이 0개일 때","on":true,"th":"즉시"},{"id":"r2","nm":"면접관 미응답","d":"응답 제한 시간 초과","on":true,"th":"24h"},{"id":"r3","nm":"후보자 미확인","d":"슬롯 발송 후 무응답","on":true,"th":"36h"},{"id":"r4","nm":"HM 평가지 미작성","d":"인터뷰 종료 후 미제출","on":true,"th":"48h"},{"id":"r5","nm":"킥오프 참석자 미지정","d":"지정 요청 후 무응답","on":true,"th":"48h"},{"id":"r6","nm":"EA 조율 대상 포함","d":"자동화 제외 → 코디네이터 라우팅","on":true,"th":"즉시","lock":true},{"id":"r7","nm":"일정 확정 후 취소 발생","d":"인비 취소 감지","on":true,"th":"즉시"},{"id":"r8","nm":"단계 SLA 초과","d":"단계별 기준 체류일 초과","on":false,"th":"기준 +2d"}]'::jsonb),
  ('p2', 14, '10:00–19:00', 15, 48, 24, '24h / 2h 전', '자동 감지', '[{"id":"r1","nm":"면접관 전원 슬롯 거절","d":"교집합이 0개일 때","on":true,"th":"즉시"},{"id":"r2","nm":"면접관 미응답","d":"응답 제한 시간 초과","on":true,"th":"24h"},{"id":"r3","nm":"후보자 미확인","d":"슬롯 발송 후 무응답","on":true,"th":"36h"},{"id":"r4","nm":"HM 평가지 미작성","d":"인터뷰 종료 후 미제출","on":true,"th":"48h"},{"id":"r5","nm":"킥오프 참석자 미지정","d":"지정 요청 후 무응답","on":true,"th":"48h"},{"id":"r6","nm":"EA 조율 대상 포함","d":"자동화 제외 → 코디네이터 라우팅","on":true,"th":"즉시","lock":true},{"id":"r7","nm":"일정 확정 후 취소 발생","d":"인비 취소 감지","on":true,"th":"즉시"},{"id":"r8","nm":"단계 SLA 초과","d":"단계별 기준 체류일 초과","on":true,"th":"기준 +1d"}]'::jsonb),
  ('p3', 15, '09:00–18:00', 30, 72, 48, '12h / 4h 전', '자동 감지', '[{"id":"r1","nm":"면접관 전원 슬롯 거절","d":"교집합이 0개일 때","on":true,"th":"즉시"},{"id":"r2","nm":"면접관 미응답","d":"응답 제한 시간 초과","on":true,"th":"48h"},{"id":"r3","nm":"후보자 미확인","d":"슬롯 발송 후 무응답","on":true,"th":"36h"},{"id":"r4","nm":"HM 평가지 미작성","d":"인터뷰 종료 후 미제출","on":true,"th":"48h"},{"id":"r5","nm":"킥오프 참석자 미지정","d":"지정 요청 후 무응답","on":true,"th":"48h"},{"id":"r6","nm":"EA 조율 대상 포함","d":"자동화 제외 → 코디네이터 라우팅","on":true,"th":"즉시","lock":true},{"id":"r7","nm":"일정 확정 후 취소 발생","d":"인비 취소 감지","on":true,"th":"즉시"},{"id":"r8","nm":"단계 SLA 초과","d":"단계별 기준 체류일 초과","on":true,"th":"기준 +3d"}]'::jsonb),
  ('p4', 10, '09:00–18:00', 15, 48, 48, '12h / 1h 전', '자동 감지', '[{"id":"r1","nm":"면접관 전원 슬롯 거절","d":"교집합이 0개일 때","on":true,"th":"즉시"},{"id":"r2","nm":"면접관 미응답","d":"응답 제한 시간 초과","on":false,"th":"24h"},{"id":"r3","nm":"후보자 미확인","d":"슬롯 발송 후 무응답","on":false,"th":"36h"},{"id":"r4","nm":"HM 평가지 미작성","d":"인터뷰 종료 후 미제출","on":true,"th":"48h"},{"id":"r5","nm":"킥오프 참석자 미지정","d":"지정 요청 후 무응답","on":true,"th":"48h"},{"id":"r6","nm":"EA 조율 대상 포함","d":"자동화 제외 → 코디네이터 라우팅","on":true,"th":"즉시","lock":true},{"id":"r7","nm":"일정 확정 후 취소 발생","d":"인비 취소 감지","on":false,"th":"즉시"},{"id":"r8","nm":"단계 SLA 초과","d":"단계별 기준 체류일 초과","on":true,"th":"기준 +5d"}]'::jsonb),
  ('p5', 10, '10:00–18:00', 15, 48, 24, '12h / 4h 전', '자동 감지', '[{"id":"r1","nm":"면접관 전원 슬롯 거절","d":"교집합이 0개일 때","on":false,"th":"즉시"},{"id":"r2","nm":"면접관 미응답","d":"응답 제한 시간 초과","on":false,"th":"24h"},{"id":"r3","nm":"후보자 미확인","d":"슬롯 발송 후 무응답","on":false,"th":"36h"},{"id":"r4","nm":"HM 평가지 미작성","d":"인터뷰 종료 후 미제출","on":false,"th":"48h"},{"id":"r5","nm":"킥오프 참석자 미지정","d":"지정 요청 후 무응답","on":false,"th":"48h"},{"id":"r6","nm":"EA 조율 대상 포함","d":"자동화 제외 → 코디네이터 라우팅","on":true,"th":"즉시","lock":true},{"id":"r7","nm":"일정 확정 후 취소 발생","d":"인비 취소 감지","on":false,"th":"즉시"},{"id":"r8","nm":"단계 SLA 초과","d":"단계별 기준 체류일 초과","on":false,"th":"기준 +2d"}]'::jsonb);

-- 평가(스코어카드)
insert into evaluations (candidate_id, interviewer_id, iv, role, st, items, overall, memo, at) values
  ('c11', 'u1', '최영수', 'HM', '1차 인터뷰', '[["직무 역량 깊이","syes"],["문제 해결 방식","yes"],["협업 · 이견 조율","yes"],["성장 가능성","yes"]]'::jsonb, 'yes', '분산 트랜잭션 경험이 우리 문제와 정확히 맞습니다.', '7/25 15:10'),
  ('c11', 'u4', '서민재', '테크리드', '1차 인터뷰', '[["직무 역량 깊이","yes"],["문제 해결 방식","yes"],["협업 · 이견 조율","yes"],["성장 가능성","yes"]]'::jsonb, 'yes', '코드 리뷰 문화에 대한 이해가 좋습니다.', '7/25 16:02'),
  ('c24', 'u8', '김서진', 'HM', '과제 리뷰 인터뷰', '[["직무 역량 깊이","syes"],["문제 해결 방식","syes"],["협업 · 이견 조율","yes"],["성장 가능성","yes"]]'::jsonb, 'syes', '과제에서 문제를 다시 정의한 점이 인상적입니다.', '8/09 11:40'),
  ('c24', 'u11', '유하린', '디자이너', '과제 리뷰 인터뷰', '[["직무 역량 깊이","yes"],["문제 해결 방식","syes"],["협업 · 이견 조율","yes"],["성장 가능성","yes"]]'::jsonb, 'yes', '컴포넌트 체계를 스스로 만들어 본 경험이 있습니다.', '8/09 12:15'),
  ('c30', 'u12', '강태윤', '테크리드', '기술 인터뷰', '[["직무 역량 깊이","yes"],["문제 해결 방식","yes"],["협업 · 이견 조율","yes"],["성장 가능성","no"]]'::jsonb, 'no', '설계는 좋으나 대규모 장애 대응 경험은 더 확인이 필요합니다.', '8/08 17:30'),
  ('c33', 'u5', '노아름', 'HM', '임원 인터뷰', '[["조직 적합성","syes"],["중장기 기여","syes"]]'::jsonb, 'syes', '팀을 세팅해 본 경험이 우리 상황과 맞습니다. 처우 밴드만 정리되면 진행.', '7/27 10:20');

-- 오퍼
insert into offers (candidate_id, st, level, base, sign, band_lo, band_hi, start_date, chain, created_at, sent_at, resp_at, decline_code, decline_memo) values
  ('c12', 'sent', '스태프 엔지니어', 9800, 1000, 8000, 10000, '2026-09-01', '[{"uid":"u1","nm":"최영수","role":"하이어링 매니저","s":"ok","at":"7/23 09:40"}]'::jsonb, '2026-07-22', '2026-07-24', null, null, null),
  ('c13', 'accepted', '시니어 엔지니어', 8800, 0, 8000, 10000, '2026-09-01', '[{"uid":"u1","nm":"최영수","role":"하이어링 매니저","s":"ok","at":"7/25 17:20"}]'::jsonb, '2026-07-25', '2026-07-26', '2026-07-29', null, null),
  ('c25', 'approval', '프로덕트 디자이너', 7800, 0, 6500, 8500, '2026-09-15', '[{"uid":"u8","nm":"김서진","role":"하이어링 매니저","s":"pending"}]'::jsonb, '2026-08-06', null, null, null, null),
  ('c33', 'approval', '데이터 엔지니어링 리드', 10200, 1500, 7500, 9500, '2026-09-15', '[{"uid":"u5","nm":"노아름","role":"하이어링 매니저","s":"ok","at":"7/27 14:05"},{"uid":"u3","nm":"한도경","role":"본부 승인 (밴드 초과)","s":"pending"}]'::jsonb, '2026-07-27', null, null, null, null),
  ('c41', 'accepted', 'QA 엔지니어 (계약)', 6200, 0, 5500, 7000, '2026-07-13', '[{"uid":"u13","nm":"임수정","role":"하이어링 매니저","s":"ok","at":"6/24 16:10"}]'::jsonb, '2026-06-24', '2026-06-25', '2026-06-30', null, null),
  ('c44', 'declined', 'QA 리드 (계약)', 6400, 0, 5500, 7000, null, '[{"uid":"u13","nm":"임수정","role":"하이어링 매니저","s":"ok","at":"6/13 11:30"}]'::jsonb, '2026-06-13', '2026-06-14', '2026-06-20', 'comp', '현 직장 대비 인상폭이 작다는 이유. 정규직 전환 시점도 걸림돌이었습니다.');
