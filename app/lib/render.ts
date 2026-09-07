/* =========================================================
   Cadence — 화면 HTML 빌더 (프로토타입 app.js 이식)
   각 함수는 HTML 문자열을 반환하고, 페이지에서 Screen 래퍼로 렌더한다.
   해시 라우트(#/...)는 Next 경로(/...)로 치환했다.
   ========================================================= */
import {
  me, positions, people, cands, auto, links, timeline, trail, evals,
  funnelRows, dwellRows, sourceRows, kpis, exportCols,
  LABEL, KIND, stagesOf, stageById, posById, activeCands, byRisk,
  md, daysSince, offerOf, offerList, rejectRows,
  type Candidate, type Person,
} from './data'
import {
  ratingDef, isPositive, isGradable, tally, verdictOf, VERDICT_LABEL,
} from './scorecard'
import {
  offerStateDef, declineDef, chainLabel,
  currentApprover, isHeld, overBand, bandPct, won, totalComp, canSend,
  type Offer, type OfferState,
} from './offer'
import { rejectDef, SIDE_LABEL } from './decision'
import { mtgViews, inboxAll } from './meetings'
// 서버 전용 google.ts 에서 '타입만' 가져온다(클라이언트 번들에 fs·시크릿 유입 방지).
import type { GoogleStatus } from './google'
import type { MailerStatus } from './mailer'
import { reviewQueue } from './review'
import { dupFor, otherApps } from './pool'
import { docKindLabel, sizeLabel, type CandDoc } from './docs'
import { mailKindLabel } from './cand-mail'
import type { MailRow } from './maillog'

/* ---------- 프리미티브 ---------- */
export const esc = (s: unknown) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
export const ico = (id: string, cls?: string) =>
  `<svg class="ic${cls ? ' ' + cls : ''}"><use href="#${id}"/></svg>`
const candsOf = (pid: string) => cands.filter(c => c.p === pid)

export function note(items: string[]) {
  return `<div class="note"><h4>${ico('i-info', 'ic-sm')}이 화면에서 관리하는 법</h4><ul>` +
    items.map(i => `<li>${i}</li>`).join('') + '</ul></div>'
}
const field = (l: string, inner: string) => `<div class="field"><label>${l}</label>${inner}</div>`
const infoRow = (i: string, t: string, d: string) =>
  `<div style="display:flex;gap:9px;padding:7px 0">${ico(i)}<div><b style="font-size:12.5px">${t}</b>` +
  `<div style="font-size:11.5px;color:var(--t3);margin-top:1px">${d}</div></div></div>`
const kv = (k: string, v: string) =>
  `<div style="display:flex;padding:5px 0;font-size:12px"><span style="width:82px;color:var(--t4);flex:none">${esc(k)}</span>` +
  `<b style="font-weight:500">${esc(v)}</b></div>`
const comm = (ch: string, t: string, d: string, ok = true) =>
  `<div style="display:flex;gap:9px;align-items:center;padding:10px 14px;border-top:1px solid var(--line)">` +
  ico(ch === '메일' ? 'i-mail' : 'i-msg') + `<div style="flex:1;min-width:0"><b style="font-size:12px;font-weight:500">${esc(t)}</b>` +
  `<div style="font-size:10.5px;color:var(--t4)">${esc(ch)}` +
  (ok ? '' : ' · <b style="color:var(--esc);font-weight:500">나가지 못함</b>') + '</div></div>' +
  `<span class="mono" style="font-size:10.5px;color:var(--t4)">${esc(d)}</span></div>`

/* 기록에 찍힌 시각(ISO)을 화면 표기로. */
const mailAt = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso
    : `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')} ` +
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* 제출서류 — 올리고 지우는 것은 서랍이 맡는다. 여기서는 '무엇이 붙어 있나'만 보여 준다. */
const docsBoxHTML = (docs: CandDoc[]) =>
  `<div class="sec-h" style="margin-top:20px"><h3>제출서류</h3><span class="n">${docs.length}건</span></div>` +
  (docs.length
    ? '<div class="sheet">' + docs.map(d =>
      '<div style="display:flex;gap:9px;align-items:center;padding:10px 14px;border-top:1px solid var(--line)">' +
      ico('i-file') + '<div style="flex:1;min-width:0">' +
      `<b style="font-size:12px;font-weight:500">${esc(d.nm)}</b>` +
      `<div style="font-size:10.5px;color:var(--t4)">${esc(docKindLabel(d.kind))} · ${esc(sizeLabel(d.size))}</div></div></div>`).join('') + '</div>'
    : `<div class="sheet"><div class="empty">${ico('i-file')}<b>아직 올라온 서류가 없습니다</b>` +
      '<span>서랍의 개요 탭에서 이력서·포트폴리오를 올릴 수 있습니다</span></div></div>')
const kpi = (i: string, l: string, v: string, u: string, d: string, dir?: string) =>
  `<div class="kpi"><div class="lb">${ico(i, 'ic-sm')}${esc(l)}</div>` +
  `<div class="v">${v}<small>${esc(u)}</small></div><div class="dl ${dir || ''}">${esc(d)}</div></div>`

/* ---------- 공고 헤더 (공고 하위 화면 공통) ---------- */
export function posHeader(pid: string, tab: string) {
  const p = posById(pid), cs = activeCands(pid)
  const risk = cs.filter(c => c.s === 'esc' || c.s === 'late').length
  const st = ({ open: ['ok', '오픈'], hold: ['warn', '홀드'], closed: ['', '마감'] } as Record<string, string[]>)[p.st]
  const tabs: [string, string, string, number | null][] = [
    ['board', '파이프라인', 'i-columns', cs.length],
    ['progress', '진행 매트릭스', 'i-rows', null],
    ['setup', '공고 설정', 'i-sliders', null],
    ['auto', '자동화', 'i-zap', null],
    ['links', '지원 링크', 'i-link', null],
  ]
  return '<header class="top">' +
    `<div class="crumb">${ico('i-briefcase', 'ic-sm')}<a href="/positions">공고</a>` +
    `<span class="sep">/</span>${esc(p.dept)}<span class="sep">/</span>${esc(p.team)}</div>` +
    `<div class="h-row"><h1>${esc(p.title)}</h1>` +
    `<span class="pill ${st[0]}"><i class="dot"></i>${st[1]}</span>` +
    (risk ? `<span class="pill bad">${ico('i-alert', 'ic-sm')}사람 대기 ${risk}</span>` : '') +
    '<div class="spacer">' +
    `<a class="btn" href="/p/${pid}/links">${ico('i-link', 'ic-sm')}지원 링크</a>` +
    `<button class="btn br">${ico('i-plus', 'ic-sm')}후보자 추가</button>` +
    '</div></div>' +
    '<div class="meta">' +
    `<i>${ico('i-users', 'ic-sm')}${esc(p.dept)} <b>${esc(p.team)}</b></i>` +
    `<i>${ico('i-user', 'ic-sm')}리크루터 <b>${esc(p.rec)}</b></i>` +
    `<i>${ico('i-star', 'ic-sm')}HM <b>${esc(p.hm)}</b></i>` +
    `<i>${ico('i-clock', 'ic-sm')}게시 <b>D+${p.ttf}</b></i>` +
    `<i>${ico('i-briefcase', 'ic-sm')}고용형태 <b>${esc(p.emp)}</b></i>` +
    /* TalentCore 에서 넘어온 공고만 — 몇 자리를 채우는 공고인지, 어느 요청서에서 왔는지.
       색은 쓰지 않는다(상태가 아니라 출처 표시다). */
    ((p.openings ?? 1) > 1 ? `<i>${ico('i-users', 'ic-sm')}채용 인원 <b>${p.openings}명</b></i>` : '') +
    (p.reqRef ? `<i>${ico('i-link', 'ic-sm')}TalentCore <b>${esc(p.reqRef)}</b></i>` : '') +
    '</div>' +
    '<nav class="tabs">' + tabs.map(t =>
      `<a class="tab${tab === t[0] ? ' on' : ''}" href="/p/${pid}/${t[0]}">${ico(t[2], 'ic-sm')}${t[1]}` +
      (t[3] != null ? `<span class="cnt">${t[3]}</span>` : '') + '</a>').join('') + '</nav>' +
    '</header>'
}

/* ---------- 진행 매트릭스 ---------- */
export function progressHTML(pid: string) {
  const stages = stagesOf(pid).filter(s => s.kind !== 'reject')
  const list = activeCands(pid).concat(candsOf(pid).filter(c => stageById(pid, c.st).kind === 'hired')).sort(byRisk)
  const rail = stages.map(sg => {
    const mine = candsOf(pid).filter(c => c.st === sg.id)
    const risk = mine.filter(c => c.s === 'esc' || c.s === 'late').length
    const hot = risk > 0 && mine.length > 1
    return `<div class="rb${hot ? ' hot' : ''}"><i class="sq" style="background:${sg.color}"></i>` +
      `<span class="c">${mine.length}</span><span class="l">${esc(sg.nm)}</span>` +
      (risk ? `<span class="w">${ico('i-alert')}${risk}</span>` : '') + '</div>'
  }).join('')
  const head = stages.map(s => `<th>${esc(s.nm)}</th>`).join('')
  const idx: Record<string, number> = {}; stages.forEach((s, i) => { idx[s.id] = i })
  const rows = list.map(c => {
    const at = idx[c.st] || 0
    const cells = stages.map((sg, i) => {
      const cls = i < at ? 'node past' : (i === at ? 'node now s-' + c.s : 'node')
      const edge = (i === 0 ? ' first' : '') + (i === stages.length - 1 ? ' last' : '') + (i <= at ? ' done' : '')
      return `<td class="cell${edge}"><span class="${cls}"></span></td>`
    }).join('')
    return `<tr data-c="${c.id}"><td class="who"><div class="nm">${esc(c.nm)}</div>` +
      `<div class="sub">${ico('i-calendar')}${md(c.ap)} 유입 · ${ico('i-clock')}${c.d}d · ${esc(c.src)}</div></td>` +
      cells + `<td class="act s-${c.s}">${c.why ? `<span class="why">${esc(c.why)}</span>` : ''}` +
      (c.act ? c.act.map((a, i) => `<button class="btn${i === 0 ? ' solid' : ''}">${esc(a)}</button>`).join('')
        : `<button class="btn quiet">보기</button>`) + '</td></tr>'
  }).join('')
  return posHeader(pid, 'progress') +
    '<div class="stage">' +
    `<div class="railbar">${rail}</div>` +
    `<div class="sheet"><table class="mx"><thead><tr><th>후보자</th>${head}<th>상태 · 다음 행동</th></tr></thead><tbody>${rows}</tbody></table></div>` +
    note([
      '위 레일이 <b>공고의 단면</b>이다. 숫자가 쌓이고 붉어진 칸이 병목이다.',
      '아래 한 줄이 <b>후보자 한 명의 궤적</b>. 굵은 원이 현재 위치이고 그 색이 조율 상태다.',
      '보드가 "지금 무엇을 할까"라면, 이 표는 <b>"이 공고가 어디서 막히는가"</b>에 답한다.',
    ]) + '</div>'
}

