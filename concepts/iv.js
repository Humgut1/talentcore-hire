/* =========================================================
   Cadence — 면접관 화면 상호작용
   ES5만 사용 (app.js와 동일 규칙)
   ========================================================= */
(function () {
  'use strict';

  function $1(s, r) { return (r || document).querySelector(s); }
  function $a(s, r) { var n = (r || document).querySelectorAll(s), o = [], i;
                      for (i = 0; i < n.length; i++) o.push(n[i]); return o; }
  function ico(id, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '"><use href="#' + id + '"/></svg>'; }

  /* ---------- 토스트 ---------- */
  function toast(msg, undo) {
    var w = $1('#toasts');
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = ico('i-check-circle') + '<span>' + msg + '</span>' +
                   (undo ? '<button>되돌리기</button>' : '');
    w.appendChild(el);
    var t = setTimeout(kill, undo ? 6000 : 3200);
    function kill() { el.classList.add('out'); setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el); }, 220); }
    if (undo) {
      $1('button', el).addEventListener('click', function () {
        clearTimeout(t); kill(); undo();
      });
    }
  }

  /* =========================================================
     화면 전환
     ========================================================= */
  function show(n) {
    $a('.stab').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-p') === n); });
    $a('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p' + n); });
    window.scrollTo(0, 0);
    if (location.hash !== '#' + n) history.replaceState(null, '', '#' + n);
  }
  $a('.stab').forEach(function (b) {
    b.addEventListener('click', function () { show(b.getAttribute('data-p')); });
  });

  /* =========================================================
     ① 슬롯 선택 카드
     ========================================================= */
  var scOrig = $1('#scIn').innerHTML;

  function scReset() {
    var card = $1('#sc');
    card.className = 'sc';
    $1('#scIn').innerHTML = scOrig;
    $1('#scSys').innerHTML = '';
    wireSc();
  }

  function line(icon, txt) {
    return '<div>' + ico(icon) + '<span>' + txt + '</span></div>';
  }

  function scConfirm(t, d) {
    var card = $1('#sc');
    card.className = 'sc is-done';
    $1('#scIn').innerHTML =
      '<div class="dn-h"><span class="ck">' + ico('i-check-circle') + '</span>' +
        '<span class="tt"><b>' + t + ' 확정</b><span>임채원 · 1차 인터뷰 · 60분 · 화상</span></span></div>' +
      '<div class="dn-l">' +
        line('i-calendar', '캘린더 인비를 보냈습니다 — 수락하지 않으셔도 확정입니다') +
        line('i-users', '최영수님께도 같은 시간으로 발송했습니다') +
        line('i-video', '화상 링크가 자동 생성되어 인비에 포함됐습니다') +
        line('i-mail', '임채원님께 안내 메일이 나갔습니다') +
      '</div>' +
      '<div class="sc-f" style="margin-top:13px">' +
        '<button class="btn" id="scCancel">시간 변경 요청</button>' +
        '<button class="btn quiet" id="scAgain">다시 보기</button></div>' +
      '<div class="sc-note">' + ico('i-info') +
        '<span>면접 12시간 전과 4시간 전에 리마인드가 갑니다. ' +
        '<b>브리핑은 면접 하루 전에 열립니다.</b></span></div>';

    $1('#scSys').innerHTML =
      '<div class="sys">' + ico('i-check-circle') +
      '<span>Cadence · 방금 — 조율이 끝났습니다. 리크루터 정수민님 화면에서 이 후보자는 초록으로 바뀌었습니다.</span></div>';

    $1('#scCancel').addEventListener('click', function () {
      toast('코디네이터 <b>배수진</b>님에게 변경 요청을 보냈습니다 · 후보자에게는 아직 알리지 않았습니다');
    });
    $1('#scAgain').addEventListener('click', scReset);
    toast('<b>' + t + '</b> 확정 · 캘린더 인비 발송 완료', function () {
      scReset(); toast('확정을 취소했습니다');
    });
  }

  function scDecline() {
    var card = $1('#sc');
    card.className = 'sc is-no';
    $1('#scIn').innerHTML =
      '<div class="dn-h no"><span class="ck">' + ico('i-refresh') + '</span>' +
        '<span class="tt"><b>다른 시간을 다시 찾고 있습니다</b><span>알려주지 않으셔도 됩니다</span></span></div>' +
      '<div class="dn-l">' +
        '<div><span class="n">1</span><span>탐색 범위를 영업일 <b>10일 → 15일</b>로 넓혔습니다</span></div>' +
        '<div><span class="n">2</span><span>최영수님께 조정 가능 여부를 다시 물었습니다</span></div>' +
        '<div><span class="n">3</span><span>24시간 안에 못 찾으면 코디네이터 <b>배수진</b>님이 직접 연락드립니다</span></div>' +
      '</div>' +
      '<div class="sc-f" style="margin-top:13px">' +
        '<button class="btn br" id="scTell">가능한 시간 직접 알려주기</button>' +
        '<button class="btn quiet" id="scAgain">다시 보기</button></div>' +
      '<div class="sc-note">' + ico('i-info') +
        '<span>임채원님께는 아직 아무 것도 안내되지 않았습니다. ' +
        '<b>후보자는 이 과정을 보지 못합니다.</b></span></div>';

    $1('#scSys').innerHTML =
      '<div class="sys" style="color:var(--late)">' + ico('i-alert') +
      '<span style="color:var(--t4)">Cadence · 방금 — 리크루터 화면의 임채원 카드가 <b>지연</b>으로 바뀌었습니다.</span></div>';
    $1('#scSys .ic').style.color = 'var(--late)';

    $1('#scTell').addEventListener('click', function () {
      toast('가용 시간 화면을 열었습니다 · 여기서 끈 시간에는 제안이 가지 않습니다');
      show('4');
    });
    $1('#scAgain').addEventListener('click', scReset);
    toast('세 개 다 어렵다고 전달했습니다 · 재탐색을 시작합니다');
  }

  function wireSc() {
    $a('#sc .slot').forEach(function (b) {
      b.addEventListener('click', function () {
        scConfirm(b.getAttribute('data-t'), b.getAttribute('data-d'));
      });
    });
    var no = $1('#scNo');
    if (no) no.addEventListener('click', scDecline);
  }
  wireSc();

  /* =========================================================
     ③ 평가 제출
     ========================================================= */
  var scores = {}, result = null;

  function evSync() {
    var ks = Object.keys(scores), n = ks.length, i, sum = 0;
    for (i = 0; i < n; i++) sum += scores[ks[i]];
    var v = $1('#avgV'), l = $1('#avgL');
    if (n === 4) {
      v.textContent = (sum / 4).toFixed(1);
      v.className = 'v';
      l.textContent = '4개 항목 평균';
    } else {
      v.textContent = n ? (sum / n).toFixed(1) : '—';
      v.className = 'v dim';
      l.textContent = '4개 항목 중 ' + n + '개 입력';
    }
    $1('#evSub').disabled = !(n === 4 && result);
  }

  var evOrig = $1('#evR').innerHTML;

  function evSubmit() {
    var ks = Object.keys(scores), sum = 0, i;
    for (i = 0; i < ks.length; i++) sum += scores[ks[i]];
    var avg = (sum / 4).toFixed(1);
    var next = result === 'Pass' ? '2차 인터뷰로 이동했고, <b>2시간 연속 블록</b> 탐색이 방금 시작됐습니다.'
             : result === 'Hold' ? '보류로 표시했습니다. 리크루터 정수민님의 <b>조율 처리함</b>으로 넘어갔습니다.'
             : '불합격으로 처리했습니다. 통보 메일은 <b>자동 발송되지 않고</b> 초안만 생성됐습니다.';

    $1('#evR').innerHTML =
      '<div class="ev-done"><span class="ck">' + ico('i-check-circle') + '</span>' +
        '<h3>제출했습니다</h3>' +
        '<p>임채원 · 1차 인터뷰<br><b style="color:var(--t1)">' + avg + '점 · ' + result + '</b></p>' +
        '<p>' + next + '</p>' +
        '<p style="color:var(--t4);font-size:11.5px">최영수님이 제출하면 두 평가가 서로 공개되고, 디브리프 안건이 자동으로 만들어집니다.</p>' +
        '<button class="btn quiet" id="evAgain" style="margin-top:16px">다시 작성해보기</button></div>';

    $1('#evAgain').addEventListener('click', function () {
      $1('#evR').innerHTML = evOrig;
      scores = {}; result = null;
      wireEv(); evSync();
    });

    toast('평가를 제출했습니다 · <b>' + avg + '점 · ' + result + '</b>');
  }

  function wireEv() {
    $a('#crits .scale button').forEach(function (b) {
      b.addEventListener('click', function () {
        var crit = b.parentNode.parentNode;
        $a('.scale button', crit).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        scores[crit.getAttribute('data-c')] = parseInt(b.getAttribute('data-v'), 10);
        evSync();
      });
    });
    $a('#res button').forEach(function (b) {
      b.addEventListener('click', function () {
        $a('#res button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        result = b.getAttribute('data-r');
        evSync();
      });
    });
    $1('#evSub').addEventListener('click', evSubmit);
  }
  wireEv();

  /* =========================================================
     ④ 가용 시간 그리드
     ========================================================= */
  var DAYS = ['월', '화', '수', '목', '금'];
  var HOURS = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
  /* 캘린더에 이미 일정이 있는 칸 (요일 index, 시간 index) */
  var BUSY = { '0-2': 1, '1-2': 1, '2-2': 1, '3-2': 1, '4-2': 1,   /* 점심 */
               '0-0': 1, '2-5': 1, '2-6': 1, '4-3': 1, '4-4': 1 };
  /* 기본으로 꺼둔 칸 */
  var OFF  = { '0-7': 1, '1-7': 1, '2-7': 1, '3-7': 1, '4-7': 1,
               '4-5': 1, '4-6': 1 };

  (function buildGrid() {
    var t = $1('#avgT'), h = '', d, r, k;
    h += '<div></div>';
    for (d = 0; d < 5; d++) h += '<div class="hh">' + DAYS[d] + '</div>';
    for (r = 0; r < HOURS.length; r++) {
      h += '<div class="rr">' + HOURS[r] + '</div>';
      for (d = 0; d < 5; d++) {
        k = d + '-' + r;
        h += '<button class="cel' + (BUSY[k] ? ' busy' : OFF[k] ? ' off' : '') +
             '" data-k="' + k + '" title="' + DAYS[d] + ' ' + HOURS[r] + '"></button>';
      }
    }
    t.innerHTML = h;

    $a('.cel', t).forEach(function (c) {
      c.addEventListener('click', function () {
        if (c.classList.contains('busy')) return;
        c.classList.toggle('off');
      });
    });
  }());

  /* =========================================================
     공통 배선
     ========================================================= */
  document.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== document) {
      if (t.getAttribute && t.getAttribute('data-toast')) {
        e.preventDefault(); toast(t.getAttribute('data-toast')); return;
      }
      if (t.getAttribute && t.getAttribute('data-go')) {
        e.preventDefault(); show(t.getAttribute('data-go')); return;
      }
      if (t.getAttribute && t.hasAttribute('data-sw')) {
        t.classList.toggle('on'); return;
      }
      t = t.parentNode;
    }
  });

  /* 진입 시 해시 반영 */
  var h = (location.hash || '#1').replace('#', '');
  if (['1', '2', '3', '4'].indexOf(h) >= 0) show(h);
}());
