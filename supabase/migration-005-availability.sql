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