/* ---------- 공고 설정 ---------- */
const PRESETS = [
  { nm: '사전 과제', kind: 'task', sla: 5, dur: 0, mode: '—' },
  { nm: '컬처핏 인터뷰', kind: 'interview', sla: 4, dur: 60, mode: '화상' },
  { nm: '실무 인터뷰', kind: 'interview', sla: 5, dur: 90, mode: '대면' },
  { nm: '레퍼런스 체크', kind: 'screen', sla: 3, dur: 0, mode: '—' },
  { nm: '임원 면접', kind: 'interview', sla: 7, dur: 60, mode: '대면' },
  { nm: '처우 협의', kind: 'offer', sla: 3, dur: 0, mode: '—' },
]
export function setupHTML(pid: string) {
  const p = posById(pid), st = stagesOf(pid)
  const rows = st.map((s, i) => {
    const ivs = (s.ivs || []).map(id => { const u = people.find(x => x.id === id); return u ? u.nm + (u.ea ? ' (EA)' : '') : '' }).join(', ')
    return `<div class="se-row" draggable="${!s.rail}" data-s="${s.id}" data-i="${i}">` +
      (s.rail ? `<span class="se-grip" style="opacity:.25">${ico('i-lock', 'ic-sm')}</span>`
        : `<span class="se-grip">${ico('i-grip')}</span>`) +
      `<i class="se-sw" style="background:${s.color}"></i>` +
      `<input class="se-name" value="${esc(s.nm)}" data-rn="${s.id}"${s.rail ? ' readonly' : ''}>` +
      `<span class="se-kind">${KIND[s.kind]}</span>` +
      (s.rail ? `<span class="se-f">${ico('i-lock')}고정 단계</span>` :
        `<label class="se-f" title="이 단계의 기준 체류일">${ico('i-clock')}` +
        `<input class="in sm w-xs" type="number" min="0" value="${s.sla}" data-sla="${s.id}">d</label>` +
        (s.kind === 'interview'
          ? `<label class="se-f" title="면접 길이">${ico('i-video')}` +
            `<select class="sel sm w-sm" data-dur="${s.id}">` +
            [30, 45, 60, 90, 120].map(m => `<option${s.dur === m ? ' selected' : ''}>${m}분</option>`).join('') +
            '</select></label>' +
            `<span class="se-f">${ico('i-users')}${ivs || '미지정'}</span>`
          : `<span class="se-f">${ico('i-zap')}${s.auto ? '자동' : '수동'}</span>`)) +
      (s.rail ? '' : `<button class="se-del" data-del="${s.id}" title="단계 삭제">${ico('i-trash', 'ic-sm')}</button>`) +
      '</div>'
  }).join('')
  return posHeader(pid, 'setup') +
    '<div class="stage">' +
    '<div style="display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:26px;align-items:start">' +
    '<div>' +
    `<div class="sec-h"><h3>전형 단계 구성</h3><span class="n">${st.length}단계</span>` +
    `<span class="hint">${ico('i-grip', 'ic-sm')} 끌어서 순서 변경 · 이름을 눌러 수정</span></div>` +
    `<div class="sheet" id="stageEditor">${rows}` +
    `<button class="se-add" data-preset="__custom">${ico('i-plus', 'ic-sm')}단계 추가</button></div>` +
    '<div class="preset">' + PRESETS.map((pz, i) => `<button data-preset="${i}">${ico('i-plus', 'ic-sm')}${esc(pz.nm)}</button>`).join('') + '</div>' +
    '<div class="sec-h" style="margin-top:26px"><h3>기본 정보</h3></div>' +
    '<div class="sheet" style="padding:16px 18px">' +
    '<div class="row2">' +
    field('공고명', `<input class="in" value="${esc(p.title)}">`) +
    field('고용형태', '<select class="sel">' + ['정규직', '계약직', '파트타임', '인턴', '프리랜서', '파견'].map(x => `<option${p.emp === x ? ' selected' : ''}>${x}</option>`).join('') + '</select>') +
    '</div>' +
    '<div class="row3">' +
    field('부문', '<select class="sel"><option>플랫폼본부</option><option>프로덕트본부</option><option>사업본부</option></select>') +
    field('팀', `<input class="in" value="${esc(p.team)}">`) +
    field('상태', '<select class="sel"><option>오픈</option><option>홀드</option><option>마감</option></select>') +
    '</div>' +
    '<div class="row2">' +
    field('담당 리크루터', '<select class="sel"><option>정수민</option><option>박현우</option></select>') +
    field('하이어링 매니저', '<select class="sel"><option>최영수</option><option>노아름</option></select>') +
    '</div>' +
    field('JD', `<textarea class="ta">${esc(p.jd)}</textarea>`) +
    '</div>' +
    '</div>' +
    '<div>' +
    '<div class="sec-h"><h3>단계 구성이 하는 일</h3></div>' +
    '<div class="sheet" style="padding:15px 16px">' +
    infoRow('i-columns', '파이프라인 열', '여기서 만든 단계가 곧 보드의 열이 됩니다.') +
    infoRow('i-clock', '기준 체류일', '초과하면 카드가 주황(지연)으로 바뀝니다.') +
    infoRow('i-video', '면접 길이', '캘린더 교집합을 찾을 블록 길이입니다. 2시간이면 연속 2시간을 찾습니다.') +
    infoRow('i-users', '면접관', 'EA 조율 대상이 한 명이라도 있으면 그 단계는 자동화에서 제외됩니다.') +
    infoRow('i-download', 'Export', '추가한 단계는 Export 컬럼에 타임스탬프로 자동 추가됩니다.') +
    '</div>' +
    '<div class="note" style="margin-top:14px">' +
    `<h4>${ico('i-info', 'ic-sm')}주의</h4><ul>` +
    '<li>진행 중인 후보자가 있는 단계는 삭제할 수 없습니다.</li>' +
    '<li><b>입사 · 불합격</b>은 종료 단계라 순서와 이름이 고정입니다.</li>' +
    '<li>단계를 바꿔도 이미 지나간 후보자의 이력은 그대로 보존됩니다.</li></ul></div>' +
    '</div>' +
    '</div>' +
    '</div>'
}

/* ---------- 자동화 설정 ---------- */
export function autoHTML(pid: string) {
  const a = auto[pid] || auto.p1
  const rules = a.rules.map(r =>
    '<div class="rule"><div class="txt"><b>' + esc(r.nm) + '</b><span>' + esc(r.d) + '</span></div>' +
    '<div class="ctl">' +
    (r.lock ? `<span class="pill">${ico('i-lock', 'ic-sm')}해제 불가</span>`
      : `<input class="in sm w-sm" value="${esc(r.th)}">`) +
    `<button class="sw${r.on ? ' on' : ''}" data-rule="${r.id}"${r.lock ? ' disabled' : ''}></button>` +
    '</div></div>').join('')
  return posHeader(pid, 'auto') +
    '<div class="stage">' +
    '<div style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:26px;align-items:start">' +
    '<div>' +
    `<div class="sec-h"><h3>에스컬레이션 규칙</h3><span class="n">${a.rules.length}종</span>` +
    '<span class="hint">켜진 규칙이 걸리면 조율 처리함으로 올라옵니다</span></div>' +
    `<div class="sheet">${rules}</div>` +
    '<div class="sec-h" style="margin-top:26px"><h3>단계별 기준 체류일 (SLA)</h3>' +
    '<span class="hint">초과하면 카드가 주황으로 바뀝니다</span></div>' +
    '<div class="sheet"><table class="tb"><thead><tr><th>단계</th><th>유형</th>' +
    '<th class="num">기준</th><th class="num">현재 평균</th><th class="num">초과</th></tr></thead><tbody>' +
    stagesOf(pid).filter(s => !s.rail).map(s => {
      const mine = candsOf(pid).filter(c => c.st === s.id)
      const avg = mine.length ? (mine.reduce((x, c) => x + c.d, 0) / mine.length) : 0
      const over = mine.filter(c => c.d > s.sla).length
      return `<tr><td class="strong"><i class="se-sw" style="display:inline-block;background:${s.color};margin-right:7px"></i>${esc(s.nm)}</td>` +
        `<td style="color:var(--t3)">${KIND[s.kind]}${s.dur ? ' · ' + s.dur + '분' : ''}</td>` +
        `<td class="num">${s.sla}d</td><td class="num"${avg > s.sla ? ' style="color:var(--esc);font-weight:600"' : ''}>${avg.toFixed(1)}d</td>` +
        `<td class="num">${over ? `<span class="pill bad">${over}명</span>` : '—'}</td></tr>`
    }).join('') + '</tbody></table></div>' +
    '</div>' +
    '<div>' +
    '<div class="sec-h"><h3>슬롯 탐색</h3></div>' +
    '<div class="sheet" style="padding:16px 18px">' +
    field('탐색 범위', `<select class="sel"><option>영업일 ${a.window}일</option><option>영업일 5일</option><option>영업일 15일</option></select>`) +
    field('탐색 시간대', `<input class="in" value="${esc(a.hours)}">`) +
    '<div class="row2">' +
    field('면접 간 버퍼', `<input class="in" value="${a.buffer}분">`) +
    field('타임존', `<input class="in" value="${esc(a.tz)}">`) +
    '</div>' +
    '</div>' +
    '<div class="sec-h" style="margin-top:20px"><h3>응답 제한 · 리마인더</h3></div>' +
    '<div class="sheet" style="padding:16px 18px">' +
    '<div class="row2">' +
    field('후보자', `<select class="sel"><option>${a.candSla}시간</option><option>24시간</option><option>72시간</option></select>`) +
    field('면접관', `<select class="sel"><option>${a.ivSla}시간</option><option>12시간</option><option>48시간</option></select>`) +
    '</div>' +
    field('리마인더 타이밍', `<input class="in" value="${esc(a.remind)}">`) +
    '<div class="desc" style="font-size:11px;color:var(--t4)">면접 전 리마인더는 후보자·면접관 양쪽에 발송됩니다.</div>' +
    '</div>' +
    `<div class="note" style="margin-top:14px"><h4>${ico('i-shield', 'ic-sm')}AI가 하지 않는 것</h4><ul>` +
    '<li><b>일정을 확정하지 않습니다.</b> 면접관의 명시적 클릭이 있어야 확정됩니다.</li>' +
    '<li>EA 조율 대상이 포함되면 자동화에서 <b>완전히 제외</b>하고 즉시 코디네이터로 넘깁니다.</li>' +
    '<li>불합격 통보를 자동 발송하지 않습니다. 초안까지만 만듭니다.</li></ul></div>' +
    '</div>' +
    '</div>' +
    '</div>'
}

/* ---------- 지원 링크 ---------- */
export function linksHTML(pid: string) {
  const ls = links[pid] || links.p1
  return posHeader(pid, 'links') +
    '<div class="stage">' +
    `<div class="sec-h"><h3>채널별 지원 링크</h3><span class="hint">유입 출처가 Export의 <code>utm_source</code>로 자동 기록됩니다</span>` +
    `<div class="right"><button class="btn br">${ico('i-plus', 'ic-sm')}링크 생성</button></div></div>` +
    '<div class="sheet"><table class="tb"><thead><tr><th>채널</th><th>URL</th>' +
    '<th class="num">조회</th><th class="num">지원</th><th class="num">전환율</th><th></th></tr></thead><tbody>' +
    ls.map(l =>
      `<tr><td class="strong">${esc(l.ch)}</td>` +
      `<td class="mono" style="color:var(--t3);font-size:11.5px">${esc(l.url)}</td>` +
      `<td class="num">${l.v}</td><td class="num">${l.a}</td>` +
      `<td class="num">${(l.a / l.v * 100).toFixed(1)}%</td>` +
      `<td style="text-align:right"><button class="btn quiet" data-copy="${esc(l.url)}">${ico('i-copy', 'ic-sm')}복사</button></td></tr>`
    ).join('') + '</tbody></table></div>' +
    note([
      '채널마다 별도 링크를 쓰면 <b>출처를 사람이 입력할 필요가 없습니다</b>. 유입 시점에 자동 기록됩니다.',
      '임직원 추천 링크는 추천인이 함께 기록되어, 대시보드의 <b>레퍼럴 추천인 순위</b>로 이어집니다.',
    ]) + '</div>'
}

/* ---------- 후보자 상세 ----------
   이 화면도 오퍼처럼 가운데에 '실제로 누르는 패널'(DecisionClient)이 끼어든다.
   그래서 머리(header)와 몸통을 두 조각으로 나눠 준다. */
export function candidateHeadHTML(cid: string) {
  const c = cands.find(x => x.id === cid)
  if (!c) return notFoundHTML()
  const p = posById(c.p), sg = stageById(c.p, c.st)
  const ev = evals[cid] || []
  return '<header class="top">' +
    `<div class="crumb">${ico('i-users', 'ic-sm')}<a href="/p/${c.p}/board">${esc(p.title)}</a><span class="sep">/</span>후보자</div>` +
    `<div class="h-row"><h1>${esc(c.nm)}</h1>` +
    `<span class="pill" style="background:${sg.color}1a;color:${sg.color}"><i class="dot"></i>${esc(sg.nm)}</span>` +
    (c.s === 'esc' ? `<span class="pill bad">${ico('i-alert', 'ic-sm')}${esc(c.why)}</span>` :
      c.s === 'late' ? `<span class="pill warn">${ico('i-clock', 'ic-sm')}${esc(c.why)}</span>` : '') +
    '<div class="spacer">' +
    (ev.length ? `<a class="btn" href="/e/${c.id}">${ico('i-rows', 'ic-sm')}평가 비교</a>` : '') +
    (offerOf(c.id) ? `<a class="btn" href="/o/${c.id}">${ico('i-flag', 'ic-sm')}오퍼</a>` : '') +
    '</div></div>' +
    '<div class="meta">' +
    `<i>${ico('i-calendar', 'ic-sm')}유입 <b>${md(c.ap)}</b> (${daysSince(c.ap)}일 전)</i>` +
    `<i>${ico('i-clock', 'ic-sm')}현 단계 <b>${c.d}d</b></i>` +
    `<i>${ico('i-link', 'ic-sm')}출처 <b>${esc(c.src)}</b></i>` +
    `<i>${ico('i-briefcase', 'ic-sm')}<b>${esc(c.role)}</b> · ${c.yr}년차</i></div>` +
    dupBannerHTML(cid) +
    '</header>'
}

