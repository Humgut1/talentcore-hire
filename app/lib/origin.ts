/* =========================================================
   이 앱의 "바깥에서 보이는 주소" 한 곳
   ---------------------------------------------------------
   후보자에게 보내는 링크(자리 고르기, 면접 안내)와 구글 로그인이
   돌아올 주소는 전부 이 값에서 나온다. 예전에는 파일마다
   NEXT_PUBLIC_BASE_URL / NEXT_PUBLIC_APP_ORIGIN 두 이름을 따로 읽어서,
   한쪽만 채우면 링크와 구글이 서로 다른 주소를 가리켰다.

   순서대로 찾는다.
     1) NEXT_PUBLIC_APP_ORIGIN  — 직접 지정한 값(가장 확실하다)
     2) NEXT_PUBLIC_BASE_URL    — 예전 이름. 쓰고 있으면 그대로 먹힌다
     3) VERCEL_PROJECT_PRODUCTION_URL — Vercel 이 알아서 넣어 주는 값.
        아무것도 설정 안 해도 배포된 주소로 링크가 나가라고 둔 그물이다
        (호스트만 오므로 https:// 를 붙인다)
     4) http://localhost:3000   — 내 컴퓨터
   ========================================================= */

export function appOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    'http://localhost:3000'
  return raw.replace(/\/+$/, '')   // 끝의 / 는 떼서 `${origin}/pick/...` 이 // 가 되지 않게
}
