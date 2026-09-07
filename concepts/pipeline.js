/* =========================================================
   Cadence — 공고별 파이프라인
   데이터는 하나, 렌더러는 셋.
   ※ 모든 값은 기능 설명용 예시 데이터입니다.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- 후보자 단계 (6) ---------- */
  /* sq — 단계가 진행될수록 브랜드 인디고에 가까워진다. 상태색(적/황/녹/회)과 색상 계열이 겹치지 않는다. */
  var STAGES = [
    { k: 'apply',  n: '지원 접수',  dwell: '1.2d', sq: '#c3c5e2' },
    { k: 'screen', n: '서류 검토',  dwell: '3.1d', sq: '#a8abe4' },
    { k: 'i1',     n: '1차 인터뷰', dwell: '4.4d', sq: '#8b8ce2' },
    { k: 'i2',     n: '2차 인터뷰', dwell: '9.6d', sq: '#6e6bda', hot: true },
    { k: 'offer',  n: '오퍼',       dwell: '6.8d', sq: '#5b53d6' },
    { k: 'hired',  n: '입사',       dwell: '—', rail: true, icon: 'i-check-circle' }
  ];

  /* ---------- 공고 단위 미팅 (2) — 후보자 단계가 아니다 ---------- */
  var MEETINGS = [
    { n: '킥오프',   s: 'done', v: '8/4 완료',      ag: '—' },
    { n: '디브리프', s: 'esc',  v: '참석자 미지정', ag: '52h', act: ['참석자 지정 요청'] }
  ];

  /* ---------- 후보자 ---------- */
  /* idle 자동 진행 · esc 사람 대기 · late 지연 · done 완료 */
  var PEOPLE = [
    { nm: '한지우', st: 'apply',  d: 0,  s: 'idle', why: '',                 src: '리멤버' },
    { nm: '배준영', st: 'apply',  d: 1,  s: 'idle', why: '',                 src: '자사채용' },
    { nm: '강도윤', st: 'screen', d: 2,  s: 'idle', why: '',                 src: '원티드' },
    { nm: '윤서아', st: 'screen', d: 6,  s: 'late', why: 'HM 미응답 48h',     src: '추천',    act: ['HM에게 리마인드'] },
    { nm: '문태오', st: 'screen', d: 1,  s: 'idle', why: '',                 src: '자사채용' },
    { nm: '신하경', st: 'screen', d: 3,  s: 'idle', why: '',                 src: '링크드인' },
    { nm: '박지훈', st: 'i1',     d: 5,  s: 'late', why: '후보자 미확인 36h', src: '원티드',  act: ['후보자에게 재발송'] },
    { nm: '임채원', st: 'i1',     d: 3,  s: 'idle', why: '슬롯 3개 발송',     src: '리멤버' },
    { nm: '오시현', st: 'i1',     d: 3,  s: 'done', why: '8/14 14:00 확정',   src: '추천' },
    { nm: '김민준', st: 'i2',     d: 9,  s: 'idle', why: '2시간 블록 탐색',   src: '링크드인' },
    { nm: '이서연', st: 'i2',     d: 12, s: 'esc',  why: '면접관 전원 거절',  src: '원티드',  act: ['범위 넓혀 재탐색', '직접 조율'] },
    { nm: '최유나', st: 'offer',  d: 21, s: 'esc',  why: '처우 재협의',       src: '추천',    act: ['처우안 수정', 'HM에 확인'] },
    { nm: '정하늘', st: 'hired',  d: 18, s: 'done', why: '9/1 입사 예정',     src: '리멤버' }
  ];

  var REJECTED = 4; /* 불합격 — 레일로만 */

  var LABEL = { esc: '사람 대기', late: '지연', idle: 'AI 진행', done: '완료' };
  var ORDER = { esc: 0, late: 1, idle: 2, done: 3 };

  var filter = null;

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
  }
  function ico(id, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '"><use href="#' + id + '"/></svg>'; }
  function stageIdx(k) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].k === k) return i; return 0; }
  function visible() { return PEOPLE.filter(function (p) { return !filter || p.s === filter; }); }
  function byRisk(a, b) { return (ORDER[a.s] - ORDER[b.s]) || (b.d - a.d); }
  function acts(p, solid) {
    if (!p.act || !p.act.length) return '<button class="btn quiet">보기</button>';
    return p.act.map(function (a, i) {
      return '<button class="btn' + (solid && i === 0 ? ' solid' : '') + '">' + esc(a) + '</button>';
    }).join('');
  }

  /* =======================================================
     상단 바 — 공고 단위 미팅 + 상태 필터
     ======================================================= */
  function renderBar() {
    var counts = { esc: 0, late: 0, idle: 0, done: 0 };
    PEOPLE.forEach(function (p) { counts[p.s]++; });
    MEETINGS.forEach(function (m) { counts[m.s]++; });

    var mtgs = MEETINGS.map(function (m) {
      return '<div class="mtg s-' + m.s + '"><i class="dot"></i>' +
        '<span class="mtg-n">' + esc(m.n) + '</span>' +
        '<span class="mtg-v">' + esc(m.v) + (m.ag !== '—' ? ' · ' + esc(m.ag) : '') + '</span>' +
        (m.act ? '<button class="btn solid">' + esc(m.act[0]) + '</button>' : '') + '</div>';
    }).join('');

    var chips = ['esc', 'late', 'idle', 'done'].map(function (k) {
      return '<button class="chip' + (filter === k ? ' on' : '') + '" data-f="' + k + '">' +
        '<i class="dot d-' + k + '"></i>' + LABEL[k] + ' <b>' + counts[k] + '</b></button>';
    }).join('');

    var bar = document.getElementById('bar');
    bar.innerHTML = '<span class="bar-label">' + ico('i-video', 'ic-sm') + '공고 미팅</span>' +
                    mtgs + '<div class="chips">' + chips + '</div>';

    bar.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        var k = c.getAttribute('data-f');
        filter = (filter === k) ? null : k;
        renderAll();
      });
    });
  }

  /* =======================================================
     시안 A — 스테이지 보드
     ======================================================= */
  var hideIdle = false;

  function renderA() {
    var list = visible();
    var idleN = list.filter(function (p) { return p.s === 'idle'; }).length;

    var cols = STAGES.map(function (sg) {
      var mine = list.filter(function (p) { return p.st === sg.k; }).sort(byRisk);

      if (sg.rail) {
        return '<div class="rail">' + ico(sg.icon) +
               '<span class="v">' + esc(sg.n) + '</span><span class="n">' + mine.length + '</span></div>';
      }

      var risk = mine.filter(function (p) { return p.s === 'esc' || p.s === 'late'; }).length;
      var shown = hideIdle ? mine.filter(function (p) { return p.s !== 'idle'; }) : mine;
      var hidden = mine.length - shown.length;

      var cards = shown.map(function (p) {
        var reason = (p.s !== 'idle' && p.why) ? '<div class="card-r">' + esc(p.why) + '</div>' : '';
        return '<div class="card s-' + p.s + '">' +
          '<div class="card-t"><i class="dot"></i><span class="nm">' + esc(p.nm) + '</span>' +
          '<span class="age">' + ico('i-clock') + p.d + 'd</span></div>' + reason + '</div>';
      }).join('');

      return '<div class="col">' +
        '<div class="col-h"><i class="sq" style="background:' + sg.sq + '"></i><h3>' + esc(sg.n) + '</h3><span class="n">' + mine.length + '</span>' +
        (risk ? '<span class="risk">' + ico('i-alert') + risk + '</span>' : '') + '</div>' +
        '<div class="col-b">' + cards +
        (hidden ? '<span class="col-hidden">' + ico('i-eye-off', 'ic-sm') + 'AI ' + hidden + '건</span>' : '') + '</div>' +
        '<div class="col-f' + (sg.hot ? ' warn' : '') + '"><span>평균 체류</span><b>' + sg.dwell + '</b></div>' +
        '</div>';
    }).join('');

    var out = '<div class="rail">' + ico('i-alert') + '<span class="v">불합격</span><span class="n">' + REJECTED + '</span></div>';

    document.getElementById('pane-a').innerHTML =
      '<div class="sec-h"><h3>후보자</h3><span class="n">' + list.length + '명</span>' +
      '<button class="btn quiet" id="idleToggle" style="margin-left:auto">' +
      ico('i-eye-off', 'ic-sm') + (hideIdle ? 'AI 진행 중 다시 보기' : 'AI 진행 중 ' + idleN + '건 숨기기') + '</button></div>' +
      '<div class="board">' + cols + out + '</div>' +
      note([
        '색이 붙은 카드만 본다 — <b>빨강은 지금, 주황은 오늘 안에</b>. 회색은 자동으로 돌고 있다.',
        '열 머리의 빨간 숫자가 <b>그 단계에 걸린 사람 수</b>, 열 발치의 평균 체류가 병목을 가리킨다.',
        '카드를 옆 열로 끌면 단계가 넘어가고 그 즉시 다음 조율이 자동으로 시작된다.',
        '입사·불합격은 세로 레일로 접힌다. <b>끝난 것이 화면을 차지하지 않는다.</b>'
      ]);

    var t = document.getElementById('idleToggle');
    if (t) t.addEventListener('click', function () { hideIdle = !hideIdle; renderA(); });
  }

  /* =======================================================
     시안 B — 진행 레일
     ======================================================= */
  function renderB() {
    var list = visible().sort(byRisk);

    var rail = STAGES.map(function (sg) {
      var mine = PEOPLE.filter(function (p) { return p.st === sg.k; });
      var risk = mine.filter(function (p) { return p.s === 'esc' || p.s === 'late'; }).length;
      return '<div class="rb' + (sg.hot ? ' hot' : '') + '">' +
        '<i class="sq" style="background:' + (sg.sq || '#a8a8b2') + '"></i>' +
        '<span class="c">' + mine.length + '</span><span class="l">' + esc(sg.n) + '</span>' +
        (risk ? '<span class="w">' + ico('i-alert') + risk + '</span>' : '') + '</div>';
    }).join('');

    var head = STAGES.map(function (sg) { return '<th>' + esc(sg.n) + '</th>'; }).join('');

    var rows = list.map(function (p) {
      var at = stageIdx(p.st);
      var cells = STAGES.map(function (sg, i) {
        var cls = i < at ? 'node past' : (i === at ? 'node now s-' + p.s : 'node');
        var edge = (i === 0 ? ' first' : '') + (i === STAGES.length - 1 ? ' last' : '') + (i <= at ? ' done' : '');
        return '<td class="cell' + edge + '"><span class="' + cls + '"></span></td>';
      }).join('');
      return '<tr><td class="who"><div class="nm">' + esc(p.nm) + '</div>' +
        '<div class="sub">' + ico('i-clock') + p.d + 'd · ' + esc(p.src) + '</div></td>' + cells +
        '<td class="act s-' + p.s + '">' + (p.why ? '<span class="why">' + esc(p.why) + '</span>' : '') +
        acts(p, p.s === 'esc' || p.s === 'late') + '</td></tr>';
    }).join('');

    document.getElementById('pane-b').innerHTML =
      '<div class="railbar">' + rail + '</div>' +
      '<div class="sheet"><table class="mx"><thead><tr><th>후보자</th>' + head +
      '<th>상태 · 다음 행동</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      note([
        '위 레일이 <b>공고의 단면</b>이다. 숫자가 쌓인 칸이 병목 — 지금은 2차 인터뷰가 붉게 물들어 있다.',
        '아래 한 줄이 <b>후보자 한 명의 궤적</b>. 채운 점은 지나온 단계, 굵은 원이 현재 위치이고 그 색이 조율 상태다.',
        '줄 끝에 항상 <b>다음 행동 하나</b>가 놓인다. 화면을 옮기지 않고 여기서 끝낸다.',
        '기본 정렬은 위험도 순 — 위에서부터 처리하면 된다.'
      ]);
  }

  /* =======================================================
     시안 C — 트리아지 큐
     ======================================================= */
  var open = { idle: false, done: false };

  function renderC() {
    var g = { esc: [], late: [], idle: [], done: [] };
    PEOPLE.forEach(function (p) { g[p.s].push(p); });
    MEETINGS.forEach(function (m) {
      g[m.s].push({ nm: m.n, stLabel: '공고 미팅', icon: 'i-video', d: null, ag: m.ag, s: m.s, why: m.v, act: m.act });
    });

    function row(p) {
      var stg = p.stLabel || (STAGES[stageIdx(p.st)] || {}).n || '';
      return '<div class="qr s-' + p.s + '"><i class="dot"></i>' +
        '<span class="nm">' + esc(p.nm) + '</span>' +
        '<span class="st">' + ico(p.icon || 'i-user') + esc(stg) + '</span>' +
        '<span class="age">' + (p.d === null ? esc(p.ag || '') : p.d + 'd') + '</span>' +
        '<span class="why">' + esc(p.why) + '</span>' +
        '<span class="btns">' + acts(p, true) +
        (p.s === 'esc' || p.s === 'late' ? '<button class="btn quiet">보류</button>' : '') + '</span></div>';
    }

    function block(title, arr, hint) {
      if (!arr.length) return '';
      return '<div class="grp"><div class="sec-h"><h3>' + title + '</h3><span class="n">' + arr.length + '</span>' +
        '<span class="hint">' + hint + '</span></div>' +
        '<div class="sheet">' + arr.map(row).join('') + '</div></div>';
    }

    function fold(title, arr, key, hint) {
      var o = open[key];
      return '<div class="grp"><button class="fold' + (o ? ' open' : '') + '" data-k="' + key + '">' +
        '<i class="dot d-' + key + '"></i><span>' + title + '</span>' +
        '<span class="cnt">' + arr.length + '</span><span class="hint">' + hint + '</span>' +
        '<span class="arw">' + (o ? '접기' : '펼치기') + ico('i-chevron', 'ic-sm') + '</span></button>' +
        (o ? '<div class="sheet">' + arr.map(row).join('') + '</div>' : '') + '</div>';
    }

    var top = g.esc.length
      ? block('지금 처리', g.esc, '자동화가 멈춘 지점입니다')
      : '<div class="zero">' + ico('i-check-circle') +
        '<b>지금 처리할 일이 없습니다</b><span>모든 조율이 자동으로 진행 중입니다</span></div>';

    var pane = document.getElementById('pane-c');
    pane.innerHTML = top +
      block('곧 처리', g.late, '기준 시간을 넘겼습니다') +
      fold('AI 진행 중', g.idle, 'idle', '개입 불필요') +
      fold('완료', g.done, 'done', '기록만 남습니다') +
      note([
        '위에서부터 내려오며 <b>버튼 하나씩만 누르면</b> 된다. 판단에 필요한 건 이름·단계·경과·사유 넉 줄뿐이다.',
        '자동으로 도는 7건과 끝난 3건은 한 줄로 접혀 있다. <b>펼칠 일이 거의 없는 것이 정상</b>이다.',
        '후보자 단계가 아닌 공고 미팅(디브리프)도 같은 줄에 선다. 막힌 것은 종류를 가리지 않는다.',
        '이 화면의 목표 상태는 <b>맨 위 0건</b>이다.'
      ]);

    pane.querySelectorAll('.fold').forEach(function (f) {
      f.addEventListener('click', function () { open[f.getAttribute('data-k')] = !open[f.getAttribute('data-k')]; renderC(); });
    });
  }

  /* ---------- 설명 블록 ---------- */
  function note(items) {
    return '<div class="note"><h4>' + ico('i-info', 'ic-sm') + '이 화면에서 관리하는 법</h4><ul>' +
      items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul></div>';
  }

  /* ---------- 탭 ---------- */
  function renderAll() { renderBar(); renderA(); renderB(); renderC(); }

  var tabs = [].slice.call(document.querySelectorAll('.tab'));
  var panes = [].slice.call(document.querySelectorAll('.pane'));
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () {
      tabs.forEach(function (x, j) { x.classList.toggle('on', i === j); });
      panes.forEach(function (p, j) { p.classList.toggle('on', i === j); });
    });
  });

  renderAll();
})();
