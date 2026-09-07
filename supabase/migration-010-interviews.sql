-- =========================================================
-- Cadence — 추가 마이그레이션 010
-- 면접 조율 (S1) — 면접 1건 · 면접관 구간 · 제시 슬롯 · 조율 로그
-- ---------------------------------------------------------
-- 기존 표를 지우지 않는 '추가만' 하는 스크립트입니다.
-- 여러 번 실행해도 안전합니다.
--
-- 지금까지 면접 일정은 후보자 카드의 why 칸에 '8/14 14:00 확정' 같은
-- 글자로만 남아 있었습니다. 글자는 세 가지를 못 합니다.
--   ① 누가 언제 왜 거절했는지 못 남긴다  ② 가예약 48시간을 셀 수 없다
--   ③ 이번 주 이 사람 면접이 몇 번인지 셀 수 없다
-- 그래서 면접을 표로 세웁니다.
--
--   interviews            면접 1건 (후보자 × 회차)
--    ├ interview_parts    그 면접 안의 면접관 구간. 1차는 1줄, 2차는 2줄
--    ├ interview_slots    후보자에게 내민 시간 후보들
--    └ interview_events   조율 로그 (왜 이렇게 됐나)
--
-- 확정된 전형 규칙 (2026-09-06):
--   1차 = 하이어링 매니저 혼자 60분
--   2차 = 차상위 리더 + 협업 리더, 각 60분을 이어서 = 120분 연속, 사이 휴식 없음
-- =========================================================


-- 0) 옛 세대 표 치우기 ---------------------------------------
--  이 Supabase 프로젝트에는 2026년 4월에 접은 옛 ATS(ats-system)의 표가
--  그대로 남아 있습니다. 지금 Cadence 앱은 이 표들을 한 줄도 읽지 않습니다.
--    applications 2줄 · position_stages 14줄 · interviews 1줄 · 나머지 0줄
--  이름이 겹쳐서(interviews / interview_slots) 새 표를 못 만들기 때문에
--  legacy_ 를 앞에 붙여 옆으로 밀어 둡니다.
--
--  지우지 않고 이름만 바꾸는 이유: 되돌릴 수 있게 하기 위해서입니다.
--  나중에 확실해지면 그때 legacy_* 를 통째로 지우면 됩니다.
do $$
declare t text;
begin
  -- 옛 interviews 인지 새 interviews 인지는 total_min 칸 유무로 구분한다
  if to_regclass('public.interviews') is not null
     and to_regclass('public.legacy_interviews') is null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'interviews'
                       and column_name = 'total_min') then
    execute 'alter table public.interviews rename to legacy_interviews';
  end if;

  if to_regclass('public.interview_slots') is not null
     and to_regclass('public.legacy_interview_slots') is null
     and not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'interview_slots'
                       and column_name = 'st_min') then
    execute 'alter table public.interview_slots rename to legacy_interview_slots';
  end if;

  foreach t in array array['applications','application_stage_history','position_stages',
                           'interview_interviewers','escalations','users'] loop
    if to_regclass('public.' || t) is not null
       and to_regclass('public.legacy_' || t) is null then
      execute format('alter table public.%I rename to %I', t, 'legacy_' || t);
    end if;
  end loop;
end $$;


-- 1) 면접관 직급 레벨 ----------------------------------------
--  실장(L8) 이상이 면접에 들어가면 발송 직전 리크루터에게 확인을 받습니다.
--  판단하려면 그 사람의 직급 숫자가 있어야 합니다. TalentCore 가 주인인 칸이라
--  008 의 경계 규칙대로 동기화가 덮어씁니다.
alter table people add column if not exists core_level int;
comment on column people.core_level is 'TalentCore 직급 레벨(1~9). 8 이상이면 발송 전 리크루터 확인 모달';


-- 2) 조율 규칙 값 --------------------------------------------
--  확정한 9가지를 코드에 박지 않고 공고별 설정으로 둡니다.
--  기존 automation.buffer(15분 일괄)는 남겨 두되 아래 세 칸이 대신합니다.
alter table automation add column if not exists hold_h      int     default 48;
alter table automation add column if not exists week_cap    int     default 3;
alter table automation add column if not exists week_block  boolean default false;
alter table automation add column if not exists buf_in      int     default 0;
alter table automation add column if not exists buf_out     int     default 60;
alter table automation add column if not exists buf_unknown int     default 60;
alter table automation add column if not exists slot_min    int     default 2;
alter table automation add column if not exists send_mode   text    default 'parallel';
alter table automation add column if not exists notify_ch   text    default 'email';
alter table automation add column if not exists senior_lv   int     default 8;
alter table automation add column if not exists r1_min      int     default 60;
alter table automation add column if not exists r2_min      int     default 60;
alter table automation add column if not exists r2_gap      int     default 0;

