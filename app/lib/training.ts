/* =========================================================
   연습(교육) Hire — 처음 상태로 되돌리기 · 연습 지원자 넣기
   ---------------------------------------------------------
   Grow 교육 모드의 미션 3~6 은 '진짜 Hire 화면'에서 일한다.
   그 화면이 보는 곳은 실제 채용 Supabase 가 아니라 **연습용 프로젝트**다
   (같은 코드, 배포만 하나 더 · 주소도 키도 다르다).

   여기 있는 두 가지 일은 연습 배포에서만 열린다.
     · TRAINING_MODE=1 이 아니면 문 자체가 닫혀 있다(503).
     · TRAIN_RESET_TOKEN 이 없거나 다르면 401.
   실제 배포에는 둘 다 없으므로 실수로라도 실제 데이터를 지울 수 없다.
   두 개를 따로 둔 이유는 하나를 잘못 넣어도 나머지가 막기 때문이다.

   되돌리기 = 지원·면접 기록을 전부 비우고 → TalentCore 연습 회사 명부를
   다시 당겨와 → 채용 역할(리크루터·하이어링 매니저·인터뷰어)만 다시 붙인다.
   명부를 손으로 적지 않는 이유: 연습 회사의 주인은 Core 쪽이다.
   ========================================================= */
import { serverClient } from './supabase'
import { syncDirectory } from './directory'

/** 연습 배포인가. 두 스위치가 모두 켜져 있을 때만 참. */
export function trainingOn(): boolean {
  return process.env.TRAINING_MODE === '1' && !!(process.env.TRAIN_RESET_TOKEN || '').trim()
}

/** 들어온 요청이 연습 토큰을 들고 있나. */
export function trainingAuth(req: Request): { ok: boolean; status: number; error?: string } {
  if (!trainingOn()) return { ok: false, status: 503, error: 'training-off' }
  const want = (process.env.TRAIN_RESET_TOKEN || '').trim()
  const got = (req.headers.get('x-train-token') || '').trim()
  if (!got || got !== want) return { ok: false, status: 401, error: 'unauthorized' }
  return { ok: true, status: 200 }
}

/* 비우는 순서 — 자식부터. [표, 항상 값이 있는 칸] */
const WIPE: [string, string][] = [
  ['interview_events', 'id'], ['interview_slots', 'id'], ['interview_parts', 'interview_id'],
  ['interviews', 'id'], ['stage_comments', 'id'], ['stage_events', 'id'],
  ['cand_docs', 'id'], ['mail_log', 'id'], ['evaluations', 'candidate_id'],
  ['offers', 'candidate_id'], ['candidates', 'id'], ['availability', 'uid'],
  ['meetings', 'id'], ['automation', 'position_id'], ['stages', 'position_id'],
  ['positions', 'id'], ['people', 'id'], ['app_users', 'id'], ['reminder_log', 'key'],
]

/* 채용 역할 — 연습 회사(새봄테크) 사번 기준.
   TalentCore 명부는 '누가 면접관인가'를 모른다(그건 Hire 것이다).
   동기화로 들어온 사람은 역할이 비어 있으므로 여기서 한 번 붙여 준다. */
const ROLES: Record<string, string[]> = {
  'SB-0003': ['리크루터'],                        // 김하나 — 학습자 본인(인사팀)
  'SB-0002': ['리크루터'],                        // 정수민 — 인사팀 팀장
  'SB-0006': ['하이어링 매니저', '인터뷰어'],      // 박지민 — 백엔드팀 팀장
  'SB-0007': ['인터뷰어'],                        // 강태오 — 백엔드팀
  'SB-0008': ['인터뷰어'],                        // 서지안 — 백엔드팀
  'SB-0011': ['하이어링 매니저', '인터뷰어'],      // 최윤 — 프론트엔드팀 팀장
  'SB-0014': ['하이어링 매니저', '인터뷰어'],      // 김세진 — 영업팀 팀장
  'SB-0016': ['하이어링 매니저', '인터뷰어'],      // 홍유진 — 고객성공팀 팀장
  'SB-0001': ['인터뷰어'],                        // 한지우 — 대표
}

export interface ResetReport {
  ok: boolean
  error?: string
  detail?: string
  wiped?: number      // 비운 표 수
  people?: number     // 명부에서 받아 온 사람 수
  tagged?: number     // 채용 역할을 붙인 사람 수
}

/* 세 번째 자물쇠 — 지우기 직전에 "여기가 연습 프로젝트가 맞나"를 데이터 쪽에서 한 번 더 본다.
   스위치 두 개는 설정 실수로 같이 켜질 수 있지만, 주소에 연습 프로젝트 이름이
   들어 있는지는 실수로 맞출 수 없다. 지우는 일이라 한 겹 더 둔다. */
