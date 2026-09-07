/* 서버 컴포넌트: 렌더 직전에 DB를 하이드레이트한 뒤 HTML 빌더를 실행한다. */
import Screen from './Screen'
import { hydrateData } from '../lib/db'

export default async function RenderScreen({ build }: { build: () => string }) {
  await hydrateData()
  return <Screen html={build()} />
}