comment on column automation.hold_h      is '가예약을 붙잡아 두는 시간(h). 지나면 캘린더에서 떼어 낸다';
comment on column automation.week_cap    is '한 면접관의 주당 면접 권장 상한. 넘어도 막지 않고 화면에 표시만 한다';
comment on column automation.week_block  is 'true 면 상한을 넘긴 사람을 후보에서 뺀다. 확정값은 false(넛지만)';
comment on column automation.buf_in      is '사내 일정 뒤에 두는 여유(분). 확정값 0';
comment on column automation.buf_out     is '외부 일정 뒤에 두는 여유(분)';
comment on column automation.buf_unknown is '직전 일정 성격을 모를 때 두는 여유(분). 리크루터가 한 번 눌러 해제할 수 있다';
comment on column automation.slot_min    is '이 개수만 모이면 후보자에게 보낸다. 확정값 2';
comment on column automation.send_mode   is 'parallel = 면접관·후보자 동시 발송 / serial = 면접관 확정 후 후보자';
comment on column automation.notify_ch   is '후보자 알림 채널. 확정값 email (알림톡 제외)';
comment on column automation.senior_lv   is '이 레벨 이상이 면접관에 있으면 발송 전 확인 모달';
comment on column automation.r1_min      is '1차 길이(분)';
comment on column automation.r2_min      is '2차 면접관 1명당 길이(분). 2명이면 이 값 × 2';
comment on column automation.r2_gap      is '2차 두 면접 사이 쉬는 시간(분). 확정값 0 — 현장에서 조율한다';

update automation set buf_in = 0, buf_out = 60, buf_unknown = 60 where buf_in is null;


-- 3) 면접 1건 ------------------------------------------------
--  후보자 1명의 1차 면접이 1줄, 2차 면접이 또 1줄입니다.
--  다시 잡을 때는 새 줄을 만들지 않고 이 줄의 슬롯을 갈아 끼웁니다.
--  총 길이는 total_min 한 곳에만 적습니다 — 1차 60, 2차 120.
create table if not exists interviews (
  id           text primary key,
  candidate_id text not null references candidates(id) on delete cascade,
  position_id  text not null references positions(id)  on delete cascade,
  stage_id     text,                           -- 어느 단계의 면접인가 (s3 / s4)
  round        int  not null default 1,        -- 1차 / 2차
  kind         text not null default 'solo',   -- solo(혼자) / seq(이어서 여러 명)
  total_min    int  not null default 60,       -- 후보자가 앉아 있는 총 시간
  st           text not null default 'draft',  -- 진행 상태 (아래 설명)
  s            text not null default 'idle',   -- 카드 색 idle/esc/late/done
  why          text default '',                -- 상태 한 줄 사유

  sched_date   date,                           -- 확정된 날
  sched_start  int,                            -- 시작 (자정으로부터 분). 14:00 = 840
  sched_end    int,                            -- 끝
  mode         text,                           -- 화상 / 대면
  loc          text,                           -- 회의실 또는 화상 링크

  sent_at      timestamptz,                    -- 후보자에게 슬롯을 보낸 시각
  replied_at   timestamptz,                    -- 후보자가 고른 시각
  hold_until   timestamptz,                    -- 가예약이 풀리는 시각 (보낸 시각 + 48h)
  senior_ack   boolean default false,          -- 고위 면접관 확인 모달을 통과했는가
  pick_token   text,                           -- 후보자 선택 페이지 주소에 붙는 열쇠
  cal_event_id text,                           -- 확정 후 만든 캘린더 일정 id

  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

comment on table  interviews            is '면접 1건 = 후보자 1명 × 회차 1개';
comment on column interviews.st         is 'draft 준비 / searching 슬롯 탐색 / proposed 후보자에게 발송(가예약 중) / confirmed 확정 / done 종료 / canceled 취소';
comment on column interviews.kind       is 'solo = 면접관 1명 / seq = 여러 명이 쉬는 시간 없이 이어서';
comment on column interviews.pick_token is '메일 링크용 1회성 열쇠. 로그인 없이 이 면접만 볼 수 있게 한다';

create unique index if not exists idx_interviews_token      on interviews(pick_token) where pick_token is not null;
create unique index if not exists idx_interviews_cand_round on interviews(candidate_id, round);
create index        if not exists idx_interviews_cand       on interviews(candidate_id);
create index        if not exists idx_interviews_pos        on interviews(position_id);
create index        if not exists idx_interviews_st         on interviews(st);
create index        if not exists idx_interviews_date       on interviews(sched_date);


-- 4) 면접관 구간 ---------------------------------------------
--  1차는 1줄, 2차는 2줄입니다. off_min 은 면접 시작으로부터 몇 분 뒤에
--  이 사람 차례가 오는가 — 2차 두 번째 면접관은 60 입니다(사이 휴식 0분).
--  이름·직함을 복사해 두는 이유는 evaluations 와 같습니다. 사람이 부서를
--  옮기거나 퇴사해도 '그때 누가 봤는지'가 남아야 합니다.
create table if not exists interview_parts (
  interview_id   text not null references interviews(id) on delete cascade,
  ord            int  not null,                -- 순서 1, 2
  interviewer_id text not null references people(id),
  iv_nm          text,                         -- 당시 이름
  iv_role        text,                         -- 당시 직함
  src            text,                         -- 이 자리가 어디서 왔나 (아래 설명)
  core_level     int,                          -- 당시 직급 레벨
  off_min        int  not null default 0,      -- 시작으로부터 (분)
  dur            int  not null default 60,     -- 이 사람 몫 (분)

  resp           text default 'none',          -- none / accepted / declined
  resp_at        timestamptz,
  decline_code   text,                         -- 아래 설명
  decline_memo   text,
  cal_event_id   text,                         -- 이 사람에게 걸어 둔 가예약 일정 id

  primary key (interview_id, ord)
);

