/* =========================================================
   외부 링크 화면 공통 스타일 (ivp-*)
   ---------------------------------------------------------
   면접관·후보자가 계정 없이 여는 링크 화면은 리크루터 셸(사이드바)을 덮고
   전체화면 카드 하나로 뜬다. 그 카드의 스타일을 여기 한 곳에 둔다.
   링크가 4장(①시간 확정 ②브리핑 ③평가 제출 ④가용시간)이라, 같은 CSS 를
   네 번 복사하면 한 곳만 고쳐도 나머지 세 장이 어긋난다.

   디자인 규칙은 내부 화면과 같다 — 색은 상태에만(확정 녹색·불가 버밀리온),
   버튼은 무채색(--t1), 인디고(--brand)는 로고와 '내가 고른 것' 표시 전용.
   ========================================================= */
export const EXT_CSS = `
.ivp-root{
  position:fixed; inset:0; z-index:2000; overflow-y:auto;
  background:
    radial-gradient(1100px 520px at 50% -8%, #efeefc 0%, rgba(239,238,252,0) 60%),
    var(--chrome, #fbfbfc);
  color:var(--t1, #17171c);
  font-family:var(--sans, 'Pretendard Variable','Pretendard',system-ui,sans-serif);
  display:flex; flex-direction:column; align-items:center;
  padding:56px 20px 28px;
}
.ivp-card{
  width:100%; max-width:520px; background:var(--canvas, #fff);
  border-radius:var(--r-2xl, 18px);
  box-shadow:var(--sh-3, 0 12px 28px -6px rgba(23,23,28,.12), 0 0 0 1px rgba(23,23,28,.07));
  overflow:hidden;
}
.ivp-brand{
  display:flex; align-items:center; gap:9px;
  padding:16px 22px; border-bottom:1px solid var(--line, #ececf0);
}
.ivp-mark{
  width:24px; height:24px; border-radius:7px; flex:none; display:grid; place-items:center;
  background:linear-gradient(150deg, var(--brand, #5b53d6) 0%, var(--brand-deep, #4a43bd) 100%);
  box-shadow:0 1px 2px rgba(91,83,214,.35), inset 0 1px 0 rgba(255,255,255,.22);
}
.ivp-wm{ font-weight:680; font-size:14px; letter-spacing:-.02em; }
.ivp-wm-sub{ margin-left:auto; font-size:11.5px; color:var(--t3, #84848f); }

.ivp-body{ padding:32px 30px 30px; text-align:center; }
.ivp-body-l{ text-align:left; padding:24px 24px 22px; }

.ivp-h1{ font-size:18px; font-weight:700; letter-spacing:-.02em; line-height:1.4; text-wrap:balance; }
.ivp-lead{ margin-top:8px; color:var(--t2, #55555f); font-size:13.5px; line-height:1.6; }
.ivp-note{ margin-top:14px; color:var(--t3, #84848f); font-size:12px; }
.ivp-fine{ margin-top:10px; text-align:center; color:var(--t3, #84848f); font-size:11.5px; line-height:1.55; }

.ivp-metarow{
  display:flex; align-items:center; gap:7px; margin-top:10px;
  color:var(--t2, #55555f); font-size:12.5px;
}
.ivp-dot{ color:var(--t4, #a8a8b2); }
.ivp-chip{
  display:inline-flex; align-items:center; padding:2px 9px; border-radius:999px;
  background:var(--brand-soft, #efeefc); color:var(--brand-deep, #4a43bd);
  font-size:11.5px; font-weight:620;
}

/* 후보자 맥락 / 준비 카드 */
.ivp-who, .ivp-kit{
  margin-top:14px; padding:13px 14px; border-radius:var(--r-lg, 10px);
  background:var(--sunken, #f6f6f8); box-shadow:inset 0 0 0 1px var(--line, #ececf0);
  text-align:left;
}
.ivp-kit{ margin-top:18px; }
.ivp-kit-h{ font-size:12px; font-weight:660; color:var(--t3, #84848f); margin-bottom:9px; }
.ivp-kit-h2{ font-size:12px; font-weight:660; color:var(--t3, #84848f); margin:13px 0 6px; }
.ivp-kv{ display:flex; gap:10px; padding:3px 0; font-size:13px; align-items:baseline; }
.ivp-k{ flex:none; width:48px; color:var(--t3, #84848f); font-size:12px; }
.ivp-v{ color:var(--t1, #17171c); }
.ivp-sub{ color:var(--t3, #84848f); }
.ivp-focus{ margin:0; padding-left:16px; color:var(--t2, #55555f); font-size:12.5px; line-height:1.75; }

/* 날짜 그룹 + 슬롯 */
.ivp-groups{ margin-top:14px; display:flex; flex-direction:column; gap:14px; }
.ivp-day{ font-size:12px; font-weight:640; color:var(--t3, #84848f); margin-bottom:7px; }
.ivp-slots{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.ivp-slot{
  display:flex; align-items:center; justify-content:center;
  padding:11px 10px; border-radius:var(--r-md, 8px);
  background:var(--canvas, #fff); box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
  color:var(--t1, #17171c); font-size:13px; transition:box-shadow .12s, background .12s;
}
.ivp-slot:hover{ box-shadow:inset 0 0 0 1px var(--t4, #a8a8b2); background:var(--sunken, #f6f6f8); }
.ivp-slot.on{
  background:var(--brand-soft, #efeefc); color:var(--brand-deep, #4a43bd);
  box-shadow:inset 0 0 0 1.5px var(--brand, #5b53d6); font-weight:640;
}

/* 거절 사유 */
.ivp-reasons{ margin-top:14px; display:flex; flex-direction:column; gap:7px; }
.ivp-reason{
  text-align:left; padding:11px 13px; border-radius:var(--r-md, 8px);
  background:var(--canvas, #fff); box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
  color:var(--t1, #17171c); font-size:13px; transition:box-shadow .12s, background .12s;
}
.ivp-reason:hover{ background:var(--sunken, #f6f6f8); }
.ivp-reason.on{
  background:var(--brand-soft, #efeefc); color:var(--brand-deep, #4a43bd);
  box-shadow:inset 0 0 0 1.5px var(--brand, #5b53d6); font-weight:620;
}
.ivp-etc{
  margin-top:9px; width:100%; padding:10px 12px; border-radius:var(--r-md, 8px);
  background:var(--canvas, #fff); box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
  font-size:13px; color:var(--t1, #17171c); font-family:inherit;
}
.ivp-etc:focus{ outline:none; box-shadow:inset 0 0 0 1.5px var(--brand, #5b53d6); }

.ivp-err{
  margin-bottom:9px; padding:9px 12px; border-radius:var(--r-md, 8px);
  background:var(--esc-bg, #fef3f2); color:var(--esc, #d92d20);
  box-shadow:inset 0 0 0 1px rgba(217,45,32,.2);
  font-size:12.5px; line-height:1.5;
}

/* 버튼 — 확정은 무채색 solid, 불가는 상태색(버밀리온) */
.ivp-foot{ margin-top:20px; }
.ivp-cta{
  width:100%; padding:13px 16px; border-radius:var(--r-lg, 10px);
  background:var(--t1, #17171c); color:#fff; font-size:13.5px; font-weight:640;
  box-shadow:var(--sh-1, 0 1px 2px rgba(23,23,28,.05)); transition:opacity .12s, transform .06s;
}
.ivp-cta:hover:not(:disabled){ opacity:.9; }
.ivp-cta:active:not(:disabled){ transform:translateY(1px); }
.ivp-cta:disabled{ background:var(--sunken, #f6f6f8); color:var(--t4, #a8a8b2); cursor:default; box-shadow:inset 0 0 0 1px var(--line, #ececf0); }
.ivp-cta.esc{ background:var(--esc, #d92d20); }
.ivp-ghost{
  width:100%; margin-top:8px; padding:11px 16px; border-radius:var(--r-lg, 10px);
  background:transparent; color:var(--t3, #84848f); font-size:12.5px;
}
.ivp-ghost:hover:not(:disabled){ color:var(--t1, #17171c); background:var(--sunken, #f6f6f8); }

/* 상태 배지 — 색은 상태에만 */
.ivp-badge{
  width:48px; height:48px; margin:0 auto 8px; border-radius:50%;
  display:grid; place-items:center;
}
.ivp-badge.ok{ background:var(--done-bg, #f0faf5); color:var(--done, #0a9459); box-shadow:inset 0 0 0 1px var(--done-rim, rgba(10,148,89,.22)); }
.ivp-badge.esc{ background:var(--esc-bg, #fef3f2); color:var(--esc, #d92d20); box-shadow:inset 0 0 0 1px rgba(217,45,32,.2); }
.ivp-badge.idle{ background:var(--sunken, #f6f6f8); color:var(--t3, #84848f); box-shadow:inset 0 0 0 1px var(--line, #ececf0); }

.ivp-confirm{
  margin:14px auto 0; max-width:320px; padding:15px;
  border-radius:var(--r-lg, 10px); background:var(--sunken, #f6f6f8);
  box-shadow:inset 0 0 0 1px var(--line, #ececf0);
}
.ivp-confirm-day{ font-size:14px; font-weight:680; letter-spacing:-.01em; }
.ivp-confirm-time{ margin-top:3px; font-size:15px; color:var(--brand-deep, #4a43bd); font-weight:600; }
.ivp-confirm-meta{ margin-top:7px; color:var(--t2, #55555f); font-size:12px; }

/* 평가지 — 4단계 척도. 색은 상태(찬성/반대)에만 쓴다. */
.ivp-ev{ margin-top:12px; }
.ivp-ev-done{
  margin-left:8px; font-weight:600; color:var(--done, #0a9459);
}
.ivp-ev-guide{
  margin:0 0 12px; color:var(--t3, #84848f); font-size:12px; line-height:1.6;
}
.ivp-ev-field{ margin-bottom:12px; }
.ivp-ev-field.total{
  margin-top:16px; padding-top:14px; border-top:1px solid var(--line-firm, #dedee4);
}
.ivp-ev-k{ font-size:12.5px; font-weight:560; margin-bottom:7px; }
.ivp-scale{ display:grid; grid-template-columns:repeat(4, 1fr); gap:5px; }
.ivp-rate{
  padding:9px 4px; border-radius:var(--r-md, 8px); font-size:11.5px; line-height:1.25;
  background:var(--canvas, #fff); color:var(--t2, #55555f);
  box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
  transition:box-shadow .12s, background .12s, color .12s;
}
.ivp-rate:hover{ background:var(--sunken, #f6f6f8); color:var(--t1, #17171c); }
.ivp-rate.on{ font-weight:660; }
.ivp-rate.on.pos{
  background:var(--done-bg, #f0faf5); color:var(--done, #0a9459);
  box-shadow:inset 0 0 0 1.5px var(--done, #0a9459);
}
.ivp-rate.on.neg{
  background:var(--esc-bg, #fef3f2); color:var(--esc, #d92d20);
  box-shadow:inset 0 0 0 1.5px var(--esc, #d92d20);
}
.ivp-ev-memo-in{
  margin-top:12px; width:100%; padding:10px 12px; border-radius:var(--r-md, 8px);
  background:var(--canvas, #fff); box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
  font-size:13px; color:var(--t1, #17171c); font-family:inherit; line-height:1.6; resize:vertical;
}
.ivp-ev-memo-in:focus{ outline:none; box-shadow:inset 0 0 0 1.5px var(--brand, #5b53d6); }

/* 제출 후 요약 */
.ivp-ev-sum{ display:flex; flex-direction:column; }
.ivp-ev-line{
  display:flex; align-items:baseline; gap:10px; padding:5px 0; font-size:12.5px;
}
.ivp-ev-line.total{
  margin-top:5px; padding-top:9px; border-top:1px solid var(--line-firm, #dedee4); font-weight:600;
}
.ivp-ev-l{ flex:1; min-width:0; color:var(--t2, #55555f); }
.ivp-ev-v{ flex:none; font-weight:620; }
.ivp-ev-v.pos{ color:var(--done, #0a9459); }
.ivp-ev-v.neg{ color:var(--esc, #d92d20); }
.ivp-ev-memo{
  margin:10px 0 0; padding:10px 12px; border-radius:var(--r-md, 8px);
  background:var(--canvas, #fff); box-shadow:inset 0 0 0 1px var(--line, #ececf0);
  font-size:12.5px; color:var(--t2, #55555f); line-height:1.6;
}

.ivp-brandline{
  display:flex; align-items:center; gap:7px; margin-top:20px;
  color:var(--t4, #a8a8b2); font-size:11.5px;
}
.ivp-mark-sm{
  width:11px; height:11px; border-radius:3px; display:inline-block;
  background:linear-gradient(150deg, var(--brand, #5b53d6), var(--brand-deep, #4a43bd));
}

@media (max-width:420px){
  .ivp-root{ padding:32px 14px 22px; }
  .ivp-slots{ grid-template-columns:1fr; }
}

/* ---------- ② 브리핑 전용 ---------- */
.ivp-cov{ margin-top:8px; display:flex; flex-direction:column; gap:6px; }
.ivp-cov-row{
  display:flex; align-items:baseline; gap:9px; padding:7px 10px;
  border-radius:var(--r-md, 8px); background:var(--canvas, #fff);
  box-shadow:inset 0 0 0 1px var(--line, #ececf0); font-size:12.5px;
}
.ivp-cov-l{ flex:1; min-width:0; color:var(--t2, #55555f); }
.ivp-cov-v{ flex:none; font-weight:620; font-size:11.5px; }
.ivp-cov-v.pos{ color:var(--done, #0a9459); }
.ivp-cov-v.neg{ color:var(--esc, #d92d20); }
.ivp-cov-v.none{ color:var(--t4, #a8a8b2); font-weight:500; }
.ivp-mine{
  margin-top:8px; padding:11px 13px; border-radius:var(--r-md, 8px);
  background:var(--canvas, #fff); box-shadow:inset 0 0 0 1.5px var(--brand, #5b53d6);
}
.ivp-mine-h{ font-size:11.5px; font-weight:700; color:var(--brand-deep, #4a43bd); margin-bottom:6px; }
/* 남이 맡은 항목 — 참고용이라 테두리·색을 뺀다. 인디고는 '내 것'에만. */
.ivp-mine.other{ box-shadow:inset 0 0 0 1px var(--line, #ececf0); background:var(--sunken, #f6f6f8); }
.ivp-mine.other .ivp-mine-h{ color:var(--t2, #55555f); }
.ivp-qs{ margin:0; padding-left:16px; color:var(--t2, #55555f); font-size:12.5px; line-height:1.75; }
.ivp-qs li + li{ margin-top:2px; }
.ivp-split{ display:flex; flex-direction:column; gap:5px; margin-top:8px; }
.ivp-split-row{ display:flex; gap:9px; align-items:baseline; font-size:12.5px; }
.ivp-split-nm{ flex:none; width:62px; font-weight:600; }
.ivp-split-nm.me{ color:var(--brand-deep, #4a43bd); }
.ivp-split-at{ flex:1; min-width:0; color:var(--t2, #55555f); }

/* ---------- ④ 가용시간 전용 ---------- */
.ivp-cal{ margin-top:14px; overflow-x:auto; }
.ivp-cal-grid{ display:grid; gap:3px; min-width:min-content; }
.ivp-cal-h{
  font-size:11px; font-weight:640; color:var(--t3, #84848f); text-align:center;
  padding-bottom:4px; white-space:nowrap;
}
.ivp-cal-h.wknd{ color:var(--t4, #a8a8b2); }
/* 머리줄은 '이 줄 전체 토글' 버튼이기도 하다 — 버튼 기본 외형만 지운다. */
button.ivp-cal-h, button.ivp-cal-t{
  background:none; border:0; cursor:pointer; font:inherit; line-height:1.25;
}
button.ivp-cal-h:hover, button.ivp-cal-t:hover{ color:var(--t1, #17171c); }
button.ivp-cal-t{ font-family:var(--mono, ui-monospace, monospace); font-size:10.5px; line-height:22px; }
.ivp-cal-t{
  font-size:10.5px; color:var(--t4, #a8a8b2); text-align:right; padding-right:6px;
  font-family:var(--mono, ui-monospace, monospace); white-space:nowrap; line-height:22px;
}
.ivp-cell{
  height:22px; border-radius:5px; background:var(--sunken, #f6f6f8);
  box-shadow:inset 0 0 0 1px var(--line, #ececf0); transition:background .1s, box-shadow .1s;
  cursor:pointer; touch-action:none;
}
.ivp-cell:hover{ box-shadow:inset 0 0 0 1px var(--t4, #a8a8b2); }
.ivp-cell.on{
  background:var(--brand-soft, #efeefc);
  box-shadow:inset 0 0 0 1.5px var(--brand, #5b53d6);
}
.ivp-cell.busy{
  background:repeating-linear-gradient(135deg,
    var(--sunken, #f6f6f8) 0 4px, var(--line, #ececf0) 4px 8px);
  cursor:not-allowed; box-shadow:inset 0 0 0 1px var(--line, #ececf0);
}
.ivp-cell.busy:hover{ box-shadow:inset 0 0 0 1px var(--line, #ececf0); }
.ivp-legend{
  display:flex; flex-wrap:wrap; gap:14px; margin-top:11px;
  color:var(--t3, #84848f); font-size:11.5px;
}
.ivp-legend span{ display:inline-flex; align-items:center; gap:5px; }
.ivp-legend i{ width:13px; height:13px; border-radius:4px; display:inline-block; }
.ivp-count{
  margin-top:12px; padding:10px 12px; border-radius:var(--r-md, 8px);
  background:var(--sunken, #f6f6f8); box-shadow:inset 0 0 0 1px var(--line, #ececf0);
  font-size:12.5px; color:var(--t2, #55555f); line-height:1.6;
}
.ivp-count b{ color:var(--t1, #17171c); font-weight:660; }
.ivp-count.thin{ background:var(--late-bg, #fffaeb); box-shadow:inset 0 0 0 1px rgba(181,115,11,.2); color:var(--late, #b5730b); }
.ivp-quick{ display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
.ivp-quick button{
  padding:6px 11px; border-radius:999px; font-size:11.5px; color:var(--t2, #55555f);
  background:var(--canvas, #fff); box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
}
.ivp-quick button:hover{ background:var(--sunken, #f6f6f8); color:var(--t1, #17171c); }

/* ---------- 링크 사이 이동 ---------- */
.ivp-jump{
  display:flex; gap:7px; margin-top:16px; padding-top:14px;
  border-top:1px solid var(--line, #ececf0);
}
.ivp-jump a{
  flex:1; text-align:center; padding:9px 8px; border-radius:var(--r-md, 8px);
  font-size:12px; color:var(--t2, #55555f);
  box-shadow:inset 0 0 0 1px var(--line-firm, #dedee4);
}
.ivp-jump a:hover{ background:var(--sunken, #f6f6f8); color:var(--t1, #17171c); }

@media (max-width:420px){
  .ivp-split-nm{ width:auto; }
}
`
