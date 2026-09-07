import RenderScreen from './components/RenderScreen'
import { inboxHTML } from './lib/render'

/* 홈 = 조율 처리함 (서버에서 DB 하이드레이트 후 렌더, 접기/펼치기는 Screen 래퍼가 처리) */
export default function Home() {
  return <RenderScreen build={() => inboxHTML()} />
}