function wrongProject(): string | null {
  const ref = (process.env.TRAIN_SUPABASE_REF || '').trim()
  if (!ref) return 'TRAIN_SUPABASE_REF 가 없습니다 — 어느 프로젝트가 연습용인지 모른 채로는 지우지 않습니다'
  const url = (process.env.SUPABASE_URL || '').trim()
  if (!url.includes(ref)) return '연습 프로젝트가 아닙니다 — 주소와 TRAIN_SUPABASE_REF 가 다릅니다'
  return null
}

/** 연습 Hire 를 처음 상태로. */
export async function resetTrainingHire(): Promise<ResetReport> {
  const wrong = wrongProject()
  if (wrong) return { ok: false, error: 'wrong-project', detail: wrong }

  const sb = serverClient()
  if (!sb) return { ok: false, error: 'not-configured', detail: 'Supabase 주소나 키가 비어 있습니다' }

  for (const [table, col] of WIPE) {
    const { error } = await sb.from(table).delete().not(col, 'is', null)
    /* 없는 표는 넘어간다 — 마이그레이션을 덜 돌린 연습 프로젝트도 살려 둔다. */
    if (error && !/does not exist/i.test(error.message))
      return { ok: false, error: 'wipe-failed', detail: `${table}: ${error.message}` }
  }

  const dir = await syncDirectory()
  if (!dir.ok) return { ok: false, error: dir.reason, detail: dir.detail, wiped: WIPE.length }

  let tagged = 0
  for (const [empNo, roles] of Object.entries(ROLES)) {
    const { error, count } = await sb.from('people')
      .update({ roles }, { count: 'exact' }).eq('emp_no', empNo)
    if (!error && count) tagged += count
  }

  return { ok: true, wiped: WIPE.length, people: dir.read ?? 0, tagged }
}

/* ---------------------------------------------------------
   연습 지원자
   ---------------------------------------------------------
   미션은 "지원자가 들어왔다"에서 시작한다. 실제 채용 사이트로 사람을 받아 올
   수 없으니 연습에서는 세 명을 넣어 준다. 셋의 모양이 다른 것이 중요하다 —
   한 명은 분명히 맞고, 한 명은 분명히 아니고, 한 명은 애매하다.
   서류 검토가 '누가 봐도 되는 일'이 아니라는 걸 여기서 배운다.
   --------------------------------------------------------- */
const APPLICANTS = [
  { nm: '문지호', em: 'jiho.moon@example.com', yr: 6, src: '채용 사이트',
    role: '커머스 백엔드 6년 · 결제·정산 API · Java, Kotlin' },
  { nm: '백서연', em: 'seoyeon.baek@example.com', yr: 3, src: '채용 사이트',
    role: '스타트업 백엔드 3년 · Node.js · 사내 운영툴 개발' },
  { nm: '오준혁', em: 'junhyuk.oh@example.com', yr: 9, src: '추천',
    role: 'SI 9년 · 대부분 프로젝트 관리 · 최근 개발 경험 적음' },
]

export interface ApplicantReport {
  ok: boolean
  error?: string
  detail?: string
  position?: string
  stage?: string
  added?: number
}

/** 연습 지원자 3명을 공고에 넣는다. 공고를 안 주면 가장 최근에 열린 공고. */
export async function addTrainingApplicants(positionId?: string): Promise<ApplicantReport> {
  const sb = serverClient()
  if (!sb) return { ok: false, error: 'not-configured' }

  let pid = (positionId || '').trim()
  if (!pid) {
    const { data } = await sb.from('positions').select('id, opened')
      .order('opened', { ascending: false }).limit(1)
    pid = data?.[0]?.id || ''
  }
  if (!pid) return { ok: false, error: 'no-position', detail: '아직 공고가 없습니다' }

  /* 어느 단계에 놓을까 — 서류 검토가 있으면 거기, 없으면 첫 단계.
     '지원 접수'에 쌓아 두면 할 일이 안 보인다. */
  const { data: stages } = await sb.from('stages').select('id, ord, kind')
    .eq('position_id', pid).order('ord')
  if (!stages?.length) return { ok: false, error: 'no-stage', detail: '공고에 단계가 없습니다' }
  const stage = stages.find(s => s.kind === 'screen') || stages[0]

  const today = new Date()
  const day = (back: number) =>
    new Date(today.getTime() - back * 86_400_000).toISOString().slice(0, 10)

  const rows = APPLICANTS.map((a, i) => ({
    id: `t${Date.now().toString(36)}${i}`,
    position_id: pid, st: stage.id, s: 'idle', d: i + 1,
    ap: day(i + 1), en: day(i + 1),
    nm: a.nm, yr: a.yr, src: a.src, role: a.role,
    email: a.em, act: [] as string[], why: '',
  }))

  const { error } = await sb.from('candidates').insert(rows)
  if (error) return { ok: false, error: 'insert-failed', detail: error.message }
  return { ok: true, position: pid, stage: stage.id, added: rows.length }
}
