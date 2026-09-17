'use client'

/* =========================================================
   자동화 설정 — 공고 설정 화면 아래에 붙는 조각
   ---------------------------------------------------------
   · 에스컬레이션 규칙 on/off·임계값 편집
   · 슬롯 탐색(범위/시간대/버퍼/타임존)·응답 제한·리마인더 편집
   · 낙관적 갱신 후 서버 저장(persistAuto/persistAutoRules).
     서버는 인메모리 auto[pid] 도 갱신 → 보드의 슬롯 탐색이 즉시 반영.
   · 단계별 SLA 표는 계산된 현황(읽기 전용).
   ========================================================= */
import { useState } from 'react'
import { Icon } from './IconSprite'
import { KIND, type AutoConfig, type Rule } from '../lib/data'
import { persistAuto, persistAutoRules } from '../lib/actions'

export interface SlaRow {
  nm: string; kind: string; dur: number; color: string
  sla: number; avg: number; over: number
}
const WINDOWS = [5, 10, 15, 20, 30]
const SLA_HRS = [12, 24, 48, 72]

export default function AutoRules(
  { pid, initialAuto, slaRows }:
  { pid: string; initialAuto: AutoConfig; slaRows: SlaRow[] },
) {
  const [a, setA] = useState<AutoConfig>(initialAuto)

  /* 규칙 배열을 바꾸고 저장 */
  function updateRules(next: Rule[]) {
    setA(s => ({ ...s, rules: next }))
    void persistAutoRules(pid, next).catch(() => {})
  }
  function toggleRule(id: string) {
    updateRules(a.rules.map(r => (r.id === id && !r.lock ? { ...r, on: !r.on } : r)))
  }
  function setThreshold(id: string, th: string) {
    updateRules(a.rules.map(r => (r.id === id ? { ...r, th } : r)))
  }

  /* 파라미터 저장 */
  function patch(p: Partial<AutoConfig>) {
    setA(s => ({ ...s, ...p }))
    void persistAuto(pid, p).catch(() => {})
  }

  const activeRules = a.rules.filter(r => r.on).length
  const winOpts = WINDOWS.includes(a.window) ? WINDOWS : [a.window, ...WINDOWS].sort((x, y) => x - y)
  const candOpts = SLA_HRS.includes(a.candSla) ? SLA_HRS : [a.candSla, ...SLA_HRS].sort((x, y) => x - y)
  const ivOpts = SLA_HRS.includes(a.ivSla) ? SLA_HRS : [a.ivSla, ...SLA_HRS].sort((x, y) => x - y)

  return (
    <div id="auto">
      <div className="sec-h" style={{ marginTop: 34 }}>
        <h3>자동화</h3><span className="n">켜진 규칙 {activeRules}종</span>
        <span className="hint">조율·독촉 규칙과 면접 시간 탐색 기준</span>
      </div>
    <div className="split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 26, alignItems: 'start' }}>
      {/* ----- 왼쪽 ----- */}
      <div>
        <div className="sec-h">
          <h3>에스컬레이션 규칙</h3><span className="n">{a.rules.length}종</span>
          <span className="hint">켜진 규칙이 걸리면 조율 처리함으로 올라옵니다</span>
        </div>
        <div className="sheet">
          {a.rules.map(r => (
            <div className="rule" key={r.id}>
              <div className="txt"><b>{r.nm}</b><span>{r.d}</span></div>
              <div className="ctl">
                {r.lock
                  ? <span className="pill"><Icon id="i-lock" className="ic-sm" />해제 불가</span>
                  : (
                    <input
                      className="in sm w-sm" value={r.th}
                      onChange={e => setA(s => ({ ...s, rules: s.rules.map(x => (x.id === r.id ? { ...x, th: e.target.value } : x)) }))}
                      onBlur={e => setThreshold(r.id, e.target.value.trim() || r.th)}
                    />
                  )}
                <button
                  className={'sw' + (r.on ? ' on' : '')}
                  disabled={r.lock}
                  onClick={() => toggleRule(r.id)}
                  title={r.on ? '켜짐' : '꺼짐'}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="sec-h" style={{ marginTop: 26 }}>
          <h3>단계별 기준 체류일 (SLA)</h3>
          <span className="hint">초과하면 카드가 주황으로 바뀝니다</span>
        </div>
        <div className="sheet">
          <table className="tb">
            <thead>
              <tr><th>단계</th><th>유형</th><th className="num">기준</th><th className="num">현재 평균</th><th className="num">초과</th></tr>
            </thead>
            <tbody>
              {slaRows.map((s, i) => (
                <tr key={i}>
                  <td className="strong">
                    <i className="se-sw" style={{ display: 'inline-block', background: s.color, marginRight: 7 }} />{s.nm}
                  </td>
                  <td style={{ color: 'var(--t3)' }}>{KIND[s.kind as keyof typeof KIND]}{s.dur ? ' · ' + s.dur + '분' : ''}</td>
                  <td className="num">{s.sla}d</td>
                  <td className="num" style={s.avg > s.sla ? { color: 'var(--esc)', fontWeight: 600 } : undefined}>{s.avg.toFixed(1)}d</td>
                  <td className="num">{s.over ? <span className="pill bad">{s.over}명</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ----- 오른쪽: 파라미터 ----- */}
      <div>
        <div className="sec-h"><h3>슬롯 탐색</h3><span className="hint">보드 탐색에 실제 반영</span></div>
        <div className="sheet" style={{ padding: '16px 18px' }}>
          <div className="field">
            <label>탐색 범위</label>
            <select
              className="sel" value={a.window}
              onChange={e => patch({ window: +e.target.value })}
            >
              {winOpts.map(w => <option key={w} value={w}>영업일 {w}일</option>)}
            </select>
            <div className="desc">엔진이 이 범위의 영업일에서 캘린더 교집합을 찾습니다.</div>
          </div>
          <div className="field">
            <label>탐색 시간대</label>
            <input
              className="in" value={a.hours}
              onChange={e => setA(s => ({ ...s, hours: e.target.value }))}
              onBlur={e => patch({ hours: e.target.value.trim() || a.hours })}
            />
          </div>
          <div className="row2">
            <div className="field">
              <label>면접 간 버퍼(분)</label>
              <input
                className="in" type="number" min={0} value={a.buffer}
                onChange={e => setA(s => ({ ...s, buffer: +e.target.value }))}
                onBlur={e => patch({ buffer: Math.max(0, +e.target.value || 0) })}
              />
            </div>
            <div className="field">
              <label>타임존</label>
              <input
                className="in" value={a.tz}
                onChange={e => setA(s => ({ ...s, tz: e.target.value }))}
                onBlur={e => patch({ tz: e.target.value.trim() || a.tz })}
              />
            </div>
          </div>
        </div>

        <div className="sec-h" style={{ marginTop: 20 }}><h3>응답 제한 · 리마인더</h3></div>
        <div className="sheet" style={{ padding: '16px 18px' }}>
          <div className="row2">
            <div className="field">
              <label>후보자</label>
              <select className="sel" value={a.candSla} onChange={e => patch({ candSla: +e.target.value })}>
                {candOpts.map(h => <option key={h} value={h}>{h}시간</option>)}
              </select>
            </div>
            <div className="field">
              <label>면접관</label>
              <select className="sel" value={a.ivSla} onChange={e => patch({ ivSla: +e.target.value })}>
                {ivOpts.map(h => <option key={h} value={h}>{h}시간</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label>리마인더 타이밍</label>
            <input
              className="in" value={a.remind}
              onChange={e => setA(s => ({ ...s, remind: e.target.value }))}
              onBlur={e => patch({ remind: e.target.value.trim() || a.remind })}
            />
            <div className="desc">면접 전 리마인더는 후보자·면접관 양쪽에 발송됩니다.</div>
          </div>
        </div>

        <div className="note" style={{ marginTop: 14 }}>
          <h4><Icon id="i-shield" className="ic-sm" />AI가 하지 않는 것</h4>
          <ul>
            <li><b>일정을 확정하지 않습니다.</b> 면접관의 명시적 클릭이 있어야 확정됩니다.</li>
            <li>EA 조율 대상이 포함되면 자동화에서 <b>완전히 제외</b>하고 즉시 코디네이터로 넘깁니다.</li>
            <li>불합격 통보를 자동 발송하지 않습니다. 초안까지만 만듭니다.</li>
          </ul>
        </div>
      </div>
    </div>
    </div>
  )
}
