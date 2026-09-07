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
