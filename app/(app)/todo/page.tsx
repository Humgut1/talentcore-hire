import RenderScreen from '../../components/RenderScreen'
import { todoHTML } from '../../lib/render'

/* 로그인이 없는 프로토타입이라 '누구 화면인지'를 ?u= 로 고른다.
   비우면 기본 사용자(정수민 · 리크루터) 화면. */
export default async function Page(
  { searchParams }: { searchParams: Promise<{ u?: string }> },
) {
  const { u } = await searchParams
  return <RenderScreen build={() => todoHTML(u)} />
}