/* 같은 사람일 수 있다는 신호를 판정 패널 위에 둔다.
   떨어뜨리거나 오퍼를 낸 뒤에 "사실 같은 사람이었다"를 알면 되돌릴 것이 없다.
   색은 쓰지 않는다 — 아직 사실이 아니라 '확인해 달라'라서, 경고처럼 보이면 오히려 안 누른다. */
function dupBannerHTML(cid: string) {
  const d = dupFor(cid)
  if (!d.length) return ''
  const one = d[0]
  const other = one.a.id === cid ? one.b : one.a
  return '<div class="c-dup">' + ico('i-copy', 'ic-sm') +
    '<div><b>같은 사람의 지원건일 수 있습니다</b>' +
    `<span>${esc(posById(other.p).title)} 지원건 · ${esc(one.note)}` +
    (d.length > 1 ? ` · 외 ${d.length - 1}건` : '') + '</span></div>' +
    `<a class="btn sm" href="/pool?t=dup">${ico('i-copy', 'ic-sm')}확인하기</a></div>`
}

export function candidateFootHTML(cid: string, docs: CandDoc[] = [], mails: MailRow[] = []) {
  const c = cands.find(x => x.id === cid)
  if (!c) return ''
  const p = posById(c.p), sg = stageById(c.p, c.st)
  /* 손으로 써 둔 예시 타임라인 + 실제로 눌린 판정 기록을 이어 붙인다.
     예시가 없는 후보자는 유입·현재 단계 두 줄로 시작한다. */
  const tl = [
    ...(timeline[cid] || [
      { t: md(c.ap), b: '지원 접수', p: esc(c.src) + ' 유입 · 자동 기록', s: 'done' },
      { t: md(c.en), b: sg.nm + ' 진입', p: c.why || '자동 진행 중', s: 'now' },
    ]),
    ...(trail[cid] || []).map(t => ({ t: t.at, b: t.b, p: t.p, s: t.s })),
  ]
  const ev = evals[cid] || []

  /* 불합격으로 끝난 카드는 사유를 화면 위쪽에 그대로 남긴다.
     '어디서, 왜, 누가 빠졌나'가 다음 채용의 유일한 자산이다. */
  const rj = c.rj ? rejectDef(c.rj) : null
  const rjBox = rj
    ? '<div class="sheet" style="margin-bottom:18px;box-shadow:inset 0 0 0 1px var(--esc-rim), var(--sh-1)">' +
      '<div class="sec-h" style="padding:16px 18px 0"><h3>전형 종료 사유</h3>' +
      `<span class="pill bad">${esc(rj.l)}</span>` +
      `<small style="color:var(--t4);margin-left:6px">${esc(SIDE_LABEL[rj.side])}</small></div>` +
      '<div style="padding:10px 18px 18px">' +
      `<div style="font-size:11.5px;color:var(--t3)">${esc(rj.d)}</div>` +
      (c.ex ? `<div style="font-size:11.5px;color:var(--t3);margin-top:6px">마지막 단계 — <b>${esc(stageById(c.p, c.ex).nm)}</b>` +
        (c.decided ? ` · ${esc(md(c.decided))} 판정` : '') + '</div>' : '') +
      (c.rjMemo ? `<p style="font-size:12.5px;color:var(--t2);line-height:1.6;margin:10px 0 0">${esc(c.rjMemo)}</p>` : '') +
      '</div></div>'
    : ''

  return '<div class="stage" style="padding-top:18px">' + rjBox +
    '<div style="display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:26px;align-items:start">' +
    '<div>' +
    '<div class="sec-h"><h3>전형 타임라인</h3><span class="hint">모든 값은 이벤트 발생 시점에 자동 기록됩니다</span></div>' +
    '<div class="sheet" style="padding:18px 20px"><div class="tl">' +
    tl.map(t => `<div class="tl-i ${t.s || ''}"><b>${esc(t.b)}</b><span class="t">${esc(t.t)}</span><p>${esc(t.p)}</p></div>`).join('') +
    '</div></div>' +
    `<div class="sec-h" style="margin-top:24px"><h3>평가</h3><span class="n">${ev.length}건</span>` +
    (ev.length ? `<div class="right"><a class="btn quiet" href="/e/${c.id}">${ico('i-rows', 'ic-sm')}나란히 비교</a></div>` : '') + '</div>' +
    (ev.length ? '<div class="sheet">' + ev.map(e =>
      '<div style="padding:14px 16px;border-top:1px solid var(--line)">' +
      '<div style="display:flex;align-items:center;gap:9px">' +
      `<span class="avatar">${e.iv.charAt(0)}</span>` +
      `<div><b style="font-size:13px">${esc(e.iv)}</b>` +
      `<div style="font-size:11px;color:var(--t4)">${esc(e.role)} · ${esc(e.st)} · ${esc(e.at)}</div></div>` +
      `<span style="margin-left:auto">${rateChip(e.overall)}</span></div>` +
      '<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap">' +
      e.items.map(it => `<span style="font-size:11.5px;color:var(--t3)">${esc(it[0])} ` +
        `<b style="color:${isPositive(it[1]) ? 'var(--done)' : 'var(--esc)'}">${esc(ratingDef(it[1]).l)}</b></span>`).join('') + '</div>' +
      `<p style="font-size:12px;color:var(--t2);margin-top:9px">${esc(e.memo)}</p></div>`).join('') + '</div>'
      : `<div class="sheet"><div class="empty">${ico('i-check-sq')}<b>아직 평가가 없습니다</b><span>인터뷰가 끝나면 평가지 작성 요청이 자동 발송됩니다</span></div></div>`) +
    '</div>' +
    '<div>' +
    '<div class="sec-h"><h3>프로필</h3></div>' +
    '<div class="sheet" style="padding:16px 18px">' +
    '<div style="display:flex;gap:11px;align-items:center;margin-bottom:14px">' +
    `<span class="avatar lg br">${esc(c.nm.charAt(0))}</span>` +
    `<div><b style="font-size:14px">${esc(c.nm)}</b><div style="font-size:11.5px;color:var(--t3)">${esc(c.role)}</div></div></div>` +
    kv('경력', c.yr + '년') + kv('유입 경로', c.src) + kv('유입일', md(c.ap) + ' (' + daysSince(c.ap) + '일 전)') +
    kv('현재 단계', sg.nm + ' · ' + c.d + '일째') + kv('공고', p.title) +
    `<a class="btn" style="width:100%;justify-content:center;margin-top:12px" href="/p/${c.p}/board?c=${c.id}">` +
    `${ico('i-columns', 'ic-sm')}서랍에서 열기</a></div>` +
    docsBoxHTML(docs) +
    otherAppsHTML(c) +
    `<div class="sec-h" style="margin-top:20px"><h3>주고받은 기록</h3><span class="n">${mails.length}건</span>` +
    '<span class="hint">보낸 것도, 못 보낸 것도 남깁니다</span></div>' +
    (mails.length
      ? '<div class="sheet">' + mails.map(m =>
        comm(m.channel === 'slack' ? 'Slack' : '메일', m.subject || mailKindLabel(m.kind),
          mailAt(m.at), m.ok)).join('') + '</div>'
      : `<div class="sheet"><div class="empty">${ico('i-mail')}<b>아직 주고받은 메일이 없습니다</b>` +
        '<span>서랍의 메일 탭에서 보내면 여기에 그대로 쌓입니다</span></div></div>') +
    '</div>' +
    '</div></div>'
}

/* 이 사람의 다른 지원 이력. 병합이 끝난 것만 보여 준다(추측은 위 배너가 맡는다).
   과거 지원건을 지우지 않기 때문에 생기는 화면이다 — 지금 보고 있는 지원건과
   그 사람의 전체 기록은 다른 것이라서, 옆에 나란히 놓아 둔다. */
function otherAppsHTML(c: Candidate) {
  const os = otherApps(c)
  if (!os.length) return ''
  return `<div class="sec-h" style="margin-top:20px"><h3>다른 지원 내역</h3><span class="n">${os.length}건</span></div>` +
    '<div class="sheet"><div class="c-apps">' +
    os.map(x => {
      const st = stageById(x.p, x.st)
      const live = x.st !== 's0'
      return `<a class="c-app" href="/c/${x.id}">` +
        `<div class="c-app-m"><b>${esc(posById(x.p).title)}</b>` +
        `<span>${esc(md(x.ap))} 지원 · ${esc(x.src)}</span></div>` +
        (live
          ? `<span class="pill"><i class="dot"></i>${esc(st.nm)}</span>`
          : `<span class="pill bad">${esc(x.rj ? rejectDef(x.rj).l : '종료')}</span>`) +
        '</a>'
    }).join('') + '</div></div>'
}

/* ---------- 공고 목록 ---------- */
export function positionsHTML() {
  const rows = positions.map(p => {
    const cs = cands.filter(c => c.p === p.id)
    const act = cs.filter(c => !stageById(p.id, c.st).rail)
    const risk = act.filter(c => c.s === 'esc' || c.s === 'late').length
    const st = ({ open: ['ok', '오픈'], hold: ['warn', '홀드'], closed: ['', '마감'] } as Record<string, string[]>)[p.st]
    let bn = '—'
    if (stagesOf(p.id) && cs.length) {
      let bestNm = ''
      let bestAvg = 0
      stagesOf(p.id).filter(s => !s.rail).forEach(s => {
        const m = cs.filter(c => c.st === s.id)
        const avg = m.length ? m.reduce((a, c) => a + c.d, 0) / m.length : 0
        if (avg > bestAvg) { bestAvg = avg; bestNm = s.nm }
      })
      bn = bestAvg > 0 ? bestNm + ' ' + bestAvg.toFixed(1) + 'd' : '—'
    }
    return `<tr><td class="strong"><a href="/p/${p.id}/board">${esc(p.title)}</a>` +
      `<div style="font-size:11px;color:var(--t4);margin-top:2px">${esc(p.dept)} · ${esc(p.team)} · ${esc(p.emp)}` +
      ((p.openings ?? 1) > 1 ? ` · ${p.openings}명` : '') +
      (p.reqRef ? ` · ${esc(p.reqRef)}` : '') + '</div></td>' +
      `<td><span class="pill ${st[0]}"><i class="dot"></i>${st[1]}</span></td>` +
      `<td class="num">${act.length}</td>` +
      `<td>${risk ? `<span class="pill bad">${ico('i-alert', 'ic-sm')}${risk}</span>` : '<span style="color:var(--t4)">—</span>'}</td>` +
      `<td style="color:var(--t3);font-size:11.5px">${esc(bn)}</td>` +
      `<td class="num">${p.ttf}d</td>` +
      `<td style="color:var(--t2)">${esc(p.rec)}</td>` +
      `<td style="text-align:right"><a class="btn quiet" href="/p/${p.id}/setup">${ico('i-sliders', 'ic-sm')}설정</a></td></tr>`
  }).join('')
  return '<header class="top">' +
    `<div class="crumb">${ico('i-briefcase', 'ic-sm')}채용</div>` +
    `<div class="h-row"><h1>공고</h1><span class="pill">${positions.length}건</span>` +
    `<div class="spacer"><button class="btn">${ico('i-filter', 'ic-sm')}필터</button>` +
    `<a class="btn br" href="/positions/new">${ico('i-plus', 'ic-sm')}공고 생성</a></div></div>` +
    /* 건수는 세어서 쓴다 — 공고를 새로 열면 바로 반영돼야 한다. */
    `<div class="meta"><i>${ico('i-check-circle', 'ic-sm')}오픈 <b>${positions.filter(p => p.st === 'open').length}</b></i>` +
    `<i>${ico('i-clock', 'ic-sm')}홀드 <b>${positions.filter(p => p.st === 'hold').length}</b></i>` +
    `<i>${ico('i-flag', 'ic-sm')}마감 <b>${positions.filter(p => p.st === 'closed').length}</b></i></div>` +
    '</header>' +
    '<div class="stage"><div class="sheet"><table class="tb"><thead><tr>' +
    '<th>공고</th><th>상태</th><th class="num">진행</th><th>대응 필요</th><th>병목 단계</th>' +
    `<th class="num">경과</th><th>리크루터</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` +
    note(['공고 목록은 <b>대응이 필요한 건수</b>와 <b>병목 단계</b>를 먼저 보여준다. 리크루터가 어느 공고부터 열지 여기서 결정한다.']) +
    '</div>'
}

