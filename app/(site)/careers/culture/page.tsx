import type { Metadata } from 'next'
import { orgName } from '../../../lib/core'
import { WAY_PHOTO, WAYS, STORIES } from '../content'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const co = (await orgName()) || 'TalentCore'
  return {
    title: `일하는 방식 | ${co} 채용`,
    description: '제품보다 먼저 정한 것들. 여섯 문장이 전부이고, 그대로 지킵니다.',
  }
}

/* =========================================================
   일하는 방식

   여기 실리는 글은 전부 content.ts 의 예시다 — 회사가 직접 써야 하는 글이라
   형태만 갖춰 뒀다.

   여섯 원칙에 번호를 붙이지 않는다. 순서가 있는 절차가 아니라 나란한
   원칙이라, 1번이 6번보다 중요해 보이면 화면이 사실이 아닌 것을 말하는 것이다.
   대신 네모 하나씩 얹어 여섯이 같은 무게로 보이게 한다.
   (번호를 매기는 곳은 '지원하기 전에'의 전형 절차뿐이다. 거긴 진짜 순서다.)
   ========================================================= */
export default async function CulturePage() {
  return (
    <main>
      <section className="s-field s-field-sm">
        <div className="s-wrap">
          <h1 className="s-dsp">여섯 문장</h1>
          <p>제품보다 먼저 정했고, 그대로 지킵니다.</p>
        </div>
      </section>

      <div className="s-wrap s-sheet">
        <section className="s-sect">
          <div className="s-ways">
            {WAYS.map(w => (
              <div key={w.t}>
                <h3 className="s-dsp">{w.t}</h3>
                <p>{w.d}</p>
              </div>
            ))}
          </div>

          <figure className="s-shot">
            {/* next/image 를 쓰지 않는다 — 바깥 주소라 도메인 설정이 필요하고,
                어차피 회사 사진으로 바꿀 자리다 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={WAY_PHOTO} alt="" />
          </figure>
        </section>

        <section className="s-sect">
          <h2 className="s-dsp">팀 이야기</h2>
          <p className="s-sub">무엇을 만들었는지보다, 어떻게 정했는지를 적습니다.</p>

          <div className="s-stories">
            {STORIES.map(s => (
              <article className="s-story" key={s.t}>
                <div className="s-story-ph">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.photo} alt="" />
                </div>
                <span className="s-tag">{s.tag}</span>
                <h3 className="s-dsp">{s.t}</h3>
                <p>{s.d}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
