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
