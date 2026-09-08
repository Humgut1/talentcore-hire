import type { Metadata } from 'next'
import Link from 'next/link'
import { orgName } from '../../../lib/core'
import { STEPS, FAQ } from '../content'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const co = (await orgName()) || 'TalentCore'
  return {
    title: `지원하기 전에 | ${co} 채용`,
    description: '서류 접수부터 입사까지 네 단계. 각 단계에 얼마나 걸리는지까지 적어 두었습니다.',
  }
}

/* =========================================================
   지원하기 전에 — 전형 절차와 자주 묻는 질문

   이 페이지의 값은 지어낸 것이 아니다. 네 단계와 소요 시간은 Hire 의 면접
   조율 설정과 같고, 답변에 적힌 7일·중복 지원 차단은 실제로 그렇게 동작한다.
   화면의 말과 시스템의 행동이 어긋나면 그 순간부터 이 사이트 전체가
   믿을 수 없는 글이 된다.

   전형 절차만 번호를 매긴다 — 여기는 진짜 순서라서 1번과 4번의 자리가
   바뀌면 안 되는 정보다.
   ========================================================= */
export default async function ProcessPage() {
  return (
    <main>
      <section className="s-field s-field-sm">
        <div className="s-wrap">
          <h1 className="s-dsp">지원하기 전에</h1>
          <p>서류 접수부터 입사까지 네 단계입니다. 각 단계에 얼마나 걸리는지도 적어 두었습니다.</p>
        </div>
      </section>

      <section className="s-steps">
        <div className="s-wrap">
          <h2 className="s-dsp">전형 절차</h2>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <span className="s-n">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="s-dsp">{s.t}</h3>
                <p>{s.d}</p>
                <p className="s-dur">{s.dur}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className="s-wrap s-sheet">
        <section className="s-sect">
          <h2 className="s-dsp">자주 묻는 질문</h2>
          <dl className="s-faq">
            {FAQ.map(f => (
              <div key={f.q}>
                <dt>{f.q}</dt>
                <dd>{f.a}</dd>
              </div>
            ))}
          </dl>

          <p className="s-sect-end">
            더 궁금한 점이 있으면 <Link href="/careers">공고</Link>를 열어 상세 설명을 확인하시거나,
            지원서 마지막 칸에 남겨 주세요.
          </p>
        </section>
      </div>
    </main>
  )
}
