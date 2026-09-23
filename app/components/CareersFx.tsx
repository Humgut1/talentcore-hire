'use client'
import { MeshGradient } from '@paper-design/shaders-react'
import { useEffect, useRef } from 'react'
import { markPaths, type Product } from './BrandMark'

/* 첫 화면 위쪽에 번지는 파란 빛.
   방문자 기기의 그래픽 카드로 그린다(서버에는 그래픽 카드가 없다) —
   그래서 이 파일은 브라우저에서만 불러온다.

   still=true 면 멈춘 한 장면만 그린다. 운영체제에서 '움직임 줄이기'를 켠
   사람에게는 흐르는 화면이 멀미가 된다.

   효과가 늦게 뜨거나 아예 못 뜨는 기기에서는 CSS 로 그린 같은 색
   그라데이션(.ch-fx 배경)이 그대로 보인다 — 화면이 비지 않는다. */
export function Glow({ still, dark = false }: { still: boolean; dark?: boolean }) {
  return (
    <MeshGradient
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      colors={dark
        ? ['#07090d', '#1a2130', '#07090d', '#2d3a52', '#0d1119']
        : ['#e8f2ff', '#3182f6', '#9cc6ff', '#ffffff', '#1b64da']}
      distortion={0.8}
      swirl={0.4}
      grainMixer={0}
      grainOverlay={0.04}
      speed={still ? 0 : 0.2}
    />
  )
}

/* =========================================================
   녹은 금속 로고 — 첫 화면 가운데

   로고 모양을 두 장 그린다: 선명한 것(S)은 어디까지가 로고인지,
   흐린 것(B)은 가장자리의 굴곡이다. 셰이더가 흐린 쪽의 기울기로
   빛 띠를 휘게 해서 말랑한 금속처럼 보인다.

   로고 바깥은 투명하다 — 뒤의 파란 빛이 그대로 보인다.
   그래픽 카드를 못 쓰면 아무것도 안 그리고, 밑에 깔린 같은 모양의
   평범한 로고(SVG)가 남는다. 창이 가려져 있거나 '움직임 줄이기'면
   한 장면만 그리고 멈춘다.
   ========================================================= */

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const FS = `precision mediump float;uniform vec2 r;uniform float t;uniform float d;uniform sampler2D S;uniform sampler2D B;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}
float met(float k){float m=.5+.5*sin(k*6.2831);return smoothstep(.15,.85,m);}
void main(){
  vec2 uv=gl_FragCoord.xy/r;
  float s=texture2D(S,uv).a, b=texture2D(B,uv).a;
  vec2 e=vec2(2./r.x,0.);
  vec2 g=vec2(texture2D(B,uv+e.xy).a-texture2D(B,uv-e.xy).a, texture2D(B,uv+e.yx).a-texture2D(B,uv-e.yx).a);
  float k=uv.y*.7+b*.6+(g.x*1.3+g.y)*1.6+n(uv*2.+t*.1)*.35-t*.1;
  float edge=1.-smoothstep(.35,.95,b);
  vec3 lo=mix(vec3(.10,.13,.19),vec3(.24,.27,.33),d), hi=vec3(.95,.97,1.);
  vec3 c=vec3(mix(lo.r,hi.r,met(k+.035*edge)),mix(lo.g,hi.g,met(k)),mix(lo.b,hi.b,met(k-.045*edge)));
  c=mix(c,c*vec3(.82,.9,1.12),.5);
  c+=vec3(.55,.7,1.)*pow(edge,3.)*(.25+.35*d);
  gl_FragColor=vec4(c*s,s);
}`

/** 로고가 캔버스에서 차지하는 배율(512 칸 기준). 밑에 깔린 SVG 도 같은 비율로 둔다(CSS .ch-logo-still). */
export const METAL_FILL = 1.2

export function MetalMark({ still, product = 'hire', dark = false }: { still: boolean; product?: Product; dark?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    const gl = cv?.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: true })
    if (!cv || !gl) return

    const sh = (ty: number, src: string) => { const o = gl.createShader(ty)!; gl.shaderSource(o, src); gl.compileShader(o); return o }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    /* 로고 모양 두 장 */
    const { cells, person } = markPaths(product)
    const paint = (ctx: CanvasRenderingContext2D) => {
      ctx.save(); ctx.translate(256, 256); ctx.scale(METAL_FILL, METAL_FILL); ctx.translate(-256, -256)
      ctx.fillStyle = '#000'
      ctx.fill(new Path2D(cells)); ctx.fill(new Path2D(person), 'evenodd')
      ctx.restore()
    }
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = 512; return c }
    const sC = mk(), bC = mk()
    paint(sC.getContext('2d')!)
    const bx = bC.getContext('2d')!
    bx.filter = 'blur(20px)'; paint(bx)  // filter 를 모르는 옛 브라우저는 흐림 없이 그려져 굴곡만 얕아진다
    const upload = (unit: number, c: HTMLCanvasElement) => {
      const tex = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    }
    upload(0, sC); upload(1, bC)
    gl.uniform1i(gl.getUniformLocation(prog, 'S'), 0); gl.uniform1i(gl.getUniformLocation(prog, 'B'), 1)
    gl.uniform1f(gl.getUniformLocation(prog, 'd'), dark ? 1 : 0)
    const uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't')

    const t0 = performance.now()
    let raf = 0
    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.round(cv.clientWidth * dpr), hh = Math.round(cv.clientHeight * dpr)
      if (w && hh) {
        if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh }
        gl.viewport(0, 0, w, hh)
        gl.uniform2f(uR, w, hh)
        gl.uniform1f(uT, still ? 12 : (now - t0) / 1000 + 12)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        cv.classList.add('on')
      }
      raf = (still || document.hidden) ? 0 : requestAnimationFrame(draw)
    }
    draw(t0)
    const wake = () => { if (!raf && !document.hidden) { raf = requestAnimationFrame(draw) } }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('resize', wake)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('resize', wake)
    }
  }, [still, product, dark])

  return <canvas ref={ref} className="ch-logo-gl" aria-hidden="true" />
}
