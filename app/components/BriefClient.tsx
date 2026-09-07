'use client'
/* =========================================================
   외부 면접관 링크 ② — 면접 브리핑 (전체화면)
   ---------------------------------------------------------
   계산은 lib/brief.ts 가 한다. 여기서는 그린다.
   화면 순서는 면접관이 실제로 읽는 순서를 따른다:
     ① 언제·누구를 · 몇 분      (지금 당장 필요한 것)
     ② 앞 단계에서 이미 본 것    (같은 질문 반복 방지 — 이 화면의 핵심)
     ③ 내가 맡은 항목 + 질문 예시
     ④ 같이 들어가는 사람의 분담
     ⑤ 공고 원문
   외부 화면이라 파이프라인·다른 후보자·내부 사유는 내려오지 않는다.
   디자인 규칙: 색은 상태에만(찬성 녹색·반대 버밀리온), 인디고는 '내 것' 표시 전용.
   ========================================================= */
import { useState } from 'react'
import { EXT_CSS } from '../lib/extshell'
import { guideFor, type Brief } from '../lib/brief'

export default function BriefClient({ data }: { data: Brief }) {
  /* 기본은 '내가 맡은 항목만'. 전체를 펼치면 남이 맡은 것까지 보이지만,
     그건 참고용이라 접힌 채로 시작한다 — 목록이 길면 내 몫이 묻힌다. */
  const [all, setAll] = useState(false)

  if (!data.ok) {
    const msg =
      data.reason === 'no-candidate' ? '후보자를 찾을 수 없습니다.'
        : data.reason === 'no-interviewer' ? '면접관 정보를 찾을 수 없습니다.'
          : '이 단계는 평가가 없는 단계입니다.'
    return (
      <div className="ivp-root">
        <style>{EXT_CSS}</style>
        <div className="ivp-card">
          <div className="ivp-brand">
            <span className="ivp-mark" aria-hidden>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
                stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12h4l2-6 4 12 2-6h4" />
              </svg>
            </span>
            <span className="ivp-wm">Cadence</span>
            <span className="ivp-wm-sub">면접 브리핑</span>
          </div>
          <div className="ivp-body">
            <h1 className="ivp-h1">브리핑을 열 수 없어요</h1>
            <p className="ivp-lead">{msg} 담당자에게 링크를 다시 요청해 주세요.</p>
          </div>
        </div>
      </div>
    )
  }

  const mine = data.mine ?? []
  const attrs = data.attrs ?? []
  const shown = all || !data.assigned ? attrs : mine
  const others = (data.split ?? []).filter(s => !s.me)

  /* 앞 단계 결과를 항목 이름으로 묶는다. 같은 항목을 두 사람이 봤으면 두 줄. */
  const cov = data.covered ?? []

  return (
    <div className="ivp-root">
      <style>{EXT_CSS}</style>
      <div className="ivp-card">
        <div className="ivp-brand">
          <span className="ivp-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12h4l2-6 4 12 2-6h4" />
            </svg>
          </span>
          <span className="ivp-wm">Cadence</span>
          <span className="ivp-wm-sub">면접 브리핑</span>
        </div>

        <div className="ivp-body ivp-body-l">
          <h1 className="ivp-h1">
            {data.ivName} 님, {data.candName} 님 {data.kind === 'screen' ? '서류 검토' : '면접'} 5분 준비
          </h1>
          <p className="ivp-lead">
            {data.positionTitle} · {data.stageName}
            {data.kind === 'screen' ? '' : ` · ${data.dur}분`}
            {data.mode ? ` · ${data.mode}` : ''}
          </p>

          {/* ① 기본 정보 */}
          <div className="ivp-kit">
            <div className="ivp-kit-h">후보자</div>
            <div className="ivp-kv">
              <span className="ivp-k">이름</span>
              <span className="ivp-v">
                {data.candName}
                {data.candYears ? <span className="ivp-sub"> · {data.candYears}년차</span> : null}
              </span>
            </div>
            {data.candRole && (
              <div className="ivp-kv">
                <span className="ivp-k">현재</span><span className="ivp-v">{data.candRole}</span>
              </div>
            )}
            {data.candSrc && (
              <div className="ivp-kv">
                <span className="ivp-k">유입</span><span className="ivp-v">{data.candSrc}</span>
              </div>
            )}
            <div className="ivp-kv">
              <span className="ivp-k">포지션</span>
              <span className="ivp-v">
                {data.positionTitle}
                <span className="ivp-sub"> · {data.dept} {data.team} · {data.emp}</span>
              </span>
            </div>
          </div>

          {/* ② 앞 단계에서 이미 본 것 — 이 화면이 존재하는 이유 */}
          <div className="ivp-kit">
            <div className="ivp-kit-h">앞 단계에서 이미 확인된 것</div>
            {cov.length === 0 ? (
              <p className="ivp-fine" style={{ marginTop: 6 }}>
                앞 단계 평가 기록이 없습니다. 이번이 첫 대면이라고 보시면 됩니다.
              </p>
            ) : (
              <>
                <div className="ivp-cov">
                  {cov.map((x, i) => (
                    <div className="ivp-cov-row" key={`${x.attr}-${x.by}-${i}`}>
                      <span className="ivp-cov-l">
                        {x.attr}
                        <span className="ivp-sub"> · {x.stage} · {x.by}</span>
                      </span>
                      <span className={`ivp-cov-v ${x.positive ? 'pos' : 'neg'}`}>{x.label}</span>
                    </div>
                  ))}
                </div>
                <p className="ivp-fine" style={{ marginTop: 9 }}>
                  이미 확인된 항목은 다시 묻지 않으셔도 됩니다.
                  같은 질문을 반복해서 받는 것이 후보자가 중도에 빠지는 흔한 이유입니다.
                </p>
              </>
            )}
            {(data.handover ?? []).length > 0 && (
              <>
                <div className="ivp-kit-h2">앞 면접관이 남긴 메모</div>
                <div className="ivp-cov">
                  {(data.handover ?? []).map((h, i) => (
                    <div className="ivp-cov-row" key={i} style={{ alignItems: 'flex-start' }}>
                      <span className="ivp-cov-l">
                        <span className="ivp-sub">{h.stage} · {h.by} — </span>{h.memo}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ③ 내가 맡은 항목 + 질문 예시 */}
          <div className="ivp-kit">
            <div className="ivp-kit-h">
              {all || !data.assigned ? '이 단계의 전체 항목' : '이번에 확인하실 것'}
              <button
                type="button"
                className="ivp-ghost"
                style={{ float: 'right', fontSize: 11.5 }}
                onClick={() => setAll(v => !v)}
                hidden={!data.assigned}
              >{all ? '내 항목만 보기' : `전체 ${attrs.length}개 보기`}</button>
            </div>
            {!data.assigned ? (
              <p className="ivp-fine" style={{ marginTop: 6 }}>
                이 단계의 면접관 명단에는 안 계셔서 항목을 나누지 않았습니다.
                대신 들어가시는 경우라면 전체를 보시면 됩니다.
              </p>
            ) : null}

            {shown.length === 0 ? (
              <p className="ivp-fine" style={{ marginTop: 6 }}>
                배정된 항목이 없습니다. 전체 항목을 참고해 주세요.
              </p>
            ) : shown.map(a => {
              const g = guideFor(a)
              const isMine = mine.indexOf(a) >= 0
              return (
                <div className={`ivp-mine${isMine ? '' : ' other'}`} key={a}>
                  <div className="ivp-mine-h">
                    {a}
                    {!isMine ? <span className="ivp-sub"> · 다른 면접관 담당</span> : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--t2, #55555f)', marginBottom: 6 }}>
                    {g.what}
                  </div>
                  <ul className="ivp-qs">{g.qs.map(q => <li key={q}>{q}</li>)}</ul>
                </div>
              )
            })}
          </div>

          {/* ④ 분담 */}
          {others.length > 0 && (
            <div className="ivp-kit">
              <div className="ivp-kit-h">{data.assigned ? '같이 들어가는 면접관' : '이 단계 면접관'}</div>
              <div className="ivp-split">
                {(data.split ?? []).map(s => (
                  <div className="ivp-split-row" key={s.uid}>
                    <span className={`ivp-split-nm${s.me ? ' me' : ''}`}>{s.me ? `${s.nm} (나)` : s.nm}</span>
                    <span className="ivp-split-at">{s.attrs.length ? s.attrs.join(' · ') : '—'}</span>
                  </div>
                ))}
              </div>
              <p className="ivp-fine" style={{ marginTop: 9 }}>
                분담은 제안입니다. 대화 흐름에 따라 넘나드셔도 되고, 다만 아무도 안 본 항목이
                남지 않게만 봐주세요.
              </p>
            </div>
          )}

          {/* ⑤ 공고 원문 */}
          {data.jd && (
            <div className="ivp-kit">
              <div className="ivp-kit-h">공고 원문</div>
              <p style={{
                fontSize: 12.5, lineHeight: 1.8, color: 'var(--t2, #55555f)',
                whiteSpace: 'pre-wrap', margin: '6px 0 0',
              }}>{data.jd}</p>
            </div>
          )}

          <div className="ivp-jump">
            <a href={`/iv/${data.cid}/${data.uid}`}>
              {data.submitted ? '내가 낸 평가 보기 · 수정'
                : data.kind === 'screen' ? '검토 결과 남기기' : '면접 끝나고 평가 남기기'}
            </a>
            <a href={`/avail/${data.uid}`}>내 가능한 시간 알려주기</a>
          </div>

          <p className="ivp-fine" style={{ marginTop: 12 }}>
            이 링크는 이 면접 한 건을 위한 것입니다. 외부에 공유하지 말아 주세요.
            {data.recruiter ? ` 문의는 ${data.recruiter} 님에게 회신해 주세요.` : ''}
          </p>
        </div>
      </div>

      <div className="ivp-brandline">
        <span className="ivp-mark-sm" aria-hidden />
        Cadence · TalentCore Hire
      </div>
    </div>
  )
}
