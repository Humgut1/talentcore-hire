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