/* ---------- 후보자 목록 ---------- */
export function candidatesHTML() {
  const rows = cands.slice().sort(byRisk).map(c => {
    const sg = stageById(c.p, c.st)
    return `<tr><td class="strong"><a href="/c/${c.id}">${esc(c.nm)}</a>` +
      `<div style="font-size:11px;color:var(--t4);margin-top:2px">${esc(c.role)} · ${c.yr}년차</div></td>` +
      `<td style="color:var(--t3)">${esc(posById(c.p).title)}</td>` +
      `<td><span class="pill" style="background:${sg.color}1a;color:${sg.color}"><i class="dot"></i>${esc(sg.nm)}</span></td>` +
      `<td><span class="qr s-${c.s}" style="padding:0;border:0;display:inline-flex"><i class="dot"></i></span>` +
      `<span style="margin-left:7px;color:var(--t2)">${LABEL[c.s]}</span></td>` +
      `<td class="num">${md(c.ap)}</td><td class="num">${c.d}d</td>` +
      `<td style="color:var(--t3)">${esc(c.src)}</td></tr>`
  }).join('')
  return '<header class="top">' +
    `<div class="crumb">${ico('i-users', 'ic-sm')}채용</div>` +
    `<div class="h-row"><h1>후보자</h1><span class="pill">${cands.length}명</span>` +
    `<div class="spacer"><button class="btn">${ico('i-search', 'ic-sm')}검색</button>` +
    `<button class="btn">${ico('i-users', 'ic-sm')}중복 병합</button>` +
    `<button class="btn">${ico('i-download', 'ic-sm')}내보내기</button></div></div>` +
    `<div class="meta"><i>${ico('i-alert', 'ic-sm')}대응 필요 <b>${cands.filter(c => c.s === 'esc' || c.s === 'late').length}명</b></i>` +
    `<i>${ico('i-check-circle', 'ic-sm')}인재풀 이관 <b>4명</b></i></div></header>` +
    '<div class="stage"><div class="sheet"><table class="tb"><thead><tr><th>후보자</th><th>공고</th>' +
    '<th>단계</th><th>조율 상태</th><th class="num">유입일</th><th class="num">체류</th><th>출처</th>' +
    `</tr></thead><tbody>${rows}</tbody></table></div>` +
    note(['기본 정렬은 <b>위험도 순</b>이다. 목록을 열면 손봐야 할 사람이 위에 있다.']) + '</div>'
}

/* ---------- 대시보드 ---------- */
export function dashboardHTML() {
  /* 숫자는 전부 후보자·공고 데이터에서 계산한다(data.ts 의 집계 함수). */
  const dwell = dwellRows()
  const funnel = funnelRows()
  const sources = sourceRows()
  const k = kpis()
  const maxD = Math.max(...dwell.map(d => d.v), 1)
  /* 전형 종료 사유 — '우리가 거절'과 '후보자가 이탈'을 절대 한 통에 담지 않는다.
     둘을 합치면 우리 채용 기준 문제인지, 우리가 후보자를 놓치고 있는지 구분이 사라진다. */
  const rj = rejectRows()
  const rjMax = Math.max(...rj.items.map(x => x.n), 1)
  const rjPct = (n: number) => rj.total ? Math.round(n / rj.total * 100) : 0
  const rjSide = (side: 'us' | 'them', color: string) => {
    const items = rj.items.filter(x => x.def.side === side)
    if (!items.length) return `<p class="hint" style="margin:0">해당 없음</p>`
    return '<div class="funnel rj">' + items.map(x =>
      `<div class="fn"><span class="fl">${esc(x.def.l)}</span>` +
      `<span class="ft"><i class="ff" style="width:${Math.round(x.n / rjMax * 100)}%;background:${color}"></i></span>` +
      `<span class="fv">${x.n}명 <small>(${rjPct(x.n)}%)</small></span></div>`).join('') + '</div>'
  }
  return '<header class="top">' +
    `<div class="crumb">${ico('i-chart', 'ic-sm')}운영</div>` +
    '<div class="h-row"><h1>대시보드</h1>' +
    '<div class="spacer"><div class="seg"><button>30일</button><button class="on">90일</button><button>연간</button></div>' +
    `<button class="btn">${ico('i-download', 'ic-sm')}내보내기</button></div></div>` +
    `<div class="meta"><i>${ico('i-shield', 'ic-sm')}접근 범위 <b>리크루터 — 담당 포지션만</b></i></div></header>` +
    '<div class="stage">' +
    '<div class="grid g4">' +
    kpi('i-user', '진행 중 후보자', String(k.live), '명', `누적 지원 ${cands.length}명`, '') +
    kpi('i-clock', '평균 Time-to-Fill', String(k.avgTtf), '일', '진행 중 공고 기준', '') +
    kpi('i-calendar', 'Time-to-Hire', k.ttHire === null ? '—' : String(k.ttHire), '일',
      `입사 확정 ${k.hires}명 기준`, '') +
    kpi('i-video', '자동 진행 비율', String(k.autoPct), '%', `사람 손 필요 ${k.stuck}건`,
      k.autoPct >= 70 ? 'up' : '') +
    '</div>' +
    '<div class="grid g2" style="margin-top:12px">' +
    '<div class="sheet" style="padding:16px 18px"><div class="sec-h"><h3>퍼널 전환율</h3></div>' +
    '<div class="funnel">' + funnel.map(f =>
      `<div class="fn"><span class="fl">${esc(f.l)}</span>` +
      `<span class="ft"><i class="ff" style="width:${f.r}%"></i></span>` +
      `<span class="fv">${f.n}→${f.d} <small>(${f.r}%)</small></span></div>`).join('') + '</div></div>' +
    '<div class="sheet" style="padding:16px 18px"><div class="sec-h"><h3>단계별 평균 체류일</h3>' +
    `<span class="hint">${esc(k.bottleneck)}가 병목</span></div>` +
    '<div class="bars">' + dwell.map(d =>
      `<div class="b${d.hot ? ' hot' : ''}"><b>${d.v}d</b>` +
      `<i style="height:${(d.v / maxD * 88)}%"></i><span>${esc(d.l)}</span></div>`).join('') + '</div>' +
    `<p class="hint" style="margin:10px 0 0">지금 각 단계에 머물러 있는 후보자의 평균 대기일입니다.</p></div>` +
    '</div>' +
    '<div class="grid g2" style="margin-top:12px">' +
    '<div class="sheet"><div class="sec-h" style="padding:16px 18px 0"><h3>출처별 효율</h3></div>' +
    '<table class="tb"><thead><tr><th>출처</th><th class="num">지원</th><th class="num">최종 합격</th>' +
    '<th class="num">합격률</th><th class="num">TtH</th></tr></thead><tbody>' +
    sources.map(s => `<tr><td class="strong">${esc(s.s)}</td><td class="num">${s.ap}</td><td class="num">${s.hire}</td>` +
      `<td class="num"${s.rate > 15 ? ' style="color:var(--done);font-weight:600"' : ''}>${s.rate}%</td>` +
      `<td class="num">${s.ttH === null ? '—' : s.ttH + 'd'}</td></tr>`).join('') +
    '</tbody></table></div>' +
    '<div class="sheet"><div class="sec-h" style="padding:16px 18px 0"><h3>면접관별 평균 응답 시간</h3></div>' +
    '<table class="tb"><thead><tr><th>면접관</th><th>조율 방식</th><th class="num">평균 응답</th></tr></thead><tbody>' +
    /* 퇴사자는 이 표에 세우지 않는다 — '응답이 느린 면접관'으로 읽혀서
       엉뚱한 사람을 공고에서 빼는 판단으로 이어진다(T4). */
    people.filter(u => u.active !== false &&
      (u.roles.indexOf('인터뷰어') >= 0 || u.roles.indexOf('하이어링 매니저') >= 0)).map(u =>
      `<tr><td class="strong">${esc(u.nm)}</td>` +
      `<td>${u.ea ? '<span class="pill bad">EA</span>' : '<span style="color:var(--t3)">직접</span>'}</td>` +
      `<td class="num"${u.resp !== '—' && parseFloat(u.resp) > 8 ? ' style="color:var(--late);font-weight:600"' : ''}>${esc(u.resp)}</td></tr>`).join('') +
    '</tbody></table></div>' +
    '</div>' +
    '<div class="sheet" style="margin-top:12px;padding:16px 18px">' +
    '<div class="sec-h"><h3>전형 종료 사유</h3>' +
    `<span class="hint">종료 ${rj.total}명 — 우리가 거절 ${rj.us}명 · 후보자가 이탈 ${rj.them}명</span></div>` +
    '<div style="height:10px;display:flex;gap:2px;margin:2px 0 14px;' +
    'background:var(--sunken);border-radius:5px;overflow:hidden">' +
    `<i style="width:${rjPct(rj.us)}%;background:var(--idle)"></i>` +
    `<i style="width:${rjPct(rj.them)}%;background:var(--esc)"></i></div>` +
    '<div class="grid g2">' +
    `<div><div class="sec-h" style="margin-bottom:8px"><h3 style="font-size:12px">${esc(SIDE_LABEL.us)} <span style="color:var(--t3)">${rjPct(rj.us)}%</span></h3></div>` +
    rjSide('us', 'var(--idle)') + '</div>' +
    `<div><div class="sec-h" style="margin-bottom:8px"><h3 style="font-size:12px">${esc(SIDE_LABEL.them)} <span style="color:var(--esc)">${rjPct(rj.them)}%</span></h3></div>` +
    /* 막대는 한 톤 눕힌다 — 경고는 위의 분할 막대 하나로 충분하고,
       여기서 필요한 건 '어느 사유가 큰가'를 읽는 것이다. */
    rjSide('them', 'color-mix(in srgb, var(--esc) 62%, transparent)') + '</div>' +
    '</div>' +
    '<p class="hint" style="margin:12px 0 0">왼쪽이 늘면 <b>모수·소싱</b>의 문제, 오른쪽이 늘면 <b>속도·처우·경험</b>의 문제입니다.</p></div>' +
    note([
      '<b>자동 진행 비율</b>이 이 제품의 성과 지표다. 나머지는 어느 ATS에나 있다.',
      '<b>전형 종료 사유</b>를 우리 판단과 후보자 이탈로 갈라 놓아야, 같은 숫자를 보고 서로 다른 처방을 낼 수 있다.',
      '위 수치는 모두 <b>현재 후보자·공고 데이터에서 계산</b>한 값이다. 데이터가 바뀌면 즉시 따라 바뀐다.',
    ]) +
    '<p class="disclaimer">※ 담겨 있는 후보자·공고 자체가 기능 설명용 예시 데이터입니다.</p></div>'
}

/* ---------- Export ---------- */
export function exportHTML() {
  const total = exportCols.reduce((a, g) => a + g.n, 0)
  return '<header class="top">' +
    `<div class="crumb">${ico('i-download', 'ic-sm')}운영</div>` +
    `<div class="h-row"><h1>데이터 내보내기</h1><span class="pill">${total}개 컬럼</span>` +
    `<div class="spacer"><button class="btn br">${ico('i-download', 'ic-sm')}.xlsx 다운로드</button></div></div>` +
    `<div class="meta"><i>${ico('i-info', 'ic-sm')}1행 = 후보자 1명 × 포지션 1건. 모든 값은 <b>이벤트 발생 시점에 자동 기록</b>됩니다.</i></div></header>` +
    '<div class="stage"><div style="display:grid;grid-template-columns:320px minmax(0,1fr);gap:26px;align-items:start">' +
    '<div><div class="sec-h"><h3>필터</h3></div><div class="sheet" style="padding:16px 18px">' +
    field('기간', '<select class="sel"><option>최근 90일</option><option>최근 30일</option><option>전체</option></select>') +
    field('부문', '<select class="sel"><option>전체</option><option>플랫폼본부</option></select>') +
    field('포지션', '<select class="sel"><option>전체</option><option>백엔드 엔지니어 (시니어)</option></select>') +
    field('리크루터', '<select class="sel"><option>전체</option><option>정수민</option></select>') +
    field('최종 결과', '<select class="sel"><option>전체</option><option>입사</option><option>불합격</option></select>') +
    '</div></div>' +
    `<div><div class="sec-h"><h3>컬럼 구성</h3><span class="n">${total}개</span></div>` +
    '<div class="sheet"><table class="tb"><thead><tr><th>그룹</th><th class="num">컬럼</th><th>예시</th></tr></thead><tbody>' +
    exportCols.map(g => `<tr><td class="strong">${esc(g.g)}</td><td class="num">${g.n}</td>` +
      `<td class="mono" style="font-size:11px;color:var(--t3)">${esc(g.c)}</td></tr>`).join('') +
    '</tbody></table></div>' +
    note([
      '<code>candidate_profile_url</code>은 하이퍼링크로 렌더되어, 엑셀에서 바로 후보자 상세로 이동합니다.',
      '공고 설정에서 <b>단계를 추가하면 해당 타임스탬프 컬럼이 자동으로 늘어납니다</b>.',
    ]) + '</div>' +
    '</div></div>'
}

