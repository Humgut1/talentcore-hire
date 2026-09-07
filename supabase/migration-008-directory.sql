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
