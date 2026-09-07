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