/* ---------- 설정 ---------- */
/* Google 연동 행 — 실제 연결 상태(googleStatus)를 반영한다.
   버튼은 서버 라우트로 가는 링크/폼(무채색, 상태만 색). */
function googleRow(r: (i: string, t: string, d: string, ctl: string) => string, g?: GoogleStatus): string {
  const state = g?.state ?? 'unconfigured'
  if (state === 'connected') {
    const who = g?.email ? esc(g.email) : '연결된 계정'
    const ctl =
      `<span class="pill ok">${ico('i-check-circle', 'ic-sm')}연결됨</span>` +
      `<form method="post" action="/api/google/disconnect" style="display:inline">` +
      `<button class="btn quiet" type="submit">연결 해제</button></form>`
    return r('i-calendar', 'Google Calendar', `${who} · 실시간 free-busy 조회`, ctl)
  }
  if (state === 'configured') {
    const ctl =
      `<span class="pill warn">연결 필요</span>` +
      `<a class="btn solid" href="/api/google/auth">${ico('i-link', 'ic-sm')}Google 연결</a>`
    return r('i-calendar', 'Google Calendar', 'OAuth 키 설정됨 · 계정 연결만 남음', ctl)
  }
  const ctl = `<span class="pill">미설정</span>`
  return r('i-calendar', 'Google Calendar', '.env.local 에 OAuth 키 입력 필요 (아래 안내)', ctl)
}

/* ?google= 결과 플래시 배너. */
function googleFlash(flash?: string): string {
  if (!flash) return ''
  const map: Record<string, [string, string]> = {
    connected: ['ok', 'Google Calendar 가 연결되었습니다. 이제 일정 조율이 실시간 free-busy 로 계산됩니다.'],
    disconnected: ['', 'Google Calendar 연결을 해제했습니다. 수동 가용성으로 되돌아갑니다.'],
    denied: ['warn', 'Google 동의가 취소되었습니다. 다시 시도해 주세요.'],
    failed: ['warn', '토큰 교환에 실패했습니다. 리디렉션 URI·키 설정을 확인해 주세요.'],
    nocode: ['warn', '인증 코드가 없어 연결하지 못했습니다.'],
    unconfigured: ['warn', 'OAuth 키(.env.local)가 없어 연결할 수 없습니다. 아래 안내를 따라 주세요.'],
  }
  const [tone, msg] = map[flash] || ['', flash]
  return `<div class="sheet" style="padding:11px 14px;margin-bottom:14px;display:flex;gap:9px;align-items:center${
    tone === 'ok' ? ';box-shadow:inset 0 0 0 1px var(--done-rim)' : tone === 'warn' ? ';box-shadow:inset 0 0 0 1px var(--esc-rim)' : ''
  }">${ico(tone === 'warn' ? 'i-alert' : 'i-check-circle', 'ic-sm')}<span style="font-size:12.5px;color:var(--t2)">${msg}</span></div>`
}

/* Google OAuth 설정 안내(미설정/설정 상태에서만 노출). */
function googleSetupNote(g?: GoogleStatus): string {
  if (g?.state === 'connected') return ''
  const step = (n: number, h: string, d: string) =>
    `<li><b>${n}. ${h}</b><div style="color:var(--t3);margin-top:2px">${d}</div></li>`
  return `<div class="note"><h4>${ico('i-info', 'ic-sm')}Google Calendar 연결 방법 (최초 1회)</h4><ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:9px;font-size:12.5px;line-height:1.55">` +
    step(1, 'Google Cloud 프로젝트 만들기', 'console.cloud.google.com 에서 프로젝트를 만들고 <b>Google Calendar API</b> 를 사용 설정합니다.') +
    step(2, 'OAuth 동의 화면 구성', '앱 이름·지원 이메일을 입력하고, 테스트 사용자에 회사 계정을 추가합니다.') +
    step(3, 'OAuth 클라이언트 ID 발급', '유형 <b>웹 애플리케이션</b> · 승인된 리디렉션 URI 에 <span class="mono">http://localhost:3000/api/google/callback</span> 을 등록합니다.') +
    step(4, '.env.local 에 키 입력', '<span class="mono">GOOGLE_CLIENT_ID</span> · <span class="mono">GOOGLE_CLIENT_SECRET</span> 를 채우고 서버를 재시작합니다. (예시: <span class="mono">.env.local.example</span>)') +
    step(5, '연결 버튼 누르기', '이 화면에 나타나는 <b>Google 연결</b> 버튼으로 계정을 승인하면 완료됩니다.') +
    '</ol><div style="margin-top:11px;padding-top:10px;border-top:1px solid var(--line);color:var(--t3);font-size:11.5px">' +
    '면접관별 캘린더 주소는 <span class="mono">GOOGLE_CALENDAR_MAP</span> (예: <span class="mono">{"u1":"lead@company.com"}</span>) 로 매핑합니다. 매핑이 없으면 수동 가용성으로 자동 폴백합니다.</div></div>'
}

/* 리마인드 실발송 상태 — 이메일(Resend)·Slack(웹훅) 각각의 연결 여부.
   테스트 수신 주소가 걸려 있으면 그 사실을 반드시 눈에 보이게 한다.
   (실수로 진짜 후보자에게 나가는 사고를 막는 안전장치이므로 숨기지 않는다) */
function mailerRows(r: (i: string, t: string, d: string, ctl: string) => string, m?: MailerStatus): string {
  const on = `<span class="pill ok">${ico('i-check-circle', 'ic-sm')}연결됨</span>`
  const off = '<span class="pill">미설정</span>'
  const email = r('i-mail', '리마인드 이메일',
    m?.email ? `Resend · 발신 ${esc(m.from ?? '')}` : 'RESEND_API_KEY 를 넣으면 실제로 발송됩니다',
    m?.email ? on : off)
  const slack = r('i-msg', '리마인드 Slack',
    m?.slack ? 'Incoming Webhook · 채널로 발송' : 'SLACK_WEBHOOK_URL 을 넣으면 실제로 발송됩니다',
    m?.slack ? on : off)
  const test = m?.testTo
    ? r('i-shield', '테스트 수신 주소',
      `모든 리마인드가 <span class="mono">${esc(m.testTo)}</span> 로만 갑니다 · 실제 후보자에게는 나가지 않습니다`,
      '<span class="pill warn">안전장치 켜짐</span>')
    : r('i-shield', '테스트 수신 주소',
      'REMINDER_TEST_TO 가 비어 있어 <b>실제 수신자에게 발송</b>됩니다',
      '<span class="pill bad">꺼짐</span>')
  return email + slack + test
}

export function settingsHTML(g?: GoogleStatus, flash?: string, m?: MailerStatus, core?: 'unconfigured' | 'configured') {
  const grp = (t: string, rows: string) => `<div class="grp"><div class="sec-h"><h3>${t}</h3></div><div class="sheet">${rows}</div></div>`
  const r = (i: string, t: string, d: string, ctl: string) =>
    `<div class="rule">${ico(i)}<div class="txt"><b>${t}</b><span>${d}</span></div><div class="ctl">${ctl}</div></div>`
  const sw = (on: boolean) => `<button class="sw${on ? ' on' : ''}"></button>`
  const rbacNames = ['코디네이터', '리크루터', '하이어링 매니저', '인터뷰어', 'HR Manager', '경영진']
  const rbacDesc = ['전 공고 조율 처리 · 수동 조율', '담당 공고 전체', '본인 부서 · 개인정보 제한', '배정된 면접 · 평가지만', '전체 조회 + 설정', '전사 집계 요약만']
  const rbacN = [2, 3, 5, 12, 1, 4]
  return '<header class="top">' +
    `<div class="crumb">${ico('i-sliders', 'ic-sm')}운영</div>` +
    '<div class="h-row"><h1>설정</h1></div>' +
    `<div class="meta"><i>${ico('i-users', 'ic-sm')}워크스페이스 <b>Example Inc.</b></i></div></header>` +
    '<div class="stage"><div style="max-width:780px">' +
    googleFlash(flash) +
    grp('L-5 연동',
      /* TalentCore 는 '받는 문'이다. Hire 쪽에서 누를 버튼이 없고,
         토큰이 있느냐 없느냐만 보여 준다(설정은 TalentCore 화면에서 한다). */
      r('i-link', 'TalentCore (HRIS)', '승인된 자리를 공고로 받아 옵니다',
        core === 'configured'
          ? `<span class="pill ok">${ico('i-check-circle', 'ic-sm')}받는 문 열림</span>`
          : '<span class="pill">미설정</span>') +
      googleRow(r, g) +
      r('i-msg', 'Slack', '면접관 슬롯 선택 버튼 · 알림', `<span class="pill ok">${ico('i-check-circle', 'ic-sm')}연결됨</span>`) +
      r('i-video', '화상 회의', 'Meet · Zoom · Teams 중 선택', '<select class="sel sm w-sm"><option>Google Meet</option><option>Zoom</option><option>Teams</option></select>') +
      r('i-mail', '발신 도메인', 'careers.example.com SPF/DKIM', '<span class="pill ok">인증 완료</span>') +
      r('i-msg', 'SMS', '후보자 동의 필수', '<span class="pill">미사용</span>' + sw(false))) +
    grp('리마인드 발송', mailerRows(r, m)) +
    grp('L-2 사용자 · 권한 (RBAC)',
      rbacNames.map((x, i) => r('i-shield', x, rbacDesc[i], `<span class="pill">${rbacN[i]}명</span><button class="btn quiet">${ico('i-sliders', 'ic-sm')}</button>`)).join('')) +
    grp('L-3 알림 템플릿',
      r('i-mail', '후보자 슬롯 안내', '한국어 기본 · 영어 병행', '<span class="pill">2개 언어</span><button class="btn quiet">편집</button>') +
      r('i-mail', '면접 확정 안내', '캘린더 인비 동시 발송', '<span class="pill">2개 언어</span><button class="btn quiet">편집</button>') +
      r('i-mail', '불합격 통보', '자동 발송하지 않음 · 초안만 생성', '<span class="pill warn">수동 발송</span><button class="btn quiet">편집</button>')) +
    grp('L-6 개인정보',
      r('i-shield', '보유 기간', '최종 결과일로부터', '<select class="sel sm w-sm"><option>2년</option><option>1년</option><option>3년</option></select>') +
      r('i-trash', '자동 파기 예약', '보유 기간 경과 시 자동 삭제', '<span class="pill ok">켜짐</span>' + sw(true)) +
      r('i-check-sq', '동의 이력', '수집·이용 동의 시점 기록', '<button class="btn quiet">보기</button>')) +
    grp('L-7 감사 로그',
      r('i-rows', '기록 범위', '알림 · 응답 · 에스컬레이션 · 수동 수정 전량', `<button class="btn quiet">${ico('i-download', 'ic-sm')}내보내기</button>`)) +
    googleSetupNote(g) +
    '</div></div>'
}

/* ---------- 내 할 일 ---------- */
function todoCard(i: string, t: string, s: string, d: string, stt: string, btn: string) {
  return `<div class="sheet" style="padding:18px 20px${stt === 'esc' ? ';box-shadow:inset 0 0 0 1px var(--esc-rim), var(--sh-1)' : ''}">` +
    `<div style="display:flex;align-items:center;gap:8px">${ico(i)}` +
    `<b style="font-size:14px;letter-spacing:-.02em">${t}</b>` +
    `<span class="pill ${stt === 'esc' ? 'bad' : 'warn'}" style="margin-left:auto">${stt === 'esc' ? '지연' : '대기'}</span></div>` +
    `<div style="font-size:12.5px;color:var(--t2);margin-top:8px">${s}</div>` +
    `<div style="font-size:11.5px;color:var(--t4);margin-top:2px">${d}</div>` +
    `${btn}</div>`
}
/* 한 사람의 '지금 나에게 걸려 있는 일'.
   출처는 전부 실제 데이터다 — 오퍼 승인 체인, 미제출 평가지, 참석자 미지정
   미팅, 사람 손이 필요한 후보자. 역할에 따라 나오는 종류가 달라진다. */