comment on column interview_parts.src          is 'hm = 요청서의 하이어링 매니저(1차) / upper = 그 위 조직의 리더(2차) / collab = 요청서에 적은 협업 리더(2차) / manual = 리크루터가 직접 넣음';
comment on column interview_parts.off_min      is '면접 시작으로부터 몇 분 뒤. 2차 두 번째 면접관은 60 (사이 휴식 없음)';
comment on column interview_parts.decline_code is 'conflict 다른 일정 / calendar_missing 캘린더에 안 적힌 일정 / travel 이동 시간 부족 / other 기타';

create index if not exists idx_iv_parts_uid  on interview_parts(interviewer_id);
create index if not exists idx_iv_parts_resp on interview_parts(resp);


-- 5) 제시 슬롯 -----------------------------------------------
--  후보자에게 내민 시간 후보들입니다. 2개만 모여도 보냅니다(확정값).
--  buf_note 는 '직전 일정이 사내인지 외부인지 모르겠다'를 담는 칸입니다.
--  모를 때 여유를 걸어 두되, 리크루터가 한 번 눌러 풀 수 있게 표시를 남깁니다.
create table if not exists interview_slots (
  id           bigserial primary key,
  interview_id text not null references interviews(id) on delete cascade,
  ord          int  not null default 0,        -- 화면에 보이는 순서
  d            date not null,                  -- 날짜
  st_min       int  not null,                  -- 시작 (분)
  en_min       int  not null,                  -- 끝 (분)
  st           text not null default 'offered',-- offered / picked / dropped / expired
  buf_note     text,                           -- 'unknown' 이면 직전 일정 성격 불명
  hold_ids     text[] default '{}',            -- 이 슬롯으로 걸어 둔 가예약 일정 id 목록
  hold_until   timestamptz,                    -- 이 슬롯 가예약이 풀리는 시각
  created_at   timestamptz default now()
);

comment on column interview_slots.st       is 'offered 제시됨 / picked 후보자가 고름 / dropped 다른 슬롯이 확정돼 뗌 / expired 48시간 지나 풀림';
comment on column interview_slots.buf_note is 'unknown = 직전 일정 성격을 몰라 여유를 걸어 둔 슬롯. 리크루터가 해제할 수 있다';

