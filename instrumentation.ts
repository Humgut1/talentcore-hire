/* 서버 시계를 한국 시간으로 맞춘다.
   Vercel 서버는 UTC 라 "9/24 08:58" 에 한 일이 기록·타임라인에 "9/23 23:58" 로 찍혔다.
   기록 시각을 만드는 곳(getHours 등)이 여러 군데라 한 곳에서 시간대를 정한다 —
   개발 PC(한국 시간)에서 돌던 것과 같은 조건이 된다. 서버가 켜질 때 한 번 불린다. */
export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') process.env.TZ = 'Asia/Seoul'
}