interface Todo {
  ico: string; t: string; sub: string; d: string
  tone: 'esc' | 'late'; href: string; cta: string; ord: number
}

export function todoFor(p: Person): Todo[] {
  const out: Todo[] = []
  const isRec = p.roles.indexOf('리크루터') >= 0
  const mine = (pid: string) => {
    const pos = posById(pid)
    return pos.rec === p.nm || pos.hm === p.nm
  }

  /* 1. 오퍼 승인 — 순차라서 '지금 차례'인 사람에게만 뜬다. */
  for (const o of offerList()) {
    if (o.st !== 'approval' || isHeld(o)) continue
    const cur = currentApprover(o)
    if (!cur || cur.uid !== p.id) continue
    const c = cands.find(x => x.id === o.cid)
    if (!c) continue
    const age = daysSince(o.createdAt)
    out.push({
      ico: 'i-flag', t: '오퍼 승인',
      sub: `${c.nm} · ${posById(c.p).title}`,
      d: `${won(o.base)}${overBand(o) ? ' · 밴드 초과' : ''} · 올라온 지 ${age}일`,
      tone: age >= 5 ? 'esc' : 'late', href: `/o/${o.cid}`, cta: '오퍼 열기', ord: age,
    })
  }

  /* 2. 평가지 미제출 — 내가 면접관으로 배정된 단계인데 아직 안 낸 것. */
  for (const c of cands) {
    const pos = posById(c.p)
    if (pos.st !== 'open') continue
    const st = stageById(c.p, c.st)
    if (!isGradable(st.kind) || st.ivs.indexOf(p.id) < 0) continue
    /* 서류 검토 단계는 아래 '서류 검토' 카드가 통째로 맡는다. 여기서 한 번 더
       띄우면 같은 사람이 할 일 목록에 두 번 뜬다 — 목록이 길어지는 만큼
       진짜 급한 것이 묻힌다. */
    if (st.kind === 'screen') continue
    if ((evals[c.id] || []).some(e => e.uid === p.id)) continue
    out.push({
      ico: 'i-check-sq', t: '평가지 작성',
      sub: `${c.nm} · ${st.nm}`,
      d: `${pos.title} · 이 단계 ${c.d}일째${c.d > st.sla ? ` (기준 ${st.sla}일 초과)` : ''}`,
      tone: c.d > st.sla ? 'esc' : 'late',
      href: `/iv/${c.id}/${p.id}`, cta: '평가지 열기', ord: c.d,
    })
  }

  /* 3. 참석자 미지정 미팅 — 내가 담당(리크루터·HM)인 공고만.
        '저장된 상태가 미지정'이 아니라 '지금 계산해도 미지정'인 것만 올린다 —
        트리거가 아직 안 온 미팅을 할 일로 띄우면 아무도 못 지운다. */
  for (const pos of positions) {
    if (!mine(pos.id)) continue
    for (const v of mtgViews(pos.id)) {
      if (v.phase !== 'attendees') continue
      out.push({
        ico: 'i-users', t: `${v.nm} 참석자 지정`,
        sub: pos.title, d: v.v, tone: v.s === 'esc' ? 'esc' : 'late',
        href: `/p/${pos.id}/board`, cta: '공고 열기', ord: 99,
      })
    }
  }

  /* 4. 서류 검토 — 사람 수만큼 카드를 만들지 않는다. 서류는 '한 건'이 아니라
        '쌓인 줄'이고, 처리도 전용 화면에서 한 번에 하기 때문이다. 카드는 하나,
        누르면 그 줄로 들어간다. */
  {
    const q = reviewQueue(p)
    if (q.length) {
      const over = q.filter(x => x.over).length
      out.push({
        ico: 'i-eye-off', t: '서류 검토',
        sub: `${q.length}명 대기${over ? ` · 기준 초과 ${over}명` : ''}`,
        d: q.length === 1
          ? `${q[0].nm} · ${q[0].pos}`
          : `${q[0].nm} 외 ${q.length - 1}명 · 가장 오래 기다린 사람 ${q[0].d}일째`,
        tone: over ? 'esc' : 'late',
        href: `/review?u=${p.id}`, cta: '검토 시작', ord: q[0].d,
      })
    }
  }

  /* 4. 리크루터만 — 자동화가 멈추고 사람을 기다리는 후보자. */
  if (isRec) {
    for (const c of cands.filter(x => x.s === 'esc' && posById(x.p).rec === p.nm)) {
      out.push({
        ico: 'i-alert', t: '자동화 멈춤',
        sub: `${c.nm} · ${stageById(c.p, c.st).nm}`,
        d: c.why || '사람 확인이 필요합니다', tone: 'esc',
        href: `/c/${c.id}`, cta: '후보자 열기', ord: c.d,
      })
    }
    /* 승인이 끝났는데 아직 안 나간 오퍼 — 여기서 하루가 그냥 샌다. */
    for (const o of offerList()) {
      if (!canSend(o)) continue
      const c = cands.find(x => x.id === o.cid)
      if (!c || posById(c.p).rec !== p.nm) continue
      out.push({
        ico: 'i-mail', t: '오퍼 발송',
        sub: `${c.nm} · ${posById(c.p).title}`,
        d: '승인이 모두 끝났습니다 — 보내기만 하면 됩니다', tone: 'late',
        href: `/o/${o.cid}`, cta: '발송하기', ord: 50,
      })
    }
  }

  const rank = (x: Todo) => (x.tone === 'esc' ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b) || b.ord - a.ord)
}

export function todoHTML(uid?: string) {
  const who = people.find(x => x.id === uid)
    ?? people.find(x => x.nm === me.name)
    ?? people[0]
  const list = todoFor(who)
  const esced = list.filter(x => x.tone === 'esc').length

  /* 로그인이 없는 프로토타입이라, '누구 화면인지'를 직접 고르게 한다.
     할 일이 있는 사람만 칩으로 띄운다 — 빈 사람을 늘어놓을 이유가 없다. */
  const others = people
    .map(p => ({ p, n: todoFor(p).length }))
    .filter(x => x.n > 0 || x.p.id === who.id)
  const picker = '<div class="chips" style="margin:0 0 14px;gap:6px">' +
    others.map(x =>
      `<a class="chip${x.p.id === who.id ? ' on' : ''}" href="/todo?u=${x.p.id}">` +
      `${esc(x.p.nm)} <b>${x.n}</b></a>`).join('') + '</div>'

  const cards = list.map(x =>
    todoCard(x.ico, x.t, esc(x.sub), esc(x.d), x.tone,
      `<a class="btn solid" style="width:100%;justify-content:center;margin-top:14px" href="${x.href}">${esc(x.cta)}</a>`)).join('')

  const body = list.length
    ? `<div class="grid g2" style="max-width:760px">${cards}</div>`
    : '<div class="zero" style="max-width:760px">' +
      `${ico('i-check-circle', 'ic-lg')}<h3 style="margin:8px 0 4px">${esc(who.nm)} 님에게 걸린 일이 없습니다</h3>` +
      '<div style="font-size:12px">비어 있는 게 정상입니다 — 억지로 채우지 않습니다.</div></div>'

  return '<header class="top">' +
    `<div class="crumb">${ico('i-check-sq', 'ic-sm')}내 화면</div>` +
    `<div class="h-row"><h1>내 할 일</h1>` +
    `<span class="pill${esced ? ' bad' : ''}">${list.length}건</span>` +
    (esced ? `<span class="pill bad">지연 ${esced}건</span>` : '') + '</div>' +
    `<div class="meta"><i>${ico('i-user', 'ic-sm')}<b>${esc(who.nm)}</b> · ${esc(who.tt)}</i>` +
    `<i>${esc(who.roles.join(' · '))}</i></div></header>` +
    `<div class="stage">${picker}${body}` +
    note([
      '이 화면은 <b>역할에 따라 다른 것</b>이 뜹니다. 승인 차례가 온 사람에게만 오퍼 승인이 보이고, 면접관에게는 자기 평가지만 보입니다.',
      '오퍼 승인은 <b>순서대로</b>라, 같은 오퍼가 두 사람의 할 일에 동시에 뜨지 않습니다.',
      '할 일이 없으면 빈 상태가 정상입니다. 억지로 채우지 않습니다.',
    ]) + '</div>'
}

/* ---------- 평가 ----------
   척도·항목·판정 규칙은 lib/scorecard.ts 한 곳에만 둔다.
   여기서는 '누가 아직 안 냈는가'와 '의견이 갈렸는가' 두 가지만 보여준다. */
const nameOf = (uid: string) => (people.find(u => u.id === uid) || { nm: uid }).nm

const rateChip = (v: string) => {
  const d = ratingDef(v as never)
  return `<span class="pill ${isPositive(d.v) ? 'ok' : 'bad'}" title="${esc(d.short)}">${esc(d.l)}</span>`
}

/** 이 후보자의 현재 단계에 배정된 면접관 중 아직 제출 안 한 사람. */
function pendingIvs(c: Candidate): string[] {
  const done = new Set((evals[c.id] || []).map(e => e.uid))
  return stageById(c.p, c.st).ivs.filter(u => !done.has(u))
}

/* ---------- 평가 비교(한 후보자) ---------- */
export function evalCompareHTML(cid: string) {
  const c = cands.find(x => x.id === cid)
  if (!c) return notFoundHTML()
  const list = evals[cid] || []
  const stage = stageById(c.p, c.st)
  const pend = pendingIvs(c)
  const vd = verdictOf(list)

  /* 항목 축 = 제출된 평가에 실제로 등장한 항목들의 합집합.
     (기본 항목이 바뀌어도 과거 평가가 깨지지 않도록) */
  const axis = [...new Set(list.flatMap(e => e.items.map(([l]) => l)))]
  const cell = (e: typeof list[number], label: string) => {
    const hit = e.items.find(([l]) => l === label)
    return hit ? rateChip(hit[1]) : '<span style="color:var(--t4)">—</span>'
  }

  const matrix = list.length
    ? '<div class="sheet"><div class="sec-h" style="padding:16px 18px 0"><h3>항목별 비교</h3></div>' +
      '<table class="tb"><thead><tr><th>항목</th>' +
      list.map(e => `<th>${esc(e.iv)}<br><small style="color:var(--t4);font-weight:400">${esc(e.role)}</small></th>`).join('') +
      '</tr></thead><tbody>' +
      axis.map(l => `<tr><td class="strong">${esc(l)}</td>` +
        list.map(e => `<td>${cell(e, l)}</td>`).join('') + '</tr>').join('') +
      '<tr style="border-top:2px solid var(--line)"><td class="strong">종합 의견</td>' +
      list.map(e => `<td>${rateChip(e.overall)}</td>`).join('') + '</tr>' +
      '</tbody></table></div>'
    : '<div class="sheet" style="padding:28px 18px;text-align:center;color:var(--t4)">' +
      '아직 제출된 평가가 없습니다.</div>'

  const memos = list.map(e =>
    `<div style="padding:14px 18px;border-top:1px solid var(--line)">` +
    `<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">` +
    `<b style="font-size:12.5px">${esc(e.iv)}</b>` +
    `<span style="color:var(--t4);font-size:11px">${esc(e.role)} · ${esc(e.at)}</span>` +
    `<span class="spacer"></span>${rateChip(e.overall)}</div>` +
    `<p style="font-size:12.5px;color:var(--t2);line-height:1.6;margin:0">${esc(e.memo) || '<span style="color:var(--t4)">메모 없음</span>'}</p></div>`).join('')

  const dist = tally(list).map(t =>
    `<span class="pill ${isPositive(t.def.v) ? 'ok' : 'bad'}">${esc(t.def.l)} ${t.n}</span>`).join(' ')

  /* 평가를 읽고 끝나면 아무 일도 일어나지 않는다 — 이 화면의 끝은 항상 '판정'으로 이어져야 한다.
     단, 이미 종료·입사 확정된 후보자에게는 판정할 것이 없다. */
  const ended = c.st === 's0' || stage.kind === 'hired'
  const judgeBar = ended ? '' :
    '<div class="sheet" style="margin-top:12px;padding:14px 18px;display:flex;align-items:center;gap:14px">' +
    '<div><b style="font-size:12.5px">' +
    (pend.length
      ? `아직 ${pend.length}명이 평가를 내지 않았습니다`
      : list.length ? '평가가 모두 모였습니다' : '아직 제출된 평가가 없습니다') +
    '</b><p class="hint" style="margin:3px 0 0">' +
    (list.length
      ? `${esc(stage.nm)} 통과 여부를 정하면 후보자가 다음 단계로 넘어갑니다. 불합격이면 사유와 통보 메일 초안까지 함께 만듭니다.`
      : '평가 없이도 판정할 수 있지만, 남는 근거가 없습니다.') +
    '</p></div><span class="spacer"></span>' +
    `<a class="btn solid" href="/c/${c.id}">${ico('i-check-circle', 'ic-sm')}판정하기</a></div>`

  return '<header class="top">' +
    `<div class="h-row"><h1>${esc(c.nm)}</h1>` +
    `<span class="pill">${esc(stage.nm)}</span>` +
    (vd === 'none' ? '' : `<span class="pill ${vd === 'pass' ? 'ok' : 'bad'}">${esc(VERDICT_LABEL[vd])}</span>`) +
    `<div class="spacer"><a class="btn" href="/c/${c.id}">후보자 상세</a></div></div>` +
    `<div class="meta"><i>${ico('i-user', 'ic-sm')}${esc(posById(c.p).title)}</i>` +
    (dist ? `<i>${dist}</i>` : '') +
    (pend.length ? `<i style="color:var(--esc)">미제출 ${esc(pend.map(nameOf).join(', '))}</i>` : '') +
    '</div></header>' +
    '<div class="stage">' + matrix +
    (list.length ? '<div class="sheet" style="margin-top:12px"><div class="sec-h" style="padding:16px 18px 0"><h3>면접관 메모</h3></div>' + memos + '</div>' : '') +
    judgeBar +
    note([
      '이 화면은 <b>제출이 끝난 뒤에만</b> 의미가 있습니다. 면접관 본인은 자기 평가를 내기 전까지 남의 점수를 못 봅니다.',
      '평가는 면접관에게 보낸 <b>개인 링크</b>에서 작성합니다 — 별도 계정·로그인이 없습니다.',
      '평가는 <b>판정으로 이어질 때만</b> 값이 있습니다. 읽고 끝나면 후보자는 그 자리에 그대로 서 있습니다.',
    ]) + '</div>'
}

