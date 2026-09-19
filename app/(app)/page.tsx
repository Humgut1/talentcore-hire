import { redirect } from 'next/navigation'
import RenderScreen from '../components/RenderScreen'
import { inboxHTML } from '../lib/render'
import { allow } from '../lib/access'

/* 홈 = 조율 처리함 (서버에서 DB 하이드레이트 후 렌더, 접기/펼치기는 Screen 래퍼가 처리) */
export default async function Home() {
  /* 받은 일 전체는 채용 담당자 화면이다. 하이어링 매니저·면접관은 '내 할 일'이 첫 화면. */
  if (!(await allow('staff'))) redirect('/todo')
  return <RenderScreen build={() => inboxHTML()} />
}
