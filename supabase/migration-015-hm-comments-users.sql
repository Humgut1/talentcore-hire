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