/* ---------- 오퍼 ----------
   상태·승인·거절사유 규칙은 lib/offer.ts 한 곳에만 둔다.
   여기서는 '지금 누가 공을 쥐고 있는가'와 '무엇 때문에 지는가' 두 가지를 보여준다. */

const stTone = (v: OfferState) => {
  const t = offerStateDef(v).tone
  return t === 'done' ? 'ok' : t === 'esc' ? 'bad' : t === 'late' ? 'warn' : ''
}
const stPill = (v: OfferState) =>
  `<span class="pill ${stTone(v)}">${esc(offerStateDef(v).l)}</span>`

/** 지금 이 오퍼가 누구에게 걸려 있는가 — 목록에서 제일 중요한 한 칸. */
function ballWith(o: Offer): string {
  if (o.st === 'draft') return '<span style="color:var(--t3)">리크루터 (작성 중)</span>'
  if (o.st === 'approval') {
    if (isHeld(o)) {
      const h = o.chain.find(a => a.s === 'hold')!
      return `<span style="color:var(--esc)">보류 · ${esc(h.nm)}</span>`
    }
    const cur = currentApprover(o)
    return cur
      ? `<b style="font-weight:600">${esc(cur.nm)}</b><br><small style="color:var(--t4)">${esc(cur.role)}</small>`
      : '<span style="color:var(--done)">승인 완료 · 발송 대기</span>'
  }
  if (o.st === 'sent') return '<span style="color:var(--t3)">후보자 응답 대기</span>'
  return '<span style="color:var(--t4)">—</span>'
}

/* ---------- 오퍼 상세(한 건) ----------
   이 화면은 가운데에 '실제로 누르는 패널'(OfferClient)이 끼어든다.
   그래서 정적 부분을 위(head) / 아래(foot) 두 조각으로 나눠 준다. */
export function offerHeadHTML(cid: string) {
  const o = offerOf(cid)
  const c = cands.find(x => x.id === cid)
  if (!o || !c) return notFoundHTML()
  const pos = posById(c.p)
  const pct = bandPct(o)
  const over = overBand(o)

  /* 처우 — 밴드 안 어디쯤인지를 막대로. 색은 초과(상태)일 때만 쓴다. */
  const bandBar =
    '<div style="margin-top:10px">' +
    `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--t4);margin-bottom:4px">` +
    `<span class="mono">${esc(won(o.band[0]))}</span><span>밴드</span><span class="mono">${esc(won(o.band[1]))}</span></div>` +
    '<div style="height:6px;border-radius:4px;background:var(--sunken);position:relative;overflow:hidden">' +
    `<div style="position:absolute;left:0;top:0;bottom:0;width:${Math.min(pct, 100)}%;` +
    `background:${over ? 'var(--esc)' : 'var(--t3)'}"></div></div>` +
    `<div style="font-size:11.5px;margin-top:6px;color:${over ? 'var(--esc)' : 'var(--t3)'}">` +
    (over
      ? `밴드 상한을 <b>${esc(won(o.base - o.band[1]))}</b> 초과 — 본부 승인이 추가로 필요합니다`
      : `밴드 내 ${pct}% 지점`) + '</div></div>'

  const comp = '<div class="sheet"><div class="sec-h" style="padding:16px 18px 0"><h3>처우</h3>' +
    stPill(o.st) + '</div><div style="padding:12px 18px 18px">' +
    kv('직급', o.level) +
    kv('기본 연봉', won(o.base)) +
    (o.sign ? kv('사이닝', won(o.sign)) : '') +
    (o.sign ? kv('총 보상', `${won(totalComp(o))} (첫해)`) : '') +
    kv('입사 예정', o.start ? o.start : '미정') +
    bandBar + '</div></div>'

  /* 승인 체인 — 순차라는 걸 세로 목록으로 그대로 보여준다. */
  const chain = '<div class="sheet" style="margin-top:12px">' +
    '<div class="sec-h" style="padding:16px 18px 0"><h3>승인</h3>' +
    `<small style="color:var(--t4)">${esc(chainLabel(o))}</small></div>` +
    o.chain.map((a, i) => {
      const tone = a.s === 'ok' ? 'var(--done)' : a.s === 'hold' ? 'var(--esc)' : 'var(--idle)'
      const lbl = a.s === 'ok' ? '승인' : a.s === 'hold' ? '보류' : (o.st === 'approval' && currentApprover(o)?.uid === a.uid ? '대기 중' : '차례 아님')
      return `<div style="display:flex;gap:10px;align-items:flex-start;padding:12px 18px;border-top:1px solid var(--line)">` +
        `<div style="width:7px;height:7px;border-radius:50%;background:${tone};margin-top:5px;flex:none"></div>` +
        `<div style="flex:1;min-width:0"><b style="font-size:12.5px">${i + 1}. ${esc(a.nm)}</b>` +
        `<div style="font-size:11.5px;color:var(--t3);margin-top:1px">${esc(a.role)}</div>` +
        (a.memo ? `<div style="font-size:11.5px;color:var(--esc);margin-top:5px">보류 사유 — ${esc(a.memo)}</div>` : '') +
        '</div>' +
        `<div style="text-align:right;flex:none"><span style="font-size:11.5px;color:${tone};font-weight:600">${esc(lbl)}</span>` +
        (a.at ? `<div class="mono" style="font-size:10.5px;color:var(--t4)">${esc(a.at)}</div>` : '') +
        '</div></div>'
    }).join('') + '</div>'

  /* 진행 기록 — 언제 만들고 언제 나갔고 언제 답이 왔는지. */
  const tl = [
    ['작성', o.createdAt],
    ['발송', o.sentAt],
    [o.st === 'declined' ? '거절' : '수락', o.respAt],
  ].filter(([, d]) => !!d) as [string, string][]

  const history = '<div class="sheet" style="margin-top:12px">' +
    '<div class="sec-h" style="padding:16px 18px 0"><h3>진행</h3></div>' +
    '<div style="padding:8px 18px 16px">' +
    tl.map(([l, d]) => kv(l, `${d} (${daysSince(d)}일 전)`)).join('') +
    (o.sentAt && o.respAt
      ? kv('응답까지', `${daysSince(o.sentAt) - daysSince(o.respAt)}일`)
      : o.sentAt ? kv('응답 대기', `${daysSince(o.sentAt)}일째`) : '') +
    '</div></div>'

  const declined = o.st === 'declined' && o.declineCode
    ? '<div class="sheet" style="margin-top:12px;box-shadow:inset 0 0 0 1px var(--esc-rim), var(--sh-1)">' +
      '<div class="sec-h" style="padding:16px 18px 0"><h3>거절 사유</h3>' +
      `<span class="pill bad">${esc(declineDef(o.declineCode).l)}</span></div>` +
      `<div style="padding:10px 18px 18px"><div style="font-size:11.5px;color:var(--t3)">${esc(declineDef(o.declineCode).d)}</div>` +
      (o.declineMemo ? `<p style="font-size:12.5px;color:var(--t2);line-height:1.6;margin:10px 0 0">${esc(o.declineMemo)}</p>` : '') +
      '</div></div>'
    : ''

  /* 승인이 다 끝나도 상태값은 아직 approval 이다(발송해야 sent 가 된다).
     그대로 '승인 대기'라고 적으면 누군가를 더 기다려야 하는 것처럼 보여,
     발송 버튼이 바로 아래 있는데도 멈췄다. 목록 화면과 같은 말을 하게 둔다. */
  const sendable = canSend(o)

  return '<header class="top">' +
    `<div class="h-row"><h1>${esc(c.nm)}</h1>${sendable ? '<span class="pill">발송 대기</span>' : stPill(o.st)}` +
    (over ? '<span class="pill bad">밴드 초과</span>' : '') +
    `<div class="spacer"><a class="btn" href="/c/${c.id}">후보자 상세</a></div></div>` +
    `<div class="meta"><i>${ico('i-user', 'ic-sm')}${esc(pos.title)}</i>` +
    `<i>${esc(sendable ? '내부 승인은 끝났습니다 — 보내기만 하면 됩니다' : offerStateDef(o.st).d)}</i></div></header>` +
    `<div class="stage" style="padding-bottom:0"><div class="grid g2" style="max-width:900px;align-items:start">` +
    `<div>${comp}${declined}</div><div>${chain}${history}</div></div></div>`
}

/** 상세 화면 아래쪽 설명 — 액션 패널 뒤에 붙는다. */
export function offerFootHTML(cid: string) {
  if (!offerOf(cid)) return ''
  return '<div class="stage" style="padding-top:0">' +
    note([
      '금액은 <b>초안일 때만</b> 고칠 수 있습니다. 승인이 시작된 뒤 금액이 바뀌면 앞서 승인한 사람의 결재가 무의미해지기 때문입니다.',
      '승인 버튼은 <b>지금 차례인 사람에게만</b> 열립니다. 보류하면 사유를 남겨야 하고, 체인 전체가 멈춥니다.',
      '수락·거절을 기록하면 보드의 후보자 카드도 <b>같이 이동</b>합니다 — 두 화면이 서로 다른 말을 하지 않게.',
    ]) + '</div>'
}

