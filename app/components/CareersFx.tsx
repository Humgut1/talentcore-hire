'use client'
import { MeshGradient } from '@paper-design/shaders-react'

/* 첫 화면 위쪽에 번지는 파란 빛.
   방문자 기기의 그래픽 카드로 그린다(서버에는 그래픽 카드가 없다) —
   그래서 이 파일은 브라우저에서만 불러온다.

   still=true 면 멈춘 한 장면만 그린다. 운영체제에서 '움직임 줄이기'를 켠
   사람에게는 흐르는 화면이 멀미가 된다.

   효과가 늦게 뜨거나 아예 못 뜨는 기기에서는 CSS 로 그린 같은 색
   그라데이션(.ch-fx 배경)이 그대로 보인다 — 화면이 비지 않는다. */
export function Glow({ still }: { still: boolean }) {
  return (
    <MeshGradient
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      colors={['#e8f2ff', '#3182f6', '#9cc6ff', '#ffffff', '#1b64da']}
      distortion={0.8}
      swirl={0.4}
      grainMixer={0}
      grainOverlay={0.04}
      speed={still ? 0 : 0.2}
    />
  )
}
