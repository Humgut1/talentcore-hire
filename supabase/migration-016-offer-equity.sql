-- 016 오퍼 스톡옵션 조건 (O3) — 수량·1주 행사가만. 현재가치는 적지 않는다.
alter table offers add column if not exists equity_units integer;
alter table offers add column if not exists equity_strike integer;