/* ---------- 조율 처리함 ---------- */
export function inboxHTML(open: Record<string, boolean> = {}) {
  const items = inboxAll()
  const escd = items.filter(i => i.s === 'esc')
  const late = items.filter(i => i.s === 'late')
  /* 보류·종료된 공고의 후보자는 자동화가 돌지 않는다.
     "AI 진행 중"에 섞으면 거짓말이 되므로 따로 뺀다. */
  const paused = (c: Candidate) => posById(c.p).st !== 'open'
  // esc·late 는 위 "지금/곧 처리"에 이미 있으므로 여기서 다시 세지 않는다.
  const held = cands.filter(c => paused(c) && c.s !== 'esc' && c.s !== 'late')
  const idle = cands.filter(c => c.s === 'idle' && !paused(c))
  const done = cands.filter(c => c.s === 'done' && !paused(c))

  const row = (i: (typeof items)[number]) =>
    `<div class="qr s-${i.s}"><i class="dot"></i>` +
    `<span class="nm">${esc(i.nm)}</span>` +
    `<span class="st">${ico(i.k === 'mtg' ? 'i-video' : 'i-user')}${esc(i.st)}</span>` +
    `<span class="pos">${esc(i.pos)}</span>` +
    `<span class="age">${esc(i.ag)}</span>` +
    `<span class="why">${esc(i.why)}</span>` +
    '<span class="btns">' +
    (i.act ? i.act.map((a, n) => `<button class="btn${n === 0 ? ' solid' : ''}">${esc(a)}</button>`).join('') : '<button class="btn">처리</button>') +
    '<button class="btn quiet">보류</button></span></div>'
  const crow = (c: Candidate) =>
    `<div class="qr s-${c.s}"><i class="dot"></i><span class="nm">${esc(c.nm)}</span>` +
    `<span class="st">${ico('i-user')}${esc(stageById(c.p, c.st).nm)}</span>` +
    `<span class="pos">${esc(posById(c.p).title)}</span>` +
    `<span class="age">${c.d}d</span><span class="why">${esc(c.why || (paused(c) ? '진행 정지' : '자동 진행 중'))}</span>` +
    '<span class="btns"><button class="btn quiet">보기</button></span></div>'
  const fold = (t: string, arr: Candidate[], k: string, h: string) => {
    const o = !!open[k]
    return `<div class="grp"><button class="fold${o ? ' open' : ''}" data-fold="${k}">` +
      `<i class="dot d-${k}"></i><span>${t}</span><span class="cnt">${arr.length}</span>` +
      `<span class="hint">${h}</span><span class="arw"><span class="arw-t">${o ? '접기' : '펼치기'}</span>${ico('i-chevron', 'ic-sm')}</span></button>` +
      `<div class="sheet fold-body"${o ? '' : ' style="display:none"'}>${arr.map(crow).join('')}</div></div>`
  }
  const top = escd.length
    ? `<div class="grp"><div class="sec-h"><h3>지금 처리</h3><span class="n">${escd.length}</span>` +
      `<span class="hint">자동화가 멈춘 지점입니다</span></div><div class="sheet">${escd.map(row).join('')}</div></div>`
    : `<div class="zero">${ico('i-check-circle')}<b>지금 처리할 일이 없습니다</b><span>모든 조율이 자동으로 진행 중입니다</span></div>`
  return '<header class="top">' +
    `<div class="crumb">${ico('i-inbox', 'ic-sm')}내 화면</div>` +
    '<div class="h-row"><h1>조율 처리함</h1>' +
    (escd.length ? `<span class="pill bad">${ico('i-alert', 'ic-sm')}${escd.length}건 대기</span>` : '') +
    `<div class="spacer"><a class="btn" href="/settings">${ico('i-sliders', 'ic-sm')}규칙 설정</a></div></div>` +
    `<div class="meta"><i>${ico('i-user', 'ic-sm')}담당 <b>${me.name}</b></i>` +
    `<i>${ico('i-briefcase', 'ic-sm')}공고 <b>${positions.filter(p => p.st === 'open').length}건</b></i>` +
    `<i>${ico('i-clock', 'ic-sm')}기준 <b>2026-08-12</b></i></div>` +
    '</header>' +
    '<div class="stage">' + top +
    (late.length ? `<div class="grp"><div class="sec-h"><h3>곧 처리</h3><span class="n">${late.length}</span>` +
      `<span class="hint">기준 시간을 넘겼습니다</span></div><div class="sheet">${late.map(row).join('')}</div></div>` : '') +
    fold('AI 진행 중', idle, 'idle', '개입 불필요') +
    fold('완료', done, 'done', '기록만 남습니다') +
    (held.length ? fold('보류 · 종료 공고', held, 'held', '자동화가 돌지 않습니다') : '') +
    note([
      '위에서부터 내려오며 <b>버튼 하나씩만 누르면</b> 된다. 판단에 필요한 건 이름·단계·공고·경과·사유뿐이다.',
      '<b>전 공고를 가로질러</b> 모인다. 코디네이터는 공고를 옮겨다니지 않는다.',
      '이 화면의 목표 상태는 <b>맨 위 0건</b>이다.',
    ]) +
    '<p class="disclaimer">※ 화면은 기능 설명을 위한 예시 데이터입니다.</p>' +
    '</div>'
}

export function notFoundHTML() {
  return `<div class="stage"><div class="empty">${ico('i-alert')}<b>화면을 찾을 수 없습니다</b><span>주소를 확인해 주세요</span></div></div>`
}

/* ---------- 내 포지션 (B-2) — 리크루터 홈 ----------
   공고 목록(C-1)과 다른 점은 딱 하나다: 여기는 '전체'가 아니라 '내 것'만 보고,
   먼저 답해야 할 질문이 "어느 공고부터 손대야 하나"이다.
   그래서 병목을 <가장 오래 머문 단계>가 아니라 <기준 체류일 대비 몇 배>로 잡는다.
   기준이 3일인 단계의 6일과, 기준이 7일인 단계의 8일은 심각도가 다르기 때문이다. */
interface Neck { nm: string; n: number; avg: number; sla: number; ratio: number }

function neckOf(pid: string, cs: Candidate[]): Neck | null {
  let best: Neck | null = null
  for (const s of stagesOf(pid)) {
    if (s.rail) continue
    const mine = cs.filter(c => c.st === s.id)
    if (!mine.length) continue
    const avg = mine.reduce((a, c) => a + c.d, 0) / mine.length
    const sla = Math.max(s.sla, 1)
    const ratio = avg / sla
    if (!best || ratio > best.ratio) best = { nm: s.nm, n: mine.length, avg, sla, ratio }
  }
  return best
}

function posCard(p: typeof positions[number]): string {
  const cs = cands.filter(c => c.p === p.id)
  const act = cs.filter(c => !stageById(p.id, c.st).rail)
  const cnt = (s: string) => act.filter(c => c.s === s).length
  const esced = cnt('esc'), lated = cnt('late')
  const st = ({ open: ['ok', '오픈'], hold: ['warn', '홀드'], closed: ['', '마감'] } as Record<string, string[]>)[p.st]
  const neck = neckOf(p.id, act)
  const over = !!neck && neck.ratio >= 1

  /* 단계 분포 — 보드를 열지 않고도 어디에 몰려 있는지 보이게 한다. */
  const cols = stagesOf(p.id).filter(s => !s.rail)
  const top = Math.max(1, ...cols.map(s => act.filter(c => c.st === s.id).length))
  const fun = cols.map(s => {
    const n = act.filter(c => c.st === s.id).length
    return '<div class="fn">' +
      `<span class="fl">${esc(s.nm)}</span>` +
      `<span class="ft"><i class="ff" style="width:${n ? Math.round((n / top) * 100) : 0}%${n ? '' : ';min-width:0'}"></i></span>` +
      `<span class="fv">${n}<small>명</small></span></div>`
  }).join('')

  return '<div class="sheet" style="padding:16px 18px">' +
    '<div style="display:flex;align-items:center;gap:8px">' +
    `<a href="/p/${p.id}/board" style="font-size:14.5px;font-weight:700;letter-spacing:-.02em">${esc(p.title)}</a>` +
    `<span class="pill ${st[0]}"><i class="dot"></i>${st[1]}</span>` +
    `<span style="margin-left:auto;font-family:var(--mono);font-size:11.5px;color:var(--t4)">D+${daysSince(p.opened)}</span></div>` +
    `<div style="font-size:11.5px;color:var(--t4);margin-top:2px">${esc(p.dept)} · ${esc(p.team)} · HM ${esc(p.hm)}</div>` +

    `<div class="railbar" style="margin:13px 0 0">` +
    `<div class="rb"><span class="c">${act.length}</span><span class="l">진행</span></div>` +
    `<div class="rb${esced ? ' hot' : ''}"><span class="c">${esced}</span><span class="l">사람 대기</span></div>` +
    `<div class="rb"><span class="c">${lated}</span><span class="l">지연</span></div></div>` +

    (neck
      ? `<div style="margin-top:13px;padding:10px 12px;border-radius:var(--r-lg);` +
        `background:${over ? 'var(--esc-bg)' : 'var(--sunken)'}">` +
        `<div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;` +
        `color:${over ? 'var(--esc)' : 'var(--t3)'}">${ico('i-clock', 'ic-sm')}병목 단계</div>` +
        `<div style="font-size:12.5px;margin-top:3px"><b>${esc(neck.nm)}</b> · ${neck.n}명 · ` +
        `평균 ${neck.avg.toFixed(1)}일 <span style="color:var(--t4)">/ 기준 ${neck.sla}일</span>` +
        (over ? ` <b style="color:var(--esc)">${neck.ratio.toFixed(1)}배</b>` : '') + '</div></div>'
      : '<div style="margin-top:13px;font-size:12px;color:var(--t4)">진행 중인 후보자가 없습니다.</div>') +

    (act.length ? `<div class="funnel" style="margin-top:14px">${fun}</div>` : '') +

    '<div style="display:flex;gap:6px;margin-top:14px">' +
    `<a class="btn solid" style="flex:1;justify-content:center" href="/p/${p.id}/board">${ico('i-columns', 'ic-sm')}보드 열기</a>` +
    `<a class="btn" href="/p/${p.id}/setup">${ico('i-sliders', 'ic-sm')}설정</a></div>` +
    '</div>'
}

export function myHomeHTML(uid?: string) {
  const who = people.find(x => x.id === uid)
    ?? people.find(x => x.nm === me.name)
    ?? people[0]
  const mineOf = (nm: string) => positions.filter(p => p.rec === nm)
  const mine = mineOf(who.nm)
  const open = mine.filter(p => p.st === 'open')
  const rest = mine.filter(p => p.st !== 'open')
  const act = cands.filter(c => mine.some(p => p.id === c.p) && !stageById(c.p, c.st).rail)
  const esced = act.filter(c => c.s === 'esc').length

  /* 로그인이 없는 프로토타입이라 '누구 화면인지'를 직접 고른다 — /todo 와 같은 방식.
     담당 공고가 있는 사람만 칩으로 띄운다. */
  const picker = '<div class="chips" style="margin:0 0 14px;gap:6px">' +
    people.filter(p => mineOf(p.nm).length > 0 || p.id === who.id).map(p =>
      `<a class="chip${p.id === who.id ? ' on' : ''}" href="/my?u=${p.id}">` +
      `${esc(p.nm)} <b>${mineOf(p.nm).length}</b></a>`).join('') + '</div>'

  const body = mine.length
    ? `<div class="grid g2" style="max-width:1080px">${open.map(posCard).join('')}</div>` +
      (rest.length
        ? `<div class="sec-h" style="margin-top:24px"><h3>홀드 · 마감</h3><span class="n">${rest.length}건</span></div>` +
          `<div class="grid g2" style="max-width:1080px">${rest.map(posCard).join('')}</div>`
        : '')
    : '<div class="empty sheet" style="max-width:760px">' +
      `${ico('i-briefcase', 'ic-lg')}<b>${esc(who.nm)} 님이 담당하는 공고가 없습니다</b>` +
      '<span>공고의 담당 리크루터로 지정되면 여기에 나타납니다.</span></div>'

  return '<header class="top">' +
    `<div class="crumb">${ico('i-star', 'ic-sm')}내 화면</div>` +
    `<div class="h-row"><h1>내 포지션</h1><span class="pill">${mine.length}건</span>` +
    (esced ? `<span class="pill bad">${ico('i-alert', 'ic-sm')}사람 대기 ${esced}건</span>` : '') +
    `<div class="spacer"><a class="btn br" href="/positions/new">${ico('i-plus', 'ic-sm')}공고 생성</a></div></div>` +
    `<div class="meta"><i>${ico('i-user', 'ic-sm')}<b>${esc(who.nm)}</b> · ${esc(who.tt)}</i>` +
    `<i>${ico('i-check-circle', 'ic-sm')}오픈 <b>${open.length}</b></i>` +
    `<i>${ico('i-users', 'ic-sm')}진행 후보자 <b>${act.length}</b></i></div></header>` +
    '<div class="stage">' + picker + body +
    note([
      '이 화면은 <b>내가 담당한 공고</b>만 봅니다. 전체 목록은 <b>채용 &gt; 공고</b>에 있습니다.',
      '병목은 <b>기준 체류일 대비 몇 배</b>로 잡습니다. 기준 3일짜리 단계의 6일과 기준 7일짜리 단계의 8일은 심각도가 다르기 때문입니다.',
      '단계 막대는 <b>지금 어디에 몰려 있는지</b>만 보여줍니다. 옮기는 것은 보드에서 합니다.',
    ]) + '</div>'
}
