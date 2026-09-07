import Link from 'next/link'

/* 내려간 공고 주소로 들어왔을 때. 404 지만 막다른 길로 두지 않는다 —
   이 사람은 우리 회사에 지원할 생각이 있어서 들어온 사람이다. */
export default function CareerNotFound() {
  return (
    <main className="s-wrap">
      <div className="s-empty" style={{ borderBottom: 0, padding: '120px 4px' }}>
        <b>찾으시는 공고가 없습니다</b>
        마감되었거나 내려간 공고일 수 있습니다.
        <div style={{ marginTop: 22 }}>
          <Link href="/careers" className="s-clear">모집 중인 공고 보기</Link>
        </div>
      </div>
    </main>
  )
}
