/* =========================================================
   TalentCore ATS — 제품 상세페이지 인터랙션
   ========================================================= */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- NAV : 스크롤 시 경계선 ---------- */
  var nav = document.getElementById('nav');
  function onScroll() {
    nav.classList.toggle('stuck', window.scrollY > 8);
  }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- 스크롤 등장 ---------- */
  var revealables = document.querySelectorAll('.rv');
  if (reduce || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px' });
    revealables.forEach(function (el, i) {
      el.style.transitionDelay = (Math.min(i % 4, 3) * 60) + 'ms';
      io.observe(el);
    });
    // 안전장치 — 어떤 이유로든 관찰이 동작하지 않으면 그냥 보여준다
    setTimeout(function () {
      document.querySelectorAll('.rv:not(.in)').forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 1.2) el.classList.add('in');
      });
    }, 2000);
  }

  /* =======================================================
     히어로 데모 — 면접관이 슬롯을 고르는 순간
     ======================================================= */
  var slotsBox = document.getElementById('demoSlots');
  var confirmBox = document.getElementById('demoConfirm');

  if (slotsBox && confirmBox) {
    var slots = Array.prototype.slice.call(slotsBox.querySelectorAll('.slot'));
    var timers = [];
    var autoplay = true;

    function clearTimers() {
      timers.forEach(clearTimeout);
      timers = [];
    }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    function reset() {
      slots.forEach(function (s) { s.classList.remove('hover', 'picked', 'dim'); });
      confirmBox.classList.remove('on');
    }

    function pick(idx) {
      slots.forEach(function (s, i) {
        s.classList.remove('hover');
        s.classList.toggle('picked', i === idx);
        s.classList.toggle('dim', i !== idx);
      });
      later(function () { confirmBox.classList.add('on'); }, 320);
    }

    function loop() {
      clearTimers();
      reset();
      later(function () { slots[1].classList.add('hover'); }, 1500);
      later(function () { pick(1); }, 2500);
      later(loop, 8200);
    }

    // 사용자가 직접 누르면 자동 재생을 멈추고 그 선택을 보여준다
    slots.forEach(function (s, i) {
      s.addEventListener('click', function () {
        autoplay = false;
        clearTimers();
        reset();
        pick(i);
      });
    });

    if (!reduce) {
      // 화면에 보일 때만 재생
      if ('IntersectionObserver' in window) {
        var demoIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (!autoplay) return;
            if (e.isIntersecting) loop();
            else { clearTimers(); reset(); }
          });
        }, { threshold: 0.25 });
        demoIO.observe(document.getElementById('demo'));
      } else {
        loop();
      }
    } else {
      pick(1);
    }
  }

  /* =======================================================
     작동 방식 스텝퍼
     ======================================================= */
  var stepsBox = document.getElementById('steps');
  if (stepsBox) {
    var steps = Array.prototype.slice.call(stepsBox.querySelectorAll('.step'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('.stage-panel'));
    var cur = 0;
    var autoStep = null;
    var userTouched = false;

    function show(n) {
      cur = n;
      steps.forEach(function (s, i) { s.classList.toggle('on', i === n); });
      panels.forEach(function (p, i) { p.classList.toggle('on', i === n); });
    }

    steps.forEach(function (s, i) {
      s.addEventListener('click', function () {
        userTouched = true;
        if (autoStep) { clearInterval(autoStep); autoStep = null; }
        show(i);
      });
      s.addEventListener('mouseenter', function () {
        if (!userTouched) show(i);
      });
    });

    if (!reduce && 'IntersectionObserver' in window) {
      var howIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (userTouched) return;
          if (e.isIntersecting && !autoStep) {
            autoStep = setInterval(function () {
              show((cur + 1) % steps.length);
            }, 3600);
          } else if (!e.isIntersecting && autoStep) {
            clearInterval(autoStep); autoStep = null;
          }
        });
      }, { threshold: 0.3 });
      howIO.observe(stepsBox);
    }
  }

  /* =======================================================
     시그니처 타임라인
     ======================================================= */
  var tl = document.getElementById('tl');
  var tlDetail = document.getElementById('tlDetail');

  if (tl && tlDetail) {
    var NODES = [
      { s: 'done', h: '지원 접수 · D+0',
        p: '채용 사이트에서 접수됐습니다. 이력서 파싱과 중복 지원 확인이 자동으로 끝났습니다.', a: '지원서 보기' },
      { s: 'done', h: '서류 심사 통과 · D+2',
        p: '리크루터가 통과 처리했습니다. 이 클릭으로 1차 인터뷰 조율이 자동 시작됐습니다.', a: '심사 기록' },
      { s: 'done', h: '1차 인터뷰 완료 · D+6',
        p: '조율 3시간 12분, 사람 개입 없음. 면접관 평가지 2건 모두 제출됐습니다.', a: '평가지 보기' },
      { s: 'done', h: '2차 킥오프 완료 · D+7',
        p: '1차 통과 확정 직후 자동 생성된 30분 회의입니다. 2차에서 볼 항목이 합의됐습니다.', a: '회의록' },
      { s: 'esc', h: '2차 인터뷰 · 면접관 전원 거절 — 재조율이 필요합니다',
        p: 'AI가 슬롯 3개를 두 차례 제안했고 모두 거절됐습니다. 다음 주 범위를 넓혀 재탐색하거나, 직접 조율로 전환하세요.', a: '처리하기' },
      { s: '', h: '디브리프 · 대기',
        p: '2차 인터뷰가 확정되면 종료 직후 30분 슬롯을 자동으로 잡습니다. 지금은 할 일이 없습니다.', a: null },
      { s: '', h: '처우 협의 · 대기',
        p: '디브리프에서 합격으로 결론이 나면 리크루터에게 처우 협의 카드가 생성됩니다.', a: null },
      { s: '', h: '오퍼 · 대기',
        p: '오퍼가 수락되면 TalentCore에 입사 예정자로 자동 생성되고 온보딩이 시작됩니다.', a: null }
    ];

    var nodes = Array.prototype.slice.call(tl.querySelectorAll('.tl-node'));

    function renderDetail(i) {
      var d = NODES[i];
      tlDetail.classList.remove('is-esc', 'is-ai');
      if (d.s === 'esc') tlDetail.classList.add('is-esc');
      if (d.s === 'ai') tlDetail.classList.add('is-ai');
      tlDetail.innerHTML =
        '<div><div class="h">' + d.h + '</div><div class="p">' + d.p + '</div></div>' +
        (d.a ? '<div class="act"><span class="btn btn-primary btn-sm">' + d.a + '</span></div>' : '');
    }

    nodes.forEach(function (n, i) {
      n.addEventListener('click', function () { renderDetail(i); });
      n.addEventListener('mouseenter', function () { renderDetail(i); });
    });
    tl.addEventListener('mouseleave', function () { renderDetail(4); });
  }

  /* =======================================================
     역할별 화면 탭
     ======================================================= */
  var roleTabs = document.getElementById('roleTabs');
  if (roleTabs) {
    var tabs = Array.prototype.slice.call(roleTabs.querySelectorAll('.role-tab'));
    var rpanels = Array.prototype.slice.call(document.querySelectorAll('.role-panel'));
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () {
        tabs.forEach(function (x, j) { x.classList.toggle('on', i === j); });
        rpanels.forEach(function (p, j) { p.classList.toggle('on', i === j); });
      });
    });
  }

  /* ---------- 현재 시각 표시 ---------- */
  var demoTime = document.getElementById('demoTime');
  if (demoTime) {
    var now = new Date();
    var h = now.getHours();
    var ap = h < 12 ? '오전' : '오후';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    demoTime.textContent = ap + ' ' + h12 + ':' + String(now.getMinutes()).padStart(2, '0');
  }
})();