create index if not exists idx_iv_slots_iv   on interview_slots(interview_id);
create index if not exists idx_iv_slots_date on interview_slots(d);


-- 6) 조율 로그 -----------------------------------------------
--  stage_events 와 같은 모양입니다. 일정이 왜 이렇게 됐는지 남기지 않으면
--  다음 사람이 처음부터 다시 추측해야 합니다.
create table if not exists interview_events (
  id           bigserial primary key,
  interview_id text not null references interviews(id) on delete cascade,
  at           text,                           -- 화면에 찍는 시각 라벨 (8/12 15:22)
  b            text,                           -- 굵은 줄 (무슨 일)
  p            text,                           -- 설명 줄 (왜)
  s            text default 'idle',            -- 색 idle/esc/late/done
  actor        text,                           -- 누가 (사람 id 또는 'auto')
  created_at   timestamptz default now()
);

create index if not exists idx_iv_events_iv on interview_events(interview_id);


-- 7) 접근 정책 ----------------------------------------------
alter table interviews       enable row level security;
alter table interview_parts  enable row level security;
alter table interview_slots  enable row level security;
alter table interview_events enable row level security;

drop policy if exists demo_all on interviews;
drop policy if exists demo_all on interview_parts;
drop policy if exists demo_all on interview_slots;
drop policy if exists demo_all on interview_events;

create policy demo_all on interviews       for all using (true) with check (true);
create policy demo_all on interview_parts  for all using (true) with check (true);
create policy demo_all on interview_slots  for all using (true) with check (true);
create policy demo_all on interview_events for all using (true) with check (true);


-- 8) 면접관 직급 채우기 ---------------------------------------
--  TalentCore 동기화가 붙기 전까지 화면이 돌아가도록 넣어 둡니다.
update people set core_level = 9 where id in ('u3','u7','u10') and core_level is null;
update people set core_level = 6 where id in ('u1','u5','u8','u13') and core_level is null;
update people set core_level = 5 where id in ('u4','u12') and core_level is null;
update people set core_level = 4 where id in ('u11') and core_level is null;
update people set core_level = 3 where id in ('u2','u6','u9') and core_level is null;


-- 9) 샘플 면접 5건 -------------------------------------------
--  지금 보드에 글자로만 적혀 있는 상태를 그대로 표로 옮깁니다.
--    c7  박지훈  1차 발송했는데 후보자 무응답 36h
--    c8  임채원  1차 슬롯 3개 발송, 가예약 중
--    c9  오시현  1차 8/14 14:00 확정
--    c10 김민준  2차 120분 연속 블록 탐색 중
--    c11 이서연  2차 면접관 전원 거절
insert into interviews
  (id, candidate_id, position_id, stage_id, round, kind, total_min, st, s, why,
   sched_date, sched_start, sched_end, mode, loc,
   sent_at, replied_at, hold_until, senior_ack, pick_token) values
  ('iv1','c7' ,'p1','s3',1,'solo', 60,'proposed' ,'late','후보자 미확인 36h',
     null,null,null,'화상',null,
     '2026-08-11 10:20+09', null, '2026-08-13 10:20+09', false, 'demo-tok-c7'),
  ('iv2','c8' ,'p1','s3',1,'solo', 60,'proposed' ,'idle','슬롯 3개 발송',
     null,null,null,'화상',null,
     '2026-08-12 09:05+09', null, '2026-08-14 09:05+09', false, 'demo-tok-c8'),
  ('iv3','c9' ,'p1','s3',1,'solo', 60,'confirmed','done','8/14 14:00 확정',
     '2026-08-14',840,900,'화상','https://meet.example.com/cadence-c9',
     '2026-08-10 11:00+09', '2026-08-10 15:42+09', null, false, 'demo-tok-c9'),
  ('iv4','c10','p1','s4',2,'seq' ,120,'searching','idle','2시간 연속 블록 탐색',
     null,null,null,'대면',null,
     null, null, null, false, null),
  ('iv5','c11','p1','s4',2,'seq' ,120,'searching','esc' ,'면접관 전원 거절',
     null,null,null,'대면',null,
     null, null, null, true, null)
on conflict (id) do nothing;

