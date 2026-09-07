import Board from '../../../components/Board'
import CandDrawer from '../../../components/CandDrawer'
import { hydrateData } from '../../../lib/db'
import { cands, stagesOf, posById } from '../../../lib/data'
import { mtgViews } from '../../../lib/meetings'
import { ivBoardOpen } from '../../../lib/iv-actions'
import { drawerData } from '../../../lib/drawer'

/* 공고 보드 = 하루 종일 열어 두는 유일한 화면.
   후보자 서랍은 별도 페이지가 아니라 이 화면의 주소 뒤에 붙는다(?c=후보자).
   그래서 서랍을 열고 닫아도 보드의 상태(끌어 놓는 중, 걸러 놓은 조건)가 살아 있다. */
export default async function Page({
  params, searchParams,
}: {
  params: Promise<{ pid: string }>
  searchParams: Promise<{ c?: string; iv?: string; ivw?: string }>
}) {
  const { pid } = await params
  const { c, iv, ivw } = await searchParams

  // 서버에서 DB를 하이드레이트한 뒤, 그 결과를 클라이언트 보드에 넘긴다.
  await hydrateData()
  /* 보드를 여는 것이 곧 정리다.
     만료된 가예약을 풀어 면접관 캘린더를 돌려주고, 면접 단계에 서 있는데
     아직 자리가 없는 후보자를 줄에 세운다. 둘 다 사람이 눌러 줄 일이 아니다. */
  await ivBoardOpen()

  const d = c ? await drawerData(c, iv, ivw === '1') : null

  return (
    <>
      <Board
        pid={pid}
        initialCands={cands}
        mtgs={mtgViews(pid)}
        initialStages={stagesOf(pid)}
        pos={posById(pid)}
      />
      {d ? <CandDrawer d={d} /> : null}
    </>
  )
}
