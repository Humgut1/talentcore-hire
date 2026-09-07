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
