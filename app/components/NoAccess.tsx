import Screen from './Screen'
import { noAccessHTML } from '../lib/render'

/* 역할 밖 화면(access.ts) — 주소를 직접 쳐서 들어와도 여기서 멈춘다. */
export default function NoAccess() {
  return <Screen html={noAccessHTML()} />
}
