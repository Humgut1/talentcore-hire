/* =========================================================
   Cadence — 채용 사이트(공개 공고)가 보는 창구
   ---------------------------------------------------------
   내부 화면과 공개 화면은 같은 DB 를 읽는다. 그래서 "무엇까지 밖에 보이는가"를
   화면마다 판단하게 두면 언젠가 한 곳에서 새어 나간다 — 연봉 밴드, 담당
   리크루터 이름, 후보자 수, 마감된 공고 제목 같은 것들이다.

   그래서 공개용 데이터는 반드시 이 파일을 지나게 한다.
   여기서 만든 CareerPost 에 없는 값은 채용 사이트가 알 방법이 없다.

   무엇을 내거는가 (두 조건을 동시에 만족해야 한다)
     · st === 'open'   내부에서 진행 중인 공고
     · pub !== false   채용 사이트에 내걸어 둔 공고
   pub 이 undefined 인 것(마이그레이션 012 이전 · 예전에 만든 공고)은
   '내걸림'으로 읽는다. 새 칸이 생겼다고 멀쩡히 열려 있던 공고가
   조용히 사라지면 안 된다.
   ========================================================= */
import { positions, stagesOf, type Position, type Stage } from './data'

/** 채용 사이트가 아는 공고 한 건. 여기 없는 값은 밖으로 나가지 않는다. */
export interface CareerPost {
  id: string
  title: string
  dept: string
  team: string
  emp: string          // 고용형태 (정규직 / 계약직 …)
  loc: string          // 근무지
  exp: string          // 경력 요건
  jd: string           // 직무 설명 본문
  opened: string       // 공고 시작일 (YYYY-MM-DD)
  due: string          // 마감일. 빈 문자열이면 상시 채용
  steps: string[]      // 전형 절차 — 지원자가 가장 궁금해하는 것
}

/* TalentCore 에서 넘어온 공고의 JD 첫 줄에는 출처가 붙어 있다.
   `※ TalentCore 요청 REQ-12 · 자리 OP-12-1 · 증원 · 예산 안 · 희망 입사일 …`
   이건 담당자용 표시다. 지원자에게는 사내 요청서 번호도, 이 채용이 예산 안인지
   밖인지도 보여 줄 이유가 없다 — 회사의 내부 사정이다. 여기서 걷어낸다. */
function publicJd(jd: string): string {
  const NL = String.fromCharCode(10)
  return jd
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('※'))
    .join(NL)
    .replace(/^\s+/, '')
}

/** 마감일이 지났는가. 마감일이 없으면 상시 채용이라 지나지 않는다. */
export function isClosed(due: string, today: string): boolean {
  return !!due && due < today
}

/** 내부 공고 → 공개 공고. 이 함수 밖에서 Position 을 직접 넘기지 않는다. */
function toPost(p: Position, stages: Stage[]): CareerPost {
  return {
    id: p.id,
    title: p.title,
    dept: p.dept,
    team: p.team,
    emp: p.emp,
    loc: p.loc || '서울',
    exp: p.exp || '경력 무관',
    jd: publicJd(p.jd || ''),
    opened: p.opened,
    due: p.due || '',
    /* 전형 절차는 Hire 가 이미 알고 있는 것이다. 지원자에게 '서류 → 1차 →
       2차 → 오퍼'를 보여 주는 데 따로 적어 둘 필요가 없다.
       입사·불합격(rail)은 절차가 아니라 결과라서 뺀다. */
    steps: stages.filter(s => !s.rail).map(s => s.nm),
  }
}

/** 채용 사이트에 걸려 있는 공고 전부. 정렬은 최근 올라온 순. */
export function openPosts(): CareerPost[] {
  return positions
    .filter(p => p.st === 'open' && p.pub !== false)
    .map(p => toPost(p, stagesOf(p.id)))
    .sort((a, b) => (a.opened < b.opened ? 1 : a.opened > b.opened ? -1 : 0))
}

/** 공고 한 건. 걸려 있지 않으면 null — 주소를 직접 쳐도 열리지 않는다. */
export function postById(pid: string): CareerPost | null {
  const p = positions.find(x => x.id === pid)
  if (!p || p.st !== 'open' || p.pub === false) return null
  return toPost(p, stagesOf(p.id))
}

/* ---------- 목록 화면이 쓰는 보조 ---------- */

/** 필터 칩에 쓸 값 목록. 걸려 있는 공고에 실제로 있는 것만 만든다 —
    고를 수 있는데 결과가 0건인 칩은 만들지 않는다. */
export function facets(posts: CareerPost[]) {
  const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort()
  return {
    dept: uniq(posts.map(p => p.dept)),
    emp: uniq(posts.map(p => p.emp)),
    loc: uniq(posts.map(p => p.loc)),
  }
}

/** 'YYYY-MM-DD' 두 개 사이의 날짜 수. 시간대에 흔들리지 않게 UTC 로만 센다. */
function daysBetween(from: string, to: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((ms(to) - ms(from)) / 86_400_000)
}

/** 마감 안내 문구. 사람이 읽는 형태로만 내보낸다. */
export function dueLabel(due: string, today: string): string {
  if (!due) return '상시 채용'
  if (due < today) return '마감'
  const [, m, d] = due.split('-').map(Number)
  const date = `${m}월 ${d}일`
  const left = daysBetween(today, due)
  if (left === 0) return `${date} 마감 (오늘까지)`
  if (left <= 7) return `${date} 마감 (${left}일 남음)`
  return `${date} 마감`
}

/** 마감이 일주일 안으로 들어왔는가. 목록에서 이것만 색을 준다. */
export function dueSoon(due: string, today: string): boolean {
  if (!due || due < today) return false
  return daysBetween(today, due) <= 7
}

/** 오늘 날짜를 'YYYY-MM-DD' 로.
    내부 화면은 데모 기준일(2026-08-12)로 체류일을 세지만, 마감일은 공고를 보는
    사람의 진짜 달력과 맞아야 해서 여기서만 실제 오늘을 쓴다. */
export function todayISO(): string {
  const t = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`
}
