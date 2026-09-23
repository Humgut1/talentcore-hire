/* =========================================================
   TalentCore 로고 — '자리 친구'

   말랑한 칸 네 개 중 하나가 눈 달린 동그라미다. 칸 = 포지션,
   동그라미 = 그 자리에 온 사람. 눈은 옆 칸의 동료들 쪽을 본다.

   제품마다 사람이 앉은 칸만 옮긴다(나머지 모양은 같다).
     Core 왼쪽 위 · Hire 오른쪽 위 · Screen 왼쪽 아래 · Grow 오른쪽 아래

   색은 글자색(currentColor)을 따른다 — 밝은/어두운 화면에서 따로
   만들 필요가 없다. 눈은 뚫린 구멍(evenodd)이라 바탕색이 비친다.
   작게 쓸 때(favicon 등)는 eyes={false} — 16px 에서는 눈이 점 하나로
   뭉개져 오히려 얼룩처럼 보인다.
   ========================================================= */

export type Product = 'core' | 'hire' | 'screen' | 'grow'
const CELL: Record<Product, number> = { core: 0, hire: 1, screen: 2, grow: 3 }

const S = 160, G = 24, O = 84, RX = 62
const AT = [O, O + S + G]
const CELLS = [[0, 0], [1, 0], [0, 1], [1, 1]] as const

function rr(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
}
function circ(cx: number, cy: number, r: number) {
  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`
}

/** 512 칸 좌표의 로고 모양. 금속 효과(캔버스)도 같은 모양을 쓴다. */
export function markPaths(product: Product = 'hire', eyes = true) {
  const at = CELL[product]
  const cells: string[] = []
  let person = ''
  CELLS.forEach(([i, j], k) => {
    const x = AT[i], y = AT[j]
    if (k !== at) { cells.push(rr(x, y, S, S, RX)); return }
    const cx = x + S / 2, cy = y + S / 2, r = S / 2
    person = circ(cx, cy, r)
    if (eyes) {
      /* 가운데(256,256) 쪽 = 동료들 쪽으로 시선 */
      const dx = Math.sign(cx - 256), dy = Math.sign(cy - 256)
      const lx = -dx * 12, ly = -dy * 10 - 6, er = r * .13, sp = r * .3
      person += circ(cx + lx - sp, cy + ly, er) + circ(cx + lx + sp, cy + ly, er)
    }
  })
  return { cells: cells.join(''), person }
}

export default function BrandMark({ product = 'hire', eyes = true, size, className, title }: {
  product?: Product
  eyes?: boolean
  size?: number
  className?: string
  /** 있으면 읽어 주고, 없으면 장식으로 숨긴다(옆에 이름 글자가 있을 때) */
  title?: string
}) {
  const { cells, person } = markPaths(product, eyes)
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className}
      role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d={cells} fill="currentColor" />
      <path d={person} fill="currentColor" fillRule="evenodd" />
    </svg>
  )
}

/** 로고 + 'talentcore' 글자. 글꼴(Unbounded 700)은 각 뿌리 layout 이 불러온다. */
export function BrandLockup({ product = 'hire', className }: { product?: Product; className?: string }) {
  return (
    <span className={'tc-lock' + (className ? ' ' + className : '')}>
      <BrandMark product={product} />
      <span className="tc-word">talentcore</span>
    </span>
  )
}
