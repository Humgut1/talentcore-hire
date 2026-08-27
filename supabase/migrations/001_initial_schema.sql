-- =============================================
-- ATS 초기 스키마 v1
-- Supabase SQL Editor에서 실행하세요
-- =============================================

-- 1. Users (Supabase Auth와 연동)
create table users (
  id uuid primary key references auth.users(id),
  name text not null,
  email text not null unique,
  role text not null check (role in ('recruiter', 'coordinator', 'interviewer', 'hiring_manager', 'admin')),
  alert_channel text default 'email',
  response_limit_hours int default 24,
  ea_flag boolean default false,
  created_at timestamptz default now()
);

-- 2. Positions
create table positions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  division text,
  headquarter text,
  department text,
  employment_type text default 'full_time',
  status text default 'open',
  recruiter_id uuid references users(id),
  hiring_manager_id uuid references users(id),
  interview_mode text default 'video',
  video_platform text default 'google_meet',
  opened_at timestamptz default now(),
  closed_at timestamptz
);

-- 3. Candidates
create table candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  resume_url text,
  sms_consent boolean default false,
  created_at timestamptz default now()
);

-- 4. Applications
create table applications (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) not null,
  position_id uuid references positions(id) not null,
  status text default 'applied',
  source_category text,
  source_detail text,
  referrer_name text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  applied_at timestamptz default now(),
  doc_pass_at timestamptz,
  doc_fail_at timestamptz,
  rejection_reason text,
  join_date date,
  unique(candidate_id, position_id)
);

-- 5. Interviews
create table interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references applications(id) not null,
  round int not null check (round in (1, 2)),
  mode text default 'video',
  status text default 'pending_slots',
  scheduled_at timestamptz,
  duration_minutes int default 60,
  result text check (result in ('pass', 'fail', 'hold')),
  result_note text,
  result_at timestamptz,
  created_at timestamptz default now()
);

-- 6. Interview Interviewers
create table interview_interviewers (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid references interviews(id) not null,
  interviewer_id uuid references users(id) not null,
  is_required boolean default true,
  slot_response text default 'pending',
  responded_at timestamptz,
  unique(interview_id, interviewer_id)
);

-- 7. Interview Slots
create table interview_slots (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid references interviews(id) not null,
  slot_time timestamptz not null,
  token text unique not null,
  is_selected boolean default false,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- 8. Escalations
create table escalations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  event_type text not null,
  reason text not null,
  status text default 'open',
  assigned_to uuid references users(id),
  resolution_note text,
  triggered_at timestamptz default now(),
  resolved_at timestamptz
);

-- =============================================
-- RLS 비활성화 (v1 — 추후 별도 설정)
-- =============================================
alter table users disable row level security;
alter table positions disable row level security;
alter table candidates disable row level security;
alter table applications disable row level security;
alter table interviews disable row level security;
alter table interview_interviewers disable row level security;
alter table interview_slots disable row level security;
alter table escalations disable row level security;
