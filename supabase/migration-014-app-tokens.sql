-- =========================================================
-- 014. 구글 토큰을 파일에서 DB 로 옮긴다
-- ---------------------------------------------------------
-- 지금까지 구글 연결 토큰은 프로젝트 폴더의 .google-tokens.json 에
-- 들어 있었다. 내 컴퓨터에서 돌 때는 문제가 없다 — 파일이 그 자리에 남으니까.
--
-- 그런데 Vercel 같은 곳에 올리면 앱이 요청마다 새로 켜졌다 꺼지고,
-- 디스크에 쓴 파일은 그때마다 사라진다. 게다가 요청이 여러 인스턴스로
-- 흩어지면 각자 다른 디스크를 본다. 그러면 "구글 연결" 을 눌러 동의까지
-- 끝내도 다음 화면에서는 연결이 안 된 상태로 보인다. 영원히.
--
-- 그래서 토큰을 DB 에 둔다. 로컬에서도 똑같이 DB 를 쓴다 —
-- 두 곳이 다르게 동작하면 "내 컴퓨터에서는 되는데" 가 생긴다.
--
-- ⚠️ 이 표에는 다른 표와 달리 demo_all 정책을 만들지 않는다.
--    이 앱의 다른 표들은 데모로 열어 두려고 anon 키에게 전부 허용해 뒀는데,
--    anon 키는 브라우저까지 실려 나가는 공개 키다. 여기 들어가는 것은
--    구글 계정에 접근하는 열쇠(refresh token)라서, 그걸 주우면 남의
--    메일을 대신 보낼 수 있다. 정책을 하나도 만들지 않으면 RLS 가
--    service_role(서버에만 있는 키) 외에는 전부 막는다. 그게 목적이다.
-- =========================================================

create table if not exists app_tokens (
  id         text primary key,          -- 'google'
  data       jsonb not null,            -- 토큰 묶음 그대로
  updated_at timestamptz not null default now()
);

alter table app_tokens enable row level security;
-- 정책 없음 = service_role 만 접근 가능 (위 주석 참고)
drop policy if exists demo_all on app_tokens;

comment on table app_tokens is
  '서버만 읽는 외부 서비스 토큰 보관함. RLS 정책을 일부러 두지 않아 service_role 외에는 접근 불가';