insert into interview_parts
  (interview_id, ord, interviewer_id, iv_nm, iv_role, src, core_level, off_min, dur,
   resp, resp_at, decline_code, decline_memo) values
  ('iv1',1,'u1','최영수','서버팀 팀장'      ,'hm'    ,6,  0,60,'accepted','2026-08-11 10:40+09',null,null),
  ('iv2',1,'u1','최영수','서버팀 팀장'      ,'hm'    ,6,  0,60,'accepted','2026-08-12 09:30+09',null,null),
  ('iv3',1,'u1','최영수','서버팀 팀장'      ,'hm'    ,6,  0,60,'accepted','2026-08-10 11:20+09',null,null),
  ('iv4',1,'u3','한도경','플랫폼본부 본부장','upper' ,9,  0,60,'none'    ,null,null,null),
  ('iv4',2,'u7','윤태경','CTO'              ,'collab',9, 60,60,'none'    ,null,null,null),
  ('iv5',1,'u3','한도경','플랫폼본부 본부장','upper' ,9,  0,60,'declined','2026-08-11 16:10+09','conflict','같은 시간 본부 리뷰가 잡혀 있습니다.'),
  ('iv5',2,'u7','윤태경','CTO'              ,'collab',9, 60,60,'declined','2026-08-11 17:35+09','calendar_missing','캘린더에 없는 외부 미팅이 있었습니다.')
on conflict (interview_id, ord) do nothing;

insert into interview_slots (interview_id, ord, d, st_min, en_min, st, buf_note)
select v.iid, v.o, v.dt, v.a, v.b, v.stt, v.note
from (values
  ('iv1',1,date '2026-08-17', 600, 660,'offered',null),
  ('iv1',2,date '2026-08-18', 840, 900,'offered','unknown'),
  ('iv1',3,date '2026-08-19', 660, 720,'offered',null),
  ('iv2',1,date '2026-08-17', 900, 960,'offered',null),
  ('iv2',2,date '2026-08-19', 600, 660,'offered',null),
  ('iv2',3,date '2026-08-20', 780, 840,'offered',null),
  ('iv3',1,date '2026-08-14', 840, 900,'picked' ,null),
  ('iv3',2,date '2026-08-14', 960,1020,'dropped',null),
  ('iv3',3,date '2026-08-17', 660, 720,'dropped',null),
  ('iv5',1,date '2026-08-18', 600, 720,'dropped',null),
  ('iv5',2,date '2026-08-20', 840, 960,'dropped',null)
) as v(iid, o, dt, a, b, stt, note)
where not exists (select 1 from interview_slots x where x.interview_id = v.iid and x.ord = v.o);

insert into interview_events (interview_id, at, b, p, s, actor)
select v.iid, v.lbl, v.bb, v.pp, v.ss, v.who
from (values
  ('iv1','8/11 10:20','슬롯 3개 발송','최영수 확인 후 후보자에게 동시 발송','idle','auto'),
  ('iv1','8/12 22:20','후보자 미확인 36h','리마인드 1회 발송. 다음은 리크루터 판단','late','auto'),
  ('iv2','8/12 09:05','슬롯 3개 발송','가예약 48시간 — 8/14 09:05 까지','idle','auto'),
  ('iv3','8/10 15:42','8/14 14:00 확정','후보자가 첫 번째 슬롯 선택. 나머지 가예약 해제','done','auto'),
  ('iv4','8/12 08:00','2시간 연속 블록 탐색','한도경 + 윤태경 공통 공백 120분. 사이 휴식 없음','idle','auto'),
  ('iv5','8/11 17:35','면접관 전원 거절','한도경 일정 충돌 · 윤태경 캘린더 밖 일정. 범위를 넓혀 재탐색해야 합니다','esc','auto')
) as v(iid, lbl, bb, pp, ss, who)
where not exists (select 1 from interview_events x where x.interview_id = v.iid and x.at = v.lbl);

-- ── 자리 제시 정책 (2026-09-06 확정: 보내는 날부터 1주일 안에서 5개) ──
-- 없어도 코드가 기본값(5 / 7)으로 돌아간다. 공고마다 다르게 하고 싶을 때만 필요하다.
alter table automation add column if not exists slot_max  int default 5;
alter table automation add column if not exists send_days int default 7;
comment on column automation.slot_max  is '후보자에게 한 번에 제시하는 자리 수. 확정값 5';
comment on column automation.send_days is '자리를 찾는 범위 — 보내는 날부터 며칠(달력일). 확정값 7';
