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
