import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import RenderScreen from '../components/RenderScreen'
import { inboxHTML } from '../lib/render'
import { allow } from '../lib/access'
import { GATE_COOKIE, readSession } from '../lib/gate'
import { viewerLabel } from '../lib/session'

/* 홈 = 조율 처리함 (서버에서 DB 하이드레이트 후 렌더, 접기/펼치기는 Screen 래퍼가 처리) */
export default async function Home() {
  /* 받은 일 전체는 채용 담당자 화면이다. 하이어링 매니저·면접관은 '내 할 일'이 첫 화면. */
  if (!(await allow('staff'))) redirect('/todo')
  /* 머리띠 '담당'은 로그인한 사람. TalentCore 계정이 아니면(비밀번호·데모) 예전처럼 샘플 담당자. */
  const sess = await readSession((await cookies()).get(GATE_COOKIE)?.value)
  const who = sess?.uid ? viewerLabel(sess)?.nm : undefined
  return <RenderScreen build={() => inboxHTML({}, who)} />
}
