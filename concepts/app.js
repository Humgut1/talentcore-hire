/* =========================================================
   Cadence — 앱 셸 · 라우터 · 화면
   ========================================================= */
(function () {
'use strict';

/* ---------------------------------------------------------
   유틸
--------------------------------------------------------- */
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
function ico(id,cls){ return '<svg class="ic'+(cls?' '+cls:'')+'"><use href="#'+id+'"/></svg>'; }
function $(s,r){ return (r||document).querySelector(s); }
function $$(s,r){ return [].slice.call((r||document).querySelectorAll(s)); }
function on(sel,ev,fn,root){ $$(sel,root).forEach(function(e){ e.addEventListener(ev,fn); }); }
function md(d){ var p=String(d).split('-'); return (+p[1])+'/'+(+p[2]); }
function daysSince(d){ var p=String(d).split('-');
  return Math.round((TODAY - new Date(+p[0],+p[1]-1,+p[2]))/864e5); }
function company(role){ var p=String(role).split('·'); return p[p.length-1].trim(); }

function stagesOf(pid){ return DB.stages[pid] || DB.stages.p1; }
function stageById(pid,sid){ return stagesOf(pid).filter(function(s){return s.id===sid;})[0] || {nm:'—',color:'#a8a8b2'}; }
function candsOf(pid){ return DB.cands.filter(function(c){ return c.p===pid; }); }
function activeCands(pid){ return candsOf(pid).filter(function(c){
  var s=stageById(pid,c.st); return !s.rail; }); }
function posById(id){ return DB.positions.filter(function(p){return p.id===id;})[0]; }
function personByName(nm){ return DB.people.filter(function(p){return p.nm===nm;})[0]; }
function byRisk(a,b){ return (ORDER[a.s]-ORDER[b.s]) || (b.d-a.d); }

/* 조율 처리함 — 전 공고 에스컬레이션 */
function inboxItems(){
  var out=[];
  DB.cands.forEach(function(c){
    if(c.s==='esc'||c.s==='late') out.push({k:'cand',ref:c,s:c.s,nm:c.nm,
      st:stageById(c.p,c.st).nm, pos:posById(c.p).title, ag:c.d+'d', why:c.why, act:c.act});
  });
  Object.keys(DB.meetings).forEach(function(pid){
    DB.meetings[pid].forEach(function(m){
      if(m.s==='esc'||m.s==='late') out.push({k:'mtg',ref:m,s:m.s,nm:m.nm,
        st:'공고 미팅', pos:posById(pid).title, ag:m.ag, why:m.v, act:m.act});
    });
  });
  return out.sort(function(a,b){ return ORDER[a.s]-ORDER[b.s]; });
}

/* ---------------------------------------------------------
   토스트
--------------------------------------------------------- */
function toast(msg, undo){
  var w=$('#toasts');
  var t=document.createElement('div');
  t.className='toast';
  t.innerHTML=ico('i-check-circle')+'<span>'+msg+'</span>'+(undo?'<button>되돌리기</button>':'');
  w.appendChild(t);
  var kill=setTimeout(close, undo?6000:3200);
  function close(){ clearTimeout(kill); t.classList.add('out'); setTimeout(function(){ t.remove(); },200); }
  if(undo) t.querySelector('button').addEventListener('click',function(){ undo(); close(); });
  return close;
}

/* ---------------------------------------------------------
   드로어
--------------------------------------------------------- */
function closeOverlay(){ $$('.scrim,.drawer,.modal').forEach(function(e){ e.remove(); }); }
function drawer(title, sub, body, foot){
  closeOverlay();
  var s=document.createElement('div'); s.className='scrim'; s.addEventListener('click',closeOverlay);
  var d=document.createElement('div'); d.className='drawer';
  d.innerHTML='<div class="drawer-h"><div><h2>'+title+'</h2>'+(sub?'<div class="sub">'+sub+'</div>':'')+
    '</div><button class="x">'+ico('i-x')+'</button></div>'+
    '<div class="drawer-b">'+body+'</div>'+(foot?'<div class="drawer-f">'+foot+'</div>':'');
  document.body.appendChild(s); document.body.appendChild(d);
  d.querySelector('.x').addEventListener('click',closeOverlay);
  return d;
}
document.addEventListener('keydown',function(e){ if(e.key==='Escape') closeOverlay(); });

/* =========================================================
   사이드바
   ========================================================= */
var NAV=[
  { t:'내 화면', is:[
    { r:'#/inbox',      i:'i-inbox',     n:'조율 처리함', b:'esc' },
    { r:'#/positions',  i:'i-star',      n:'내 포지션' },
    { r:'#/todo',       i:'i-check-sq',  n:'내 할 일',    b:'todo' }
  ]},
  { t:'채용', is:[
    { r:'#/positions',  i:'i-briefcase', n:'공고' },
    { r:'#/candidates', i:'i-users',     n:'후보자' },
    { r:'#/schedule',   i:'i-calendar',  n:'일정' },
    { r:'#/evals',      i:'i-check-sq',  n:'평가' },
    { r:'#/offers',     i:'i-flag',      n:'오퍼' },
    { r:'#/interviewers', i:'i-user',    n:'면접관' }
  ]},
  { t:'운영', is:[
    { r:'#/dashboard',  i:'i-chart',     n:'대시보드' },
    { r:'#/export',     i:'i-download',  n:'내보내기' },
    { r:'#/settings',   i:'i-sliders',   n:'설정' }
  ]}
];

function renderSide(route){
  var esCount=inboxItems().length;
  var html='<div class="brand"><span class="brand-mark"><svg viewBox="0 0 24 24"><use href="#i-mark"/></svg></span>'+
    '<span class="brand-name">Cadence</span><span class="brand-tag">임시명</span></div>';
  NAV.forEach(function(sec){
    html+='<div class="nav-sec"><p>'+sec.t+'</p>';
    sec.is.forEach(function(it){
      var active = route.indexOf(it.r.slice(1))===0 ||
        (it.r==='#/positions' && route.indexOf('/p/')===0);
      var badge = it.b==='esc' ? '<span class="badge">'+esCount+'</span>'
                : it.b==='todo' ? '<span class="badge mute">2</span>' : '';
      html+='<a class="nav-i'+(active?' on':'')+'" href="'+it.r+'">'+ico(it.i)+esc(it.n)+badge+'</a>';
    });
    html+='</div>';
  });
  html+='<div class="side-foot"><span class="avatar">'+DB.me.init+'</span><div>'+
    '<div class="who">'+DB.me.name+'</div><div class="role">'+DB.me.role+'</div></div></div>';
  $('#side').innerHTML=html;
}

/* =========================================================
   공고 헤더 (공고 하위 화면 공통)
   ========================================================= */
function posHeader(pid, tab){
  var p=posById(pid), cs=activeCands(pid);
  var risk=cs.filter(function(c){return c.s==='esc'||c.s==='late';}).length;
  var st={open:['ok','오픈'],hold:['warn','홀드'],closed:['','마감']}[p.st];
  var tabs=[
    ['board','파이프라인','i-columns', cs.length],
    ['progress','진행 매트릭스','i-rows', null],
    ['setup','공고 설정','i-sliders', null],
    ['auto','자동화','i-zap', null],
    ['links','지원 링크','i-link', null]
  ];
  return '<header class="top">'+
    '<div class="crumb">'+ico('i-briefcase','ic-sm')+'<a href="#/positions">공고</a>'+
      '<span class="sep">/</span>'+esc(p.dept)+'<span class="sep">/</span>'+esc(p.team)+'</div>'+
    '<div class="h-row"><h1>'+esc(p.title)+'</h1>'+
      '<span class="pill '+st[0]+'"><i class="dot"></i>'+st[1]+'</span>'+
      (risk?'<span class="pill bad">'+ico('i-alert','ic-sm')+'사람 대기 '+risk+'</span>':'')+
      '<div class="spacer">'+
        '<button class="btn" data-act="share">'+ico('i-link','ic-sm')+'지원 링크</button>'+
        '<button class="btn br" data-act="addcand">'+ico('i-plus','ic-sm')+'후보자 추가</button>'+
      '</div></div>'+
    '<div class="meta">'+
      '<i>'+ico('i-users','ic-sm')+esc(p.dept)+' <b>'+esc(p.team)+'</b></i>'+
      '<i>'+ico('i-user','ic-sm')+'리크루터 <b>'+esc(p.rec)+'</b></i>'+
      '<i>'+ico('i-star','ic-sm')+'HM <b>'+esc(p.hm)+'</b></i>'+
      '<i>'+ico('i-clock','ic-sm')+'오픈 <b>D+'+p.ttf+'</b></i>'+
      '<i>'+ico('i-briefcase','ic-sm')+'고용형태 <b>'+esc(p.emp)+'</b></i>'+
    '</div>'+
    '<nav class="tabs">'+tabs.map(function(t){
      return '<a class="tab'+(tab===t[0]?' on':'')+'" href="#/p/'+pid+'/'+t[0]+'">'+ico(t[2],'ic-sm')+t[1]+
        (t[3]!=null?'<span class="cnt">'+t[3]+'</span>':'')+'</a>'; }).join('')+'</nav>'+
    '</header>';
}

/* =========================================================
   C-3 파이프라인 — 칸반 보드 ★
   ========================================================= */
var boardState = { filter:null, hideIdle:false, pid:'p1' };

function meetingBar(pid){
  var counts={esc:0,late:0,idle:0,done:0};
  candsOf(pid).forEach(function(c){ counts[c.s]++; });
  (DB.meetings[pid]||[]).forEach(function(m){ counts[m.s]++; });
  var mt=(DB.meetings[pid]||[]).map(function(m){
    return '<div class="mtg s-'+m.s+'"><i class="dot"></i><span class="mtg-n">'+esc(m.nm)+'</span>'+
      '<span class="mtg-v">'+esc(m.v)+(m.ag!=='—'?' · '+esc(m.ag):'')+'</span>'+
      (m.act?'<button class="btn solid" data-mtg="'+m.id+'">'+esc(m.act[0])+'</button>':'')+'</div>';
  }).join('');
  var chips=['esc','late','idle','done'].map(function(k){
    return '<button class="chip'+(boardState.filter===k?' on':'')+'" data-f="'+k+'">'+
      '<i class="dot d-'+k+'"></i>'+LABEL[k]+' <b>'+counts[k]+'</b></button>'; }).join('');
  return '<div class="bar"><span class="bar-label">'+ico('i-video','ic-sm')+'공고 미팅</span>'+mt+
    '<div class="chips">'+chips+'</div></div>';
}

function cardHTML(c){
  var reason = (c.s!=='idle' && c.why)
    ? '<div class="card-r">'+ico(c.s==='esc'?'i-alert':c.s==='late'?'i-clock':'i-check-circle')+esc(c.why)+'</div>' : '';
  var act = (c.s==='esc'||c.s==='late') && c.act
    ? '<div class="card-act"><button class="btn solid" data-do="'+c.id+'">'+esc(c.act[0])+'</button>'+
      '<button class="btn" data-open="'+c.id+'">보기</button></div>' : '';
  return '<div class="card s-'+c.s+'" draggable="true" data-c="'+c.id+'">'+
    '<div class="card-t"><i class="dot"></i><span class="nm">'+esc(c.nm)+'</span>'+
      '<span class="age">'+ico('i-clock')+c.d+'d</span></div>'+
    '<div class="card-sub">'+c.yr+'년차 · '+esc(company(c.role))+'</div>'+
    reason+
    '<div class="card-f"><span class="in-date">'+ico('i-calendar')+md(c.ap)+' 유입</span>'+
      '<span class="src">'+esc(c.src)+'</span></div>'+
    act+'</div>';
}

function viewBoard(pid){
  boardState.pid=pid;
  var stages=stagesOf(pid);
  var list=candsOf(pid).filter(function(c){ return !boardState.filter || c.s===boardState.filter; });
  var idleN=list.filter(function(c){ return c.s==='idle' && !stageById(pid,c.st).rail; }).length;

  var rails='';
  var cols=stages.map(function(sg){
    var mine=list.filter(function(c){ return c.st===sg.id; }).sort(byRisk);
    if(sg.rail){
      rails+='<div class="rail" data-st="'+sg.id+'">'+ico(sg.kind==='hired'?'i-check-circle':'i-alert')+
        '<span class="v">'+esc(sg.nm)+'</span><span class="n">'+mine.length+'</span></div>';
      return '';
    }
    var risk=mine.filter(function(c){return c.s==='esc'||c.s==='late';}).length;
    var shown=boardState.hideIdle ? mine.filter(function(c){return c.s!=='idle';}) : mine;
    var hidden=mine.length-shown.length;
    var dwell=mine.length ? (mine.reduce(function(a,c){return a+c.d;},0)/mine.length).toFixed(1) : '0.0';
    var over=+dwell > sg.sla*1.4 && mine.length>0;
    return '<div class="col" data-st="'+sg.id+'">'+
      '<div class="col-h"><i class="sq" style="background:'+sg.color+'"></i><h3>'+esc(sg.nm)+'</h3>'+
        '<span class="n">'+mine.length+'</span>'+
        (risk?'<span class="risk">'+ico('i-alert')+risk+'</span>':'')+
        '<button class="add" data-add="'+sg.id+'" title="후보자 추가">'+ico('i-plus','ic-sm')+'</button></div>'+
      '<div class="col-b">'+ (shown.map(cardHTML).join('') || '<div class="drop-hint">여기로 끌어 놓기</div>') +
        (hidden?'<span class="col-hidden">'+ico('i-eye-off','ic-sm')+'AI '+hidden+'건</span>':'')+'</div>'+
      '<div class="col-f'+(over?' warn':'')+'"><span>평균 체류 / 기준 '+sg.sla+'d</span><b>'+dwell+'d</b></div>'+
      '</div>';
  }).join('');

  return posHeader(pid,'board') + meetingBar(pid) +
    '<div class="stage">'+
      '<div class="sec-h"><h3>후보자</h3><span class="n">'+
        candsOf(pid).filter(function(c){return !stageById(pid,c.st).rail;}).length+'명 진행 중</span>'+
        '<span class="hint">'+ico('i-grip','ic-sm')+' 카드를 끌어 단계를 옮깁니다</span>'+
        '<div class="right">'+
          '<button class="btn quiet" id="hideIdle">'+ico('i-eye-off','ic-sm')+
            (boardState.hideIdle?'AI 진행 중 다시 보기':'AI 진행 중 '+idleN+'건 숨기기')+'</button>'+
          '<a class="btn" href="#/p/'+pid+'/setup">'+ico('i-sliders','ic-sm')+'단계 편집</a>'+
        '</div></div>'+
      '<div class="board">'+cols+'<div class="rails">'+rails+'</div></div>'+
      note([
        '색이 붙은 카드만 본다 — <b>빨강은 지금, 주황은 오늘 안에</b>. 회색은 자동으로 돌고 있다.',
        '카드에는 <b>이름 · 단계 체류일 · 유입일 · 출처</b>만 있다. 예외일 때만 사유 한 줄이 붙는다.',
        '카드를 옆 열로 끌면 단계가 넘어가고 <b>그 즉시 다음 조율이 자동으로 시작</b>된다. 되돌리기는 6초간 유효하다.',
        '단계 자체를 바꾸려면 <b>단계 편집</b> — 이름·순서·기준일·면접 길이·면접관을 공고마다 다르게 둘 수 있다.'
      ])+
      '<p class="disclaimer">※ 화면은 기능 설명을 위한 예시 데이터입니다. 실제 지표가 아닙니다.</p>'+
    '</div>';
}

/* --------- 보드 이벤트 (드래그 포함) --------- */
function wireBoard(){
  var pid=boardState.pid;

  on('.chip','click',function(e){
    var k=e.currentTarget.getAttribute('data-f');
    boardState.filter = boardState.filter===k ? null : k; render();
  });
  var h=$('#hideIdle');
  if(h) h.addEventListener('click',function(){ boardState.hideIdle=!boardState.hideIdle; render(); });

  on('[data-open]','click',function(e){ e.stopPropagation();
    location.hash='#/c/'+e.currentTarget.getAttribute('data-open'); });
  on('[data-do]','click',function(e){ e.stopPropagation();
    var c=DB.cands.filter(function(x){return x.id===e.currentTarget.getAttribute('data-do');})[0];
    var prev={s:c.s,why:c.why};
    c.s='idle'; c.why=c.act[0]+' 실행됨';
    render(); toast('<b>'+esc(c.nm)+'</b> · '+esc(prev.why)+' → 처리했습니다', function(){
      c.s=prev.s; c.why=prev.why; render(); });
  });
  on('[data-mtg]','click',function(e){
    toast('HM에게 <b>참석자 지정</b>을 요청했습니다 · Slack 발송'); });
  on('[data-add]','click',function(e){ e.stopPropagation();
    var sg=stageById(pid,e.currentTarget.getAttribute('data-add'));
    toast('<b>'+esc(sg.nm)+'</b> 단계에 후보자를 추가합니다'); });

  on('.card','click',function(e){
    if(e.target.closest('button')) return;
    location.hash='#/c/'+e.currentTarget.getAttribute('data-c'); });

  /* ---- HTML5 드래그 앤 드롭 ---- */
  var dragId=null;
  on('.card','dragstart',function(e){
    dragId=e.currentTarget.getAttribute('data-c');
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed='move';
    try{ e.dataTransfer.setData('text/plain',dragId); }catch(_){}
  });
  on('.card','dragend',function(e){
    e.currentTarget.classList.remove('dragging');
    $$('.col.over,.rail.over').forEach(function(x){ x.classList.remove('over'); });
    dragId=null;
  });
  $$('.col,.rail').forEach(function(z){
    z.addEventListener('dragover',function(e){ e.preventDefault(); e.dataTransfer.dropEffect='move';
      z.classList.add('over'); });
    z.addEventListener('dragleave',function(e){
      if(!z.contains(e.relatedTarget)) z.classList.remove('over'); });
    z.addEventListener('drop',function(e){
      e.preventDefault(); z.classList.remove('over');
      var id=dragId || e.dataTransfer.getData('text/plain');
      var c=DB.cands.filter(function(x){return x.id===id;})[0];
      if(!c) return;
      var to=z.getAttribute('data-st');
      if(to===c.st) return;
      moveCandidate(c,to);
    });
  });
}

/* 단계 이동 — 이동 후 자동화가 무엇을 시작하는지까지 말해준다 */
function moveCandidate(c,to){
  var pid=c.p, from=c.st, prev={st:c.st,s:c.s,why:c.why,d:c.d,en:c.en};
  var sg=stageById(pid,to);
  c.st=to; c.d=0; c.en='2026-08-12';

  if(sg.kind==='interview'){
    var eaBlocked=(sg.ivs||[]).some(function(uid){
      var u=DB.people.filter(function(p){return p.id===uid;})[0]; return u&&u.ea; });
    if(eaBlocked){ c.s='esc'; c.why='EA 조율 · 자동화 제외'; c.act=['코디네이터 배정','직접 조율']; }
    else { c.s='idle'; c.why=sg.dur+'분 블록 탐색 중'; c.act=null; }
  } else if(sg.kind==='offer'){ c.s='idle'; c.why='오퍼 승인 대기'; c.act=null; }
  else if(sg.kind==='hired'){ c.s='done'; c.why='입사 확정'; c.act=null; }
  else if(sg.kind==='reject'){ c.s='done'; c.why='불합격 처리'; c.act=null; }
  else if(sg.kind==='screen'){ c.s='idle'; c.why='HM 검토 요청 발송'; c.act=null; }
  else { c.s='idle'; c.why=''; c.act=null; }

  render();
  var tail = sg.kind==='interview'
    ? (c.s==='esc' ? ' · <b>EA 조율 대상이라 코디네이터로 넘겼습니다</b>' : ' · '+sg.dur+'분 교집합 탐색을 시작했습니다')
    : sg.kind==='screen' ? ' · HM에게 검토를 요청했습니다'
    : sg.kind==='reject' ? ' · 통보 메일 초안을 만들었습니다' : '';
  toast('<b>'+esc(c.nm)+'</b> → '+esc(sg.nm)+tail, function(){
    c.st=prev.st; c.s=prev.s; c.why=prev.why; c.d=prev.d; c.en=prev.en; render();
    toast('되돌렸습니다 · '+esc(stageById(pid,from).nm));
  });
}

/* =========================================================
   진행 매트릭스 (보조 뷰)
   ========================================================= */
function viewProgress(pid){
  var stages=stagesOf(pid).filter(function(s){ return s.kind!=='reject'; });
  var list=activeCands(pid).concat(candsOf(pid).filter(function(c){
    return stageById(pid,c.st).kind==='hired'; })).sort(byRisk);

  var rail=stages.map(function(sg){
    var mine=candsOf(pid).filter(function(c){return c.st===sg.id;});
    var risk=mine.filter(function(c){return c.s==='esc'||c.s==='late';}).length;
    var hot=risk>0 && mine.length>1;
    return '<div class="rb'+(hot?' hot':'')+'"><i class="sq" style="background:'+sg.color+'"></i>'+
      '<span class="c">'+mine.length+'</span><span class="l">'+esc(sg.nm)+'</span>'+
      (risk?'<span class="w">'+ico('i-alert')+risk+'</span>':'')+'</div>'; }).join('');

  var head=stages.map(function(s){ return '<th>'+esc(s.nm)+'</th>'; }).join('');
  var idx={}; stages.forEach(function(s,i){ idx[s.id]=i; });

  var rows=list.map(function(c){
    var at=idx[c.st]||0;
    var cells=stages.map(function(sg,i){
      var cls=i<at?'node past':(i===at?'node now s-'+c.s:'node');
      var edge=(i===0?' first':'')+(i===stages.length-1?' last':'')+(i<=at?' done':'');
      return '<td class="cell'+edge+'"><span class="'+cls+'"></span></td>'; }).join('');
    return '<tr data-c="'+c.id+'"><td class="who"><div class="nm">'+esc(c.nm)+'</div>'+
      '<div class="sub">'+ico('i-calendar')+md(c.ap)+' 유입 · '+ico('i-clock')+c.d+'d · '+esc(c.src)+'</div></td>'+
      cells+'<td class="act s-'+c.s+'">'+(c.why?'<span class="why">'+esc(c.why)+'</span>':'')+
      (c.act?c.act.map(function(a,i){return '<button class="btn'+(i===0?' solid':'')+'">'+esc(a)+'</button>';}).join('')
            :'<button class="btn quiet">보기</button>')+'</td></tr>'; }).join('');

  return posHeader(pid,'progress')+
    '<div class="stage">'+
      '<div class="railbar">'+rail+'</div>'+
      '<div class="sheet"><table class="mx"><thead><tr><th>후보자</th>'+head+
        '<th>상태 · 다음 행동</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      note([
        '위 레일이 <b>공고의 단면</b>이다. 숫자가 쌓이고 붉어진 칸이 병목이다.',
        '아래 한 줄이 <b>후보자 한 명의 궤적</b>. 굵은 원이 현재 위치이고 그 색이 조율 상태다.',
        '보드가 "지금 무엇을 할까"라면, 이 표는 <b>"이 공고가 어디서 막히는가"</b>에 답한다.'
      ])+
    '</div>';
}

/* =========================================================
   C-2 공고 설정 — 전형 단계 커스터마이즈 ★
   ========================================================= */
var PRESETS=[
  { nm:'사전 과제',   kind:'task',      sla:5, dur:0,   mode:'—' },
  { nm:'컬처핏 인터뷰', kind:'interview', sla:4, dur:60,  mode:'화상' },
  { nm:'실무 인터뷰', kind:'interview', sla:5, dur:90,  mode:'대면' },
  { nm:'레퍼런스 체크', kind:'screen',  sla:3, dur:0,   mode:'—' },
  { nm:'임원 면접',   kind:'interview', sla:7, dur:60,  mode:'대면' },
  { nm:'처우 협의',   kind:'offer',     sla:3, dur:0,   mode:'—' }
];
var RAMP=['#c3c5e2','#b0b3e3','#9a9be4','#8b8ce2','#7d7be0','#6e6bda','#5b53d6'];

function recolor(pid){
  var st=stagesOf(pid).filter(function(s){ return !s.rail; });
  st.forEach(function(s,i){ s.color = RAMP[Math.min(i, RAMP.length-1)]; });
}

function viewSetup(pid){
  var p=posById(pid), st=stagesOf(pid);
  var rows=st.map(function(s,i){
    var ivs=(s.ivs||[]).map(function(id){
      var u=DB.people.filter(function(x){return x.id===id;})[0];
      return u ? u.nm+(u.ea?' (EA)':'') : ''; }).join(', ');
    return '<div class="se-row" draggable="'+(!s.rail)+'" data-s="'+s.id+'" data-i="'+i+'">'+
      (s.rail?'<span class="se-grip" style="opacity:.25">'+ico('i-lock','ic-sm')+'</span>'
             :'<span class="se-grip">'+ico('i-grip')+'</span>')+
      '<i class="se-sw" style="background:'+s.color+'"></i>'+
      '<input class="se-name" value="'+esc(s.nm)+'" data-rn="'+s.id+'"'+(s.rail?' readonly':'')+'>'+
      '<span class="se-kind">'+KIND[s.kind]+'</span>'+
      (s.rail ? '<span class="se-f">'+ico('i-lock')+'고정 단계</span>' :
        '<label class="se-f" title="이 단계의 기준 체류일">'+ico('i-clock')+
          '<input class="in sm w-xs" type="number" min="0" value="'+s.sla+'" data-sla="'+s.id+'">d</label>'+
        (s.kind==='interview'
          ? '<label class="se-f" title="면접 길이">'+ico('i-video')+
              '<select class="sel sm w-sm" data-dur="'+s.id+'">'+
              [30,45,60,90,120].map(function(m){ return '<option'+(s.dur===m?' selected':'')+'>'+m+'분</option>'; }).join('')+
              '</select></label>'+
            '<span class="se-f">'+ico('i-users')+(ivs||'미지정')+'</span>'
          : '<span class="se-f">'+ico('i-zap')+(s.auto?'자동':'수동')+'</span>'))+
      (s.rail?'':'<button class="se-del" data-del="'+s.id+'" title="단계 삭제">'+ico('i-trash','ic-sm')+'</button>')+
      '</div>'; }).join('');

  return posHeader(pid,'setup')+
    '<div class="stage">'+
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:26px;align-items:start">'+

        '<div>'+
          '<div class="sec-h"><h3>전형 단계 구성</h3><span class="n">'+st.length+'단계</span>'+
            '<span class="hint">'+ico('i-grip','ic-sm')+' 끌어서 순서 변경 · 이름을 눌러 수정</span></div>'+
          '<div class="sheet" id="stageEditor">'+rows+
            '<button class="se-add" data-preset="__custom">'+ico('i-plus','ic-sm')+'단계 추가</button></div>'+
          '<div class="preset">'+PRESETS.map(function(pz,i){
              return '<button data-preset="'+i+'">'+ico('i-plus','ic-sm')+esc(pz.nm)+'</button>'; }).join('')+'</div>'+

          '<div class="sec-h" style="margin-top:26px"><h3>기본 정보</h3></div>'+
          '<div class="sheet" style="padding:16px 18px">'+
            '<div class="row2">'+
              field('공고명','<input class="in" value="'+esc(p.title)+'">')+
              field('고용형태','<select class="sel">'+['정규직','계약직','인턴','파견'].map(function(x){
                return '<option'+(p.emp===x?' selected':'')+'>'+x+'</option>'; }).join('')+'</select>')+
            '</div>'+
            '<div class="row3">'+
              field('부문','<select class="sel"><option>플랫폼본부</option><option>프로덕트본부</option><option>사업본부</option></select>')+
              field('팀','<input class="in" value="'+esc(p.team)+'">')+
              field('상태','<select class="sel"><option>오픈</option><option>홀드</option><option>마감</option></select>')+
            '</div>'+
            '<div class="row2">'+
              field('담당 리크루터','<select class="sel"><option>정수민</option><option>박현우</option></select>')+
              field('하이어링 매니저','<select class="sel"><option>최영수</option><option>노아름</option></select>')+
            '</div>'+
            field('JD','<textarea class="ta">'+esc(p.jd)+'</textarea>')+
          '</div>'+
        '</div>'+

        '<div>'+
          '<div class="sec-h"><h3>단계 구성이 하는 일</h3></div>'+
          '<div class="sheet" style="padding:15px 16px">'+
            infoRow('i-columns','파이프라인 열','여기서 만든 단계가 곧 보드의 열이 됩니다.')+
            infoRow('i-clock','기준 체류일','초과하면 카드가 주황(지연)으로 바뀝니다.')+
            infoRow('i-video','면접 길이','캘린더 교집합을 찾을 블록 길이입니다. 2시간이면 연속 2시간을 찾습니다.')+
            infoRow('i-users','면접관','EA 조율 대상이 한 명이라도 있으면 그 단계는 자동화에서 제외됩니다.')+
            infoRow('i-download','Export','추가한 단계는 Export 컬럼에 타임스탬프로 자동 추가됩니다.')+
          '</div>'+
          '<div class="note" style="margin-top:14px">'+
            '<h4>'+ico('i-info','ic-sm')+'주의</h4><ul>'+
            '<li>진행 중인 후보자가 있는 단계는 삭제할 수 없습니다.</li>'+
            '<li><b>입사 · 불합격</b>은 종료 단계라 순서와 이름이 고정입니다.</li>'+
            '<li>단계를 바꿔도 이미 지나간 후보자의 이력은 그대로 보존됩니다.</li></ul></div>'+
        '</div>'+

      '</div>'+
    '</div>';
}
function field(l,inner){ return '<div class="field"><label>'+l+'</label>'+inner+'</div>'; }
function infoRow(i,t,d){ return '<div style="display:flex;gap:9px;padding:7px 0">'+ico(i)+
  '<div><b style="font-size:12.5px">'+t+'</b><div style="font-size:11.5px;color:var(--t3);margin-top:1px">'+d+'</div></div></div>'; }

function wireSetup(){
  var pid=boardState.pid, st=stagesOf(pid);

  on('[data-rn]','change',function(e){
    var s=stageById(pid,e.currentTarget.getAttribute('data-rn'));
    s.nm=e.currentTarget.value.trim()||s.nm; toast('단계명을 <b>'+esc(s.nm)+'</b>(으)로 바꿨습니다'); });
  on('[data-sla]','change',function(e){
    var s=stageById(pid,e.currentTarget.getAttribute('data-sla'));
    s.sla=Math.max(0,+e.currentTarget.value||0); toast('<b>'+esc(s.nm)+'</b> 기준 체류일 '+s.sla+'일'); });
  on('[data-dur]','change',function(e){
    var s=stageById(pid,e.currentTarget.getAttribute('data-dur'));
    s.dur=parseInt(e.currentTarget.value,10);
    toast('<b>'+esc(s.nm)+'</b> 면접 길이 '+s.dur+'분 · 교집합 탐색 조건이 바뀝니다'); });

  on('[data-del]','click',function(e){
    var id=e.currentTarget.getAttribute('data-del'), s=stageById(pid,id);
    var used=candsOf(pid).filter(function(c){return c.st===id;}).length;
    if(used){ toast(ico('i-alert')+' <b>'+esc(s.nm)+'</b>에 '+used+'명이 있어 삭제할 수 없습니다'); return; }
    var i=st.indexOf(s), removed=st.splice(i,1)[0]; recolor(pid); render();
    toast('<b>'+esc(removed.nm)+'</b> 단계를 삭제했습니다', function(){
      st.splice(i,0,removed); recolor(pid); render(); });
  });

  on('[data-preset]','click',function(e){
    var v=e.currentTarget.getAttribute('data-preset');
    var pz = v==='__custom' ? { nm:'새 단계', kind:'screen', sla:3, dur:0, mode:'—' } : PRESETS[+v];
    var s={ id:'s'+Date.now(), nm:pz.nm, kind:pz.kind, sla:pz.sla, dur:pz.dur, mode:pz.mode,
            ivs:[], color:'#8b8ce2', auto:true };
    var lastFree=st.map(function(x){return !!x.rail;}).indexOf(true);
    st.splice(lastFree<0?st.length:lastFree, 0, s); recolor(pid); render();
    toast('<b>'+esc(s.nm)+'</b> 단계를 추가했습니다 · 보드에 열이 생겼습니다', function(){
      var i=st.indexOf(s); if(i>=0) st.splice(i,1); recolor(pid); render(); });
  });

  /* 단계 순서 드래그 */
  var from=null;
  on('.se-row','dragstart',function(e){
    from=e.currentTarget.getAttribute('data-s'); e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed='move'; try{ e.dataTransfer.setData('text/plain',from); }catch(_){} });
  on('.se-row','dragend',function(e){ e.currentTarget.classList.remove('dragging');
    $$('.se-row').forEach(function(r){ r.classList.remove('over-top','over-bot'); }); from=null; });
  on('.se-row','dragover',function(e){
    e.preventDefault();
    var r=e.currentTarget, box=r.getBoundingClientRect(), after=e.clientY > box.top+box.height/2;
    $$('.se-row').forEach(function(x){ x.classList.remove('over-top','over-bot'); });
    r.classList.add(after?'over-bot':'over-top'); });
  on('.se-row','drop',function(e){
    e.preventDefault();
    var target=e.currentTarget.getAttribute('data-s');
    if(!from||from===target) return;
    var a=stageById(pid,from), b=stageById(pid,target);
    if(a.rail||b.rail){ toast('종료 단계는 순서를 바꿀 수 없습니다'); return; }
    var box=e.currentTarget.getBoundingClientRect(), after=e.clientY > box.top+box.height/2;
    st.splice(st.indexOf(a),1);
    var at=st.indexOf(b)+(after?1:0);
    st.splice(at,0,a); recolor(pid); render();
    toast('<b>'+esc(a.nm)+'</b> 순서를 옮겼습니다');
  });
}

/* =========================================================
   C-4 자동화 설정
   ========================================================= */
function viewAuto(pid){
  var a=DB.auto[pid]||DB.auto.p1;
  var rules=a.rules.map(function(r){
    return '<div class="rule"><div class="txt"><b>'+esc(r.nm)+'</b><span>'+esc(r.d)+'</span></div>'+
      '<div class="ctl">'+
        (r.lock?'<span class="pill">'+ico('i-lock','ic-sm')+'해제 불가</span>'
               :'<input class="in sm w-sm" value="'+esc(r.th)+'">')+
        '<button class="sw'+(r.on?' on':'')+'" data-rule="'+r.id+'"'+(r.lock?' disabled':'')+'></button>'+
      '</div></div>'; }).join('');

  return posHeader(pid,'auto')+
    '<div class="stage">'+
      '<div style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:26px;align-items:start">'+
        '<div>'+
          '<div class="sec-h"><h3>에스컬레이션 규칙</h3><span class="n">'+a.rules.length+'종</span>'+
            '<span class="hint">켜진 규칙이 걸리면 조율 처리함으로 올라옵니다</span></div>'+
          '<div class="sheet">'+rules+'</div>'+

          '<div class="sec-h" style="margin-top:26px"><h3>단계별 기준 체류일 (SLA)</h3>'+
            '<span class="hint">초과하면 카드가 주황으로 바뀝니다</span></div>'+
          '<div class="sheet"><table class="tb"><thead><tr><th>단계</th><th>유형</th>'+
            '<th class="num">기준</th><th class="num">현재 평균</th><th class="num">초과</th></tr></thead><tbody>'+
            stagesOf(pid).filter(function(s){return !s.rail;}).map(function(s){
              var mine=candsOf(pid).filter(function(c){return c.st===s.id;});
              var avg=mine.length?(mine.reduce(function(x,c){return x+c.d;},0)/mine.length):0;
              var over=mine.filter(function(c){return c.d>s.sla;}).length;
              return '<tr><td class="strong"><i class="se-sw" style="display:inline-block;background:'+s.color+
                ';margin-right:7px"></i>'+esc(s.nm)+'</td><td style="color:var(--t3)">'+KIND[s.kind]+
                (s.dur?' · '+s.dur+'분':'')+'</td>'+
                '<td class="num">'+s.sla+'d</td><td class="num"'+(avg>s.sla?' style="color:var(--esc);font-weight:600"':'')+'>'+
                avg.toFixed(1)+'d</td><td class="num">'+(over?'<span class="pill bad">'+over+'명</span>':'—')+'</td></tr>';
            }).join('')+'</tbody></table></div>'+
        '</div>'+

        '<div>'+
          '<div class="sec-h"><h3>슬롯 탐색</h3></div>'+
          '<div class="sheet" style="padding:16px 18px">'+
            field('탐색 범위','<select class="sel"><option>영업일 '+a.window+'일</option><option>영업일 5일</option><option>영업일 15일</option></select>')+
            field('탐색 시간대','<input class="in" value="'+esc(a.hours)+'">')+
            '<div class="row2">'+
              field('면접 간 버퍼','<input class="in" value="'+a.buffer+'분">')+
              field('타임존','<input class="in" value="'+esc(a.tz)+'">')+
            '</div>'+
          '</div>'+
          '<div class="sec-h" style="margin-top:20px"><h3>응답 제한 · 리마인더</h3></div>'+
          '<div class="sheet" style="padding:16px 18px">'+
            '<div class="row2">'+
              field('후보자','<select class="sel"><option>'+a.candSla+'시간</option><option>24시간</option><option>72시간</option></select>')+
              field('면접관','<select class="sel"><option>'+a.ivSla+'시간</option><option>12시간</option><option>48시간</option></select>')+
            '</div>'+
            field('리마인더 타이밍','<input class="in" value="'+esc(a.remind)+'">')+
            '<div class="desc" style="font-size:11px;color:var(--t4)">면접 전 리마인더는 후보자·면접관 양쪽에 발송됩니다.</div>'+
          '</div>'+
          '<div class="note" style="margin-top:14px"><h4>'+ico('i-shield','ic-sm')+'AI가 하지 않는 것</h4><ul>'+
            '<li><b>일정을 확정하지 않습니다.</b> 면접관의 명시적 클릭이 있어야 확정됩니다.</li>'+
            '<li>EA 조율 대상이 포함되면 자동화에서 <b>완전히 제외</b>하고 즉시 코디네이터로 넘깁니다.</li>'+
            '<li>불합격 통보를 자동 발송하지 않습니다. 초안까지만 만듭니다.</li></ul></div>'+
        '</div>'+
      '</div>'+
    '</div>';
}
function wireAuto(){
  on('[data-rule]','click',function(e){
    var a=DB.auto[boardState.pid]||DB.auto.p1;
    var r=a.rules.filter(function(x){return x.id===e.currentTarget.getAttribute('data-rule');})[0];
    r.on=!r.on; e.currentTarget.classList.toggle('on',r.on);
    toast('<b>'+esc(r.nm)+'</b> 규칙을 '+(r.on?'켰습니다':'껐습니다')); });
}

/* =========================================================
   C-5 지원 링크
   ========================================================= */
function viewLinks(pid){
  var ls=DB.links[pid]||DB.links.p1;
  return posHeader(pid,'links')+
    '<div class="stage">'+
      '<div class="sec-h"><h3>채널별 지원 링크</h3><span class="hint">유입 출처가 Export의 <code>utm_source</code>로 자동 기록됩니다</span>'+
        '<div class="right"><button class="btn br">'+ico('i-plus','ic-sm')+'링크 생성</button></div></div>'+
      '<div class="sheet"><table class="tb"><thead><tr><th>채널</th><th>URL</th>'+
        '<th class="num">조회</th><th class="num">지원</th><th class="num">전환율</th><th></th></tr></thead><tbody>'+
        ls.map(function(l){
          return '<tr><td class="strong">'+esc(l.ch)+'</td>'+
            '<td class="mono" style="color:var(--t3);font-size:11.5px">'+esc(l.url)+'</td>'+
            '<td class="num">'+l.v+'</td><td class="num">'+l.a+'</td>'+
            '<td class="num">'+(l.a/l.v*100).toFixed(1)+'%</td>'+
            '<td style="text-align:right"><button class="btn quiet" data-copy="'+esc(l.url)+'">'+
              ico('i-copy','ic-sm')+'복사</button></td></tr>'; }).join('')+
        '</tbody></table></div>'+
      note([
        '채널마다 별도 링크를 쓰면 <b>출처를 사람이 입력할 필요가 없습니다</b>. 유입 시점에 자동 기록됩니다.',
        '임직원 추천 링크는 추천인이 함께 기록되어, 대시보드의 <b>레퍼럴 추천인 순위</b>로 이어집니다.'
      ])+
    '</div>';
}

/* =========================================================
   B-1 조율 처리함
   ========================================================= */
var inboxOpen={ idle:false, done:false };
function viewInbox(){
  var items=inboxItems();
  var esc_=items.filter(function(i){return i.s==='esc';});
  var late=items.filter(function(i){return i.s==='late';});
  var idle=DB.cands.filter(function(c){return c.s==='idle';});
  var done=DB.cands.filter(function(c){return c.s==='done';});

  function row(i){
    return '<div class="qr s-'+i.s+'"><i class="dot"></i>'+
      '<span class="nm">'+esc(i.nm)+'</span>'+
      '<span class="st">'+ico(i.k==='mtg'?'i-video':'i-user')+esc(i.st)+'</span>'+
      '<span class="pos">'+esc(i.pos)+'</span>'+
      '<span class="age">'+esc(i.ag)+'</span>'+
      '<span class="why">'+esc(i.why)+'</span>'+
      '<span class="btns">'+
        (i.act?i.act.map(function(a,n){return '<button class="btn'+(n===0?' solid':'')+'">'+esc(a)+'</button>';}).join('')
              :'<button class="btn">처리</button>')+
        '<button class="btn quiet">보류</button></span></div>';
  }
  function crow(c){
    return '<div class="qr s-'+c.s+'"><i class="dot"></i><span class="nm">'+esc(c.nm)+'</span>'+
      '<span class="st">'+ico('i-user')+esc(stageById(c.p,c.st).nm)+'</span>'+
      '<span class="pos">'+esc(posById(c.p).title)+'</span>'+
      '<span class="age">'+c.d+'d</span><span class="why">'+esc(c.why||'자동 진행 중')+'</span>'+
      '<span class="btns"><button class="btn quiet">보기</button></span></div>';
  }
  function fold(t,arr,k,h,fn){
    var o=inboxOpen[k];
    return '<div class="grp"><button class="fold'+(o?' open':'')+'" data-fold="'+k+'">'+
      '<i class="dot d-'+k+'"></i><span>'+t+'</span><span class="cnt">'+arr.length+'</span>'+
      '<span class="hint">'+h+'</span><span class="arw">'+(o?'접기':'펼치기')+ico('i-chevron','ic-sm')+'</span></button>'+
      (o?'<div class="sheet">'+arr.map(fn).join('')+'</div>':'')+'</div>';
  }

  var top = esc_.length
    ? '<div class="grp"><div class="sec-h"><h3>지금 처리</h3><span class="n">'+esc_.length+'</span>'+
      '<span class="hint">자동화가 멈춘 지점입니다</span></div><div class="sheet">'+esc_.map(row).join('')+'</div></div>'
    : '<div class="zero">'+ico('i-check-circle')+'<b>지금 처리할 일이 없습니다</b><span>모든 조율이 자동으로 진행 중입니다</span></div>';

  return '<header class="top">'+
      '<div class="crumb">'+ico('i-inbox','ic-sm')+'내 화면</div>'+
      '<div class="h-row"><h1>조율 처리함</h1>'+
        (esc_.length?'<span class="pill bad">'+ico('i-alert','ic-sm')+esc_.length+'건 대기</span>':'')+
        '<div class="spacer"><a class="btn" href="#/settings">'+ico('i-sliders','ic-sm')+'규칙 설정</a></div></div>'+
      '<div class="meta"><i>'+ico('i-user','ic-sm')+'담당 <b>'+DB.me.name+'</b></i>'+
        '<i>'+ico('i-briefcase','ic-sm')+'공고 <b>'+DB.positions.filter(function(p){return p.st==='open';}).length+'건</b></i>'+
        '<i>'+ico('i-clock','ic-sm')+'기준 <b>2026-08-12</b></i></div>'+
    '</header>'+
    '<div class="stage">'+ top +
      (late.length?'<div class="grp"><div class="sec-h"><h3>곧 처리</h3><span class="n">'+late.length+'</span>'+
        '<span class="hint">기준 시간을 넘겼습니다</span></div><div class="sheet">'+late.map(row).join('')+'</div></div>':'')+
      fold('AI 진행 중',idle,'idle','개입 불필요',crow)+
      fold('완료',done,'done','기록만 남습니다',crow)+
      note([
        '위에서부터 내려오며 <b>버튼 하나씩만 누르면</b> 된다. 판단에 필요한 건 이름·단계·공고·경과·사유뿐이다.',
        '<b>전 공고를 가로질러</b> 모인다. 코디네이터는 공고를 옮겨다니지 않는다.',
        '이 화면의 목표 상태는 <b>맨 위 0건</b>이다.'
      ])+
      '<p class="disclaimer">※ 화면은 기능 설명을 위한 예시 데이터입니다.</p>'+
    '</div>';
}
function wireInbox(){
  on('[data-fold]','click',function(e){
    var k=e.currentTarget.getAttribute('data-fold'); inboxOpen[k]=!inboxOpen[k]; render(); });
}

/* =========================================================
   C-1 공고 목록
   ========================================================= */
function viewPositions(){
  var rows=DB.positions.map(function(p){
    var cs=DB.cands.filter(function(c){return c.p===p.id;});
    var act=cs.filter(function(c){ return !stageById(p.id,c.st).rail; });
    var risk=act.filter(function(c){return c.s==='esc'||c.s==='late';}).length;
    var st={open:['ok','오픈'],hold:['warn','홀드'],closed:['','마감']}[p.st];
    var bn=DB.stages[p.id] ? (function(){
      var best=null; stagesOf(p.id).filter(function(s){return !s.rail;}).forEach(function(s){
        var m=cs.filter(function(c){return c.st===s.id;});
        var avg=m.length?m.reduce(function(a,c){return a+c.d;},0)/m.length:0;
        if(!best||avg>best.avg) best={nm:s.nm,avg:avg}; });
      return best && best.avg>0 ? best.nm+' '+best.avg.toFixed(1)+'d' : '—'; })() : '—';
    return '<tr><td class="strong"><a href="#/p/'+p.id+'/board">'+esc(p.title)+'</a>'+
        '<div style="font-size:11px;color:var(--t4);margin-top:2px">'+esc(p.dept)+' · '+esc(p.team)+' · '+esc(p.emp)+'</div></td>'+
      '<td><span class="pill '+st[0]+'"><i class="dot"></i>'+st[1]+'</span></td>'+
      '<td class="num">'+act.length+'</td>'+
      '<td>'+(risk?'<span class="pill bad">'+ico('i-alert','ic-sm')+risk+'</span>':'<span style="color:var(--t4)">—</span>')+'</td>'+
      '<td style="color:var(--t3);font-size:11.5px">'+esc(bn)+'</td>'+
      '<td class="num">'+p.ttf+'d</td>'+
      '<td style="color:var(--t2)">'+esc(p.rec)+'</td>'+
      '<td style="text-align:right"><a class="btn quiet" href="#/p/'+p.id+'/setup">'+ico('i-sliders','ic-sm')+'설정</a></td></tr>';
  }).join('');

  return '<header class="top">'+
      '<div class="crumb">'+ico('i-briefcase','ic-sm')+'채용</div>'+
      '<div class="h-row"><h1>공고</h1><span class="pill">'+DB.positions.length+'건</span>'+
        '<div class="spacer"><button class="btn">'+ico('i-filter','ic-sm')+'필터</button>'+
        '<button class="btn br">'+ico('i-plus','ic-sm')+'공고 생성</button></div></div>'+
      '<div class="meta"><i>'+ico('i-check-circle','ic-sm')+'오픈 <b>3</b></i>'+
        '<i>'+ico('i-clock','ic-sm')+'홀드 <b>1</b></i><i>'+ico('i-flag','ic-sm')+'마감 <b>1</b></i></div>'+
    '</header>'+
    '<div class="stage"><div class="sheet"><table class="tb"><thead><tr>'+
      '<th>공고</th><th>상태</th><th class="num">진행</th><th>대응 필요</th><th>병목 단계</th>'+
      '<th class="num">경과</th><th>리크루터</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      note(['공고 목록은 <b>대응이 필요한 건수</b>와 <b>병목 단계</b>를 먼저 보여준다. 리크루터가 어느 공고부터 열지 여기서 결정한다.'])+
    '</div>';
}

/* =========================================================
   D-1 후보자 상세
   ========================================================= */
function viewCandidate(cid){
  var c=DB.cands.filter(function(x){return x.id===cid;})[0];
  if(!c) return notFound();
  var p=posById(c.p), sg=stageById(c.p,c.st);
  var tl=DB.timeline[cid] || [
    { t:md(c.ap), b:'지원 접수', p:esc(c.src)+' 유입 · 자동 기록', s:'done' },
    { t:md(c.en), b:sg.nm+' 진입', p:c.why||'자동 진행 중', s:'now' }
  ];
  var ev=DB.evals[cid]||[];

  return '<header class="top">'+
      '<div class="crumb">'+ico('i-users','ic-sm')+'<a href="#/p/'+c.p+'/board">'+esc(p.title)+'</a>'+
        '<span class="sep">/</span>후보자</div>'+
      '<div class="h-row"><h1>'+esc(c.nm)+'</h1>'+
        '<span class="pill" style="background:'+sg.color+'1a;color:'+sg.color+'"><i class="dot"></i>'+esc(sg.nm)+'</span>'+
        (c.s==='esc'?'<span class="pill bad">'+ico('i-alert','ic-sm')+esc(c.why)+'</span>':
         c.s==='late'?'<span class="pill warn">'+ico('i-clock','ic-sm')+esc(c.why)+'</span>':'')+
        '<div class="spacer"><button class="btn">'+ico('i-mail','ic-sm')+'메일</button>'+
        '<button class="btn">'+ico('i-calendar','ic-sm')+'수동 조율</button>'+
        '<button class="btn danger">'+ico('i-x','ic-sm')+'불합격 처리</button></div></div>'+
      '<div class="meta">'+
        '<i>'+ico('i-calendar','ic-sm')+'유입 <b>'+md(c.ap)+'</b> ('+daysSince(c.ap)+'일 전)</i>'+
        '<i>'+ico('i-clock','ic-sm')+'현 단계 <b>'+c.d+'d</b></i>'+
        '<i>'+ico('i-link','ic-sm')+'출처 <b>'+esc(c.src)+'</b></i>'+
        '<i>'+ico('i-briefcase','ic-sm')+'<b>'+esc(c.role)+'</b> · '+c.yr+'년차</i></div>'+
    '</header>'+
    '<div class="stage"><div style="display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:26px;align-items:start">'+
      '<div>'+
        '<div class="sec-h"><h3>전형 타임라인</h3><span class="hint">모든 값은 이벤트 발생 시점에 자동 기록됩니다</span></div>'+
        '<div class="sheet" style="padding:18px 20px"><div class="tl">'+
          tl.map(function(t){ return '<div class="tl-i '+(t.s||'')+'"><b>'+esc(t.b)+'</b><span class="t">'+esc(t.t)+'</span>'+
            '<p>'+esc(t.p)+'</p></div>'; }).join('')+'</div></div>'+

        '<div class="sec-h" style="margin-top:24px"><h3>평가</h3><span class="n">'+ev.length+'건</span>'+
          (ev.length?'<div class="right"><button class="btn quiet">'+ico('i-rows','ic-sm')+'나란히 비교</button></div>':'')+'</div>'+
        (ev.length ? '<div class="sheet">'+ev.map(function(e){
            return '<div style="padding:14px 16px;border-top:1px solid var(--line)">'+
              '<div style="display:flex;align-items:center;gap:9px">'+
                '<span class="avatar">'+e.iv.charAt(0)+'</span>'+
                '<div><b style="font-size:13px">'+esc(e.iv)+'</b>'+
                  '<div style="font-size:11px;color:var(--t4)">'+esc(e.role)+' · '+esc(e.st)+'</div></div>'+
                '<span class="pill ok" style="margin-left:auto">'+esc(e.res)+'</span>'+
                '<span class="mono" style="font-size:15px;font-weight:600">'+e.tot.toFixed(1)+'</span></div>'+
              '<div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap">'+
                e.items.map(function(it){ return '<span style="font-size:11.5px;color:var(--t3)">'+esc(it[0])+
                  ' <b class="mono" style="color:var(--t1)">'+it[1]+'</b></span>'; }).join('')+'</div>'+
              '<p style="font-size:12px;color:var(--t2);margin-top:9px">'+esc(e.memo)+'</p></div>'; }).join('')+'</div>'
          : '<div class="sheet"><div class="empty">'+ico('i-check-sq')+'<b>아직 평가가 없습니다</b>'+
            '<span>인터뷰가 끝나면 평가지 작성 요청이 자동 발송됩니다</span></div></div>')+
      '</div>'+

      '<div>'+
        '<div class="sec-h"><h3>프로필</h3></div>'+
        '<div class="sheet" style="padding:16px 18px">'+
          '<div style="display:flex;gap:11px;align-items:center;margin-bottom:14px">'+
            '<span class="avatar lg br">'+esc(c.nm.charAt(0))+'</span>'+
            '<div><b style="font-size:14px">'+esc(c.nm)+'</b>'+
              '<div style="font-size:11.5px;color:var(--t3)">'+esc(c.role)+'</div></div></div>'+
          kv('경력', c.yr+'년')+ kv('유입 경로', c.src)+ kv('유입일', md(c.ap)+' ('+daysSince(c.ap)+'일 전)')+
          kv('현재 단계', sg.nm+' · '+c.d+'일째')+ kv('공고', p.title)+
          '<button class="btn" style="width:100%;justify-content:center;margin-top:12px">'+
            ico('i-download','ic-sm')+'이력서 보기 (PDF)</button></div>'+

        '<div class="sec-h" style="margin-top:20px"><h3>커뮤니케이션 로그</h3>'+
          '<span class="hint">발송 전량 자동 기록</span></div>'+
        '<div class="sheet">'+
          comm('메일','슬롯 안내 3개 발송','8/03 09:12')+
          comm('Slack','면접관 슬롯 요청 (최영수)','8/03 09:12')+
          comm('Slack','면접관 슬롯 요청 (한도경 · EA)','8/03 09:12')+
          comm('메일','리마인더 발송','8/04 09:00')+
        '</div>'+
      '</div>'+
    '</div></div>';
}
function kv(k,v){ return '<div style="display:flex;padding:5px 0;font-size:12px">'+
  '<span style="width:82px;color:var(--t4);flex:none">'+esc(k)+'</span><b style="font-weight:500">'+esc(v)+'</b></div>'; }
function comm(ch,t,d){ return '<div style="display:flex;gap:9px;align-items:center;padding:10px 14px;border-top:1px solid var(--line)">'+
  ico(ch==='메일'?'i-mail':'i-msg')+'<div style="flex:1;min-width:0"><b style="font-size:12px;font-weight:500">'+esc(t)+'</b>'+
  '<div style="font-size:10.5px;color:var(--t4)">'+esc(ch)+'</div></div>'+
  '<span class="mono" style="font-size:10.5px;color:var(--t4)">'+esc(d)+'</span></div>'; }

/* =========================================================
   D-2 후보자 목록 / 인재풀
   ========================================================= */
function viewCandidates(){
  var rows=DB.cands.slice().sort(byRisk).map(function(c){
    var sg=stageById(c.p,c.st);
    return '<tr><td class="strong"><a href="#/c/'+c.id+'">'+esc(c.nm)+'</a>'+
      '<div style="font-size:11px;color:var(--t4);margin-top:2px">'+esc(c.role)+' · '+c.yr+'년차</div></td>'+
      '<td style="color:var(--t3)">'+esc(posById(c.p).title)+'</td>'+
      '<td><span class="pill" style="background:'+sg.color+'1a;color:'+sg.color+'"><i class="dot"></i>'+esc(sg.nm)+'</span></td>'+
      '<td><span class="qr s-'+c.s+'" style="padding:0;border:0;display:inline-flex"><i class="dot"></i></span>'+
        '<span style="margin-left:7px;color:var(--t2)">'+LABEL[c.s]+'</span></td>'+
      '<td class="num">'+md(c.ap)+'</td><td class="num">'+c.d+'d</td>'+
      '<td style="color:var(--t3)">'+esc(c.src)+'</td></tr>'; }).join('');
  return '<header class="top"><div class="crumb">'+ico('i-users','ic-sm')+'채용</div>'+
      '<div class="h-row"><h1>후보자</h1><span class="pill">'+DB.cands.length+'명</span>'+
        '<div class="spacer"><button class="btn">'+ico('i-search','ic-sm')+'검색</button>'+
        '<button class="btn">'+ico('i-users','ic-sm')+'중복 병합</button>'+
        '<button class="btn">'+ico('i-download','ic-sm')+'내보내기</button></div></div>'+
      '<div class="meta"><i>'+ico('i-alert','ic-sm')+'대응 필요 <b>'+
        DB.cands.filter(function(c){return c.s==='esc'||c.s==='late';}).length+'명</b></i>'+
        '<i>'+ico('i-check-circle','ic-sm')+'인재풀 이관 <b>4명</b></i></div></header>'+
    '<div class="stage"><div class="sheet"><table class="tb"><thead><tr><th>후보자</th><th>공고</th>'+
      '<th>단계</th><th>조율 상태</th><th class="num">유입일</th><th class="num">체류</th><th>출처</th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
      note(['기본 정렬은 <b>위험도 순</b>이다. 목록을 열면 손봐야 할 사람이 위에 있다.'])+'</div>';
}

/* =========================================================
   E-3 일정
   ========================================================= */
function viewSchedule(){
  var days=DB.events.map(function(d){
    return '<div class="grp"><div class="sec-h"><h3>'+esc(d.d)+'</h3><span class="n">'+d.ls.length+'건</span></div>'+
      '<div class="sheet">'+d.ls.map(function(e){
        return '<div class="qr s-'+e.s+'"><i class="dot"></i>'+
          '<span class="age" style="width:96px;text-align:left">'+esc(e.t)+'</span>'+
          '<span class="nm">'+esc(e.nm)+'</span>'+
          '<span class="st">'+ico(e.mode==='화상'?'i-video':'i-users')+esc(e.st)+'</span>'+
          '<span class="pos">'+esc(e.who)+'</span>'+
          '<span class="why">'+esc(e.note||(e.s==='done'?'확정 · 인비 발송 완료':''))+'</span>'+
          '<span class="btns"><button class="btn quiet">변경</button>'+
            (e.s==='esc'?'<button class="btn solid">수동 조율</button>':'')+'</span></div>'; }).join('')+'</div></div>';
  }).join('');
  return '<header class="top"><div class="crumb">'+ico('i-calendar','ic-sm')+'채용</div>'+
      '<div class="h-row"><h1>일정</h1>'+
        '<div class="spacer"><div class="seg"><button class="on">주</button><button>월</button></div>'+
        '<button class="btn">'+ico('i-plus','ic-sm')+'수동 일정</button></div></div>'+
      '<div class="meta"><i>'+ico('i-check-circle','ic-sm')+'확정 <b>3</b></i>'+
        '<i>'+ico('i-clock','ic-sm')+'대기 <b>1</b></i><i>'+ico('i-alert','ic-sm')+'수동 필요 <b>1</b></i></div></header>'+
    '<div class="stage">'+days+
      note([
        '취소하면 Google 인비 취소 · 화상 링크 만료 · 재조율 시작이 <b>한 번에</b> 일어난다.',
        'EA 조율 대상이 낀 일정은 애초에 자동으로 잡지 않는다. <b>수동 조율</b> 버튼으로 코디네이터가 직접 넣는다.'
      ])+'</div>';
}

/* =========================================================
   I. 면접관 프로필
   ========================================================= */
function viewInterviewers(){
  var rows=DB.people.map(function(u){
    return '<tr><td class="strong">'+esc(u.nm)+
        '<div style="font-size:11px;color:var(--t4);margin-top:2px">'+esc(u.tt)+' · '+esc(u.dept)+'</div></td>'+
      '<td>'+u.roles.map(function(r){return '<span class="pill" style="margin-right:4px">'+esc(r)+'</span>';}).join('')+'</td>'+
      '<td>'+(u.ea?'<span class="pill bad">'+ico('i-shield','ic-sm')+'EA 조율 ('+esc(u.eaNm)+')</span>'
                 :'<span style="color:var(--t3)">직접 연락</span>')+'</td>'+
      '<td style="color:var(--t2)">'+({slack:'Slack',email:'이메일',both:'Slack + 이메일'}[u.ch])+'</td>'+
      '<td class="num">'+u.sla+'h</td>'+
      '<td class="num"'+(u.resp!=='—'&&parseFloat(u.resp)>8?' style="color:var(--late);font-weight:600"':'')+'>'+esc(u.resp)+'</td>'+
      '<td style="text-align:right"><button class="btn quiet">'+ico('i-sliders','ic-sm')+'편집</button></td></tr>'; }).join('');
  return '<header class="top"><div class="crumb">'+ico('i-user','ic-sm')+'채용</div>'+
      '<div class="h-row"><h1>면접관</h1><span class="pill">'+DB.people.length+'명</span>'+
        '<span class="pill bad">'+ico('i-shield','ic-sm')+'EA 조율 '+DB.people.filter(function(u){return u.ea;}).length+'명</span>'+
        '<div class="spacer"><button class="btn br">'+ico('i-plus','ic-sm')+'면접관 등록</button></div></div>'+
      '<div class="meta"><i>'+ico('i-info','ic-sm')+'EA 플래그는 <b>HR이 수동 설정</b>합니다. 직급 자동 감지는 쓰지 않습니다.</i></div></header>'+
    '<div class="stage"><div class="sheet"><table class="tb"><thead><tr><th>이름</th><th>역할 태그</th>'+
      '<th>조율 방식</th><th>알림 채널</th><th class="num">응답 제한</th><th class="num">평균 응답</th><th></th>'+
      '</tr></thead><tbody>'+rows+'</tbody></table></div>'+
      note([
        'EA 플래그가 켜진 면접관이 낀 <b>모든 스케줄링</b>(1차·2차·킥오프·디브리프)은 자동화에서 완전히 제외되고 즉시 코디네이터로 갑니다.',
        '평균 응답 시간이 길어지는 면접관은 <b>공고 설정에서 다른 사람으로 교체</b>하는 판단 근거가 됩니다.'
      ])+'</div>';
}

/* =========================================================
   J. 대시보드
   ========================================================= */
function viewDashboard(){
  var maxD=Math.max.apply(null,DB.dwell.map(function(d){return d.v;}));
  return '<header class="top"><div class="crumb">'+ico('i-chart','ic-sm')+'운영</div>'+
      '<div class="h-row"><h1>대시보드</h1>'+
        '<div class="spacer"><div class="seg"><button>30일</button><button class="on">90일</button><button>연간</button></div>'+
        '<button class="btn">'+ico('i-download','ic-sm')+'내보내기</button></div></div>'+
      '<div class="meta"><i>'+ico('i-shield','ic-sm')+'접근 범위 <b>리크루터 — 담당 포지션만</b></i></div></header>'+
    '<div class="stage">'+
      '<div class="grid g4">'+
        kpi('i-clock','Time-to-Fill','31','일','전분기 −4일','up')+
        kpi('i-calendar','Time-to-Hire','24','일','전분기 −2일','up')+
        kpi('i-video','스케줄링 조율 소요','5.2','시간','전분기 −41%','up')+
        kpi('i-user','HR 수동 개입 비율','18','%','전분기 −27%p','up')+
      '</div>'+
      '<div class="grid g2" style="margin-top:12px">'+
        '<div class="sheet" style="padding:16px 18px"><div class="sec-h"><h3>퍼널 전환율</h3></div>'+
          '<div class="funnel">'+DB.funnel.map(function(f){
            return '<div class="fn"><span class="fl">'+esc(f.l)+'</span>'+
              '<span class="ft"><i class="ff" style="width:'+f.r+'%"></i></span>'+
              '<span class="fv">'+f.n+'→'+f.d+' <small>('+f.r+'%)</small></span></div>'; }).join('')+'</div></div>'+
        '<div class="sheet" style="padding:16px 18px"><div class="sec-h"><h3>단계별 평균 소요일</h3>'+
          '<span class="hint">2차 인터뷰가 병목</span></div>'+
          '<div class="bars">'+DB.dwell.map(function(d){
            return '<div class="b'+(d.hot?' hot':'')+'"><b>'+d.v+'d</b>'+
              '<i style="height:'+(d.v/maxD*88)+'%"></i><span>'+esc(d.l)+'</span></div>'; }).join('')+'</div></div>'+
      '</div>'+
      '<div class="grid g2" style="margin-top:12px">'+
        '<div class="sheet"><div class="sec-h" style="padding:16px 18px 0"><h3>출처별 효율</h3></div>'+
          '<table class="tb"><thead><tr><th>출처</th><th class="num">지원</th><th class="num">최종 합격</th>'+
          '<th class="num">합격률</th><th class="num">TtH</th></tr></thead><tbody>'+
          DB.sources.map(function(s){ return '<tr><td class="strong">'+esc(s.s)+'</td><td class="num">'+s.ap+
            '</td><td class="num">'+s.hire+'</td><td class="num"'+(s.rate>15?' style="color:var(--done);font-weight:600"':'')+
            '>'+s.rate+'%</td><td class="num">'+s.ttH+'d</td></tr>'; }).join('')+'</tbody></table></div>'+
        '<div class="sheet"><div class="sec-h" style="padding:16px 18px 0"><h3>면접관별 평균 응답 시간</h3></div>'+
          '<table class="tb"><thead><tr><th>면접관</th><th>조율 방식</th><th class="num">평균 응답</th></tr></thead><tbody>'+
          DB.people.filter(function(u){return u.roles.indexOf('인터뷰어')>=0||u.roles.indexOf('하이어링 매니저')>=0;})
            .map(function(u){ return '<tr><td class="strong">'+esc(u.nm)+'</td>'+
              '<td>'+(u.ea?'<span class="pill bad">EA</span>':'<span style="color:var(--t3)">직접</span>')+'</td>'+
              '<td class="num"'+(u.resp!=='—'&&parseFloat(u.resp)>8?' style="color:var(--late);font-weight:600"':'')+
              '>'+esc(u.resp)+'</td></tr>'; }).join('')+'</tbody></table></div>'+
      '</div>'+
      note(['<b>스케줄링 조율 소요 시간</b>과 <b>HR 수동 개입 비율</b>이 이 제품의 성과 지표다. 나머지는 어느 ATS에나 있다.'])+
      '<p class="disclaimer">※ 모든 수치는 기능 설명을 위한 예시입니다. 실제 측정값이 아닙니다.</p></div>';
}
function kpi(i,l,v,u,d,dir){ return '<div class="kpi"><div class="lb">'+ico(i,'ic-sm')+esc(l)+'</div>'+
  '<div class="v">'+v+'<small>'+esc(u)+'</small></div><div class="dl '+(dir||'')+'">'+esc(d)+'</div></div>'; }

/* =========================================================
   K. Export
   ========================================================= */
function viewExport(){
  var total=DB.exportCols.reduce(function(a,g){return a+g.n;},0);
  return '<header class="top"><div class="crumb">'+ico('i-download','ic-sm')+'운영</div>'+
      '<div class="h-row"><h1>데이터 내보내기</h1><span class="pill">'+total+'개 컬럼</span>'+
        '<div class="spacer"><button class="btn br">'+ico('i-download','ic-sm')+'.xlsx 다운로드</button></div></div>'+
      '<div class="meta"><i>'+ico('i-info','ic-sm')+'1행 = 후보자 1명 × 포지션 1건. 모든 값은 <b>이벤트 발생 시점에 자동 기록</b>됩니다.</i></div></header>'+
    '<div class="stage"><div style="display:grid;grid-template-columns:320px minmax(0,1fr);gap:26px;align-items:start">'+
      '<div><div class="sec-h"><h3>필터</h3></div><div class="sheet" style="padding:16px 18px">'+
        field('기간','<select class="sel"><option>최근 90일</option><option>최근 30일</option><option>전체</option></select>')+
        field('부문','<select class="sel"><option>전체</option><option>플랫폼본부</option></select>')+
        field('포지션','<select class="sel"><option>전체</option><option>백엔드 엔지니어 (시니어)</option></select>')+
        field('리크루터','<select class="sel"><option>전체</option><option>정수민</option></select>')+
        field('최종 결과','<select class="sel"><option>전체</option><option>입사</option><option>불합격</option></select>')+
      '</div></div>'+
      '<div><div class="sec-h"><h3>컬럼 구성</h3><span class="n">'+total+'개</span></div>'+
        '<div class="sheet"><table class="tb"><thead><tr><th>그룹</th><th class="num">컬럼</th><th>예시</th></tr></thead><tbody>'+
        DB.exportCols.map(function(g){ return '<tr><td class="strong">'+esc(g.g)+'</td><td class="num">'+g.n+'</td>'+
          '<td class="mono" style="font-size:11px;color:var(--t3)">'+esc(g.c)+'</td></tr>'; }).join('')+
        '</tbody></table></div>'+
        note([
          '<code>candidate_profile_url</code>은 하이퍼링크로 렌더되어, 엑셀에서 바로 후보자 상세로 이동합니다.',
          '공고 설정에서 <b>단계를 추가하면 해당 타임스탬프 컬럼이 자동으로 늘어납니다</b>.'
        ])+'</div>'+
    '</div></div>';
}

/* =========================================================
   L. 설정
   ========================================================= */
function viewSettings(){
  function grp(t,rows){ return '<div class="grp"><div class="sec-h"><h3>'+t+'</h3></div><div class="sheet">'+rows+'</div></div>'; }
  function r(i,t,d,ctl){ return '<div class="rule">'+ico(i)+'<div class="txt"><b>'+t+'</b><span>'+d+'</span></div>'+
    '<div class="ctl">'+ctl+'</div></div>'; }
  var sw=function(on){ return '<button class="sw'+(on?' on':'')+'"></button>'; };
  return '<header class="top"><div class="crumb">'+ico('i-sliders','ic-sm')+'운영</div>'+
      '<div class="h-row"><h1>설정</h1></div>'+
      '<div class="meta"><i>'+ico('i-users','ic-sm')+'워크스페이스 <b>Example Inc.</b></i></div></header>'+
    '<div class="stage"><div style="max-width:780px">'+
      grp('L-5 연동',
        r('i-calendar','Google Calendar','조직 캘린더 읽기 + 쓰기','<span class="pill ok">'+ico('i-check-circle','ic-sm')+'연결됨</span>')+
        r('i-msg','Slack','면접관 슬롯 선택 버튼 · 알림','<span class="pill ok">'+ico('i-check-circle','ic-sm')+'연결됨</span>')+
        r('i-video','화상 회의','Meet · Zoom · Teams 중 선택','<select class="sel sm w-sm"><option>Google Meet</option><option>Zoom</option><option>Teams</option></select>')+
        r('i-mail','발신 도메인','careers.example.com SPF/DKIM','<span class="pill ok">인증 완료</span>')+
        r('i-msg','SMS','후보자 동의 필수','<span class="pill">미사용</span>'+sw(false)))+
      grp('L-2 사용자 · 권한 (RBAC)',
        ['코디네이터','리크루터','하이어링 매니저','인터뷰어','HR Manager','경영진'].map(function(x,i){
          return r('i-shield',x,['전 공고 조율 처리 · 수동 조율','담당 공고 전체','본인 부서 · 개인정보 제한',
            '배정된 면접 · 평가지만','전체 조회 + 설정','전사 집계 요약만'][i],
            '<span class="pill">'+[2,3,5,12,1,4][i]+'명</span><button class="btn quiet">'+ico('i-sliders','ic-sm')+'</button>'); }).join(''))+
      grp('L-3 알림 템플릿',
        r('i-mail','후보자 슬롯 안내','한국어 기본 · 영어 병행','<span class="pill">2개 언어</span><button class="btn quiet">편집</button>')+
        r('i-mail','면접 확정 안내','캘린더 인비 동시 발송','<span class="pill">2개 언어</span><button class="btn quiet">편집</button>')+
        r('i-mail','불합격 통보','자동 발송하지 않음 · 초안만 생성','<span class="pill warn">수동 발송</span><button class="btn quiet">편집</button>'))+
      grp('L-6 개인정보',
        r('i-shield','보유 기간','최종 결과일로부터','<select class="sel sm w-sm"><option>2년</option><option>1년</option><option>3년</option></select>')+
        r('i-trash','자동 파기 예약','보유 기간 경과 시 자동 삭제','<span class="pill ok">켜짐</span>'+sw(true))+
        r('i-check-sq','동의 이력','수집·이용 동의 시점 기록','<button class="btn quiet">보기</button>'))+
      grp('L-7 감사 로그',
        r('i-rows','기록 범위','알림 · 응답 · 에스컬레이션 · 수동 수정 전량','<button class="btn quiet">'+ico('i-download','ic-sm')+'내보내기</button>'))+
    '</div></div>';
}

/* =========================================================
   나머지 화면 (스텁이 아니라 실제 구성)
   ========================================================= */
function viewTodo(){
  return '<header class="top"><div class="crumb">'+ico('i-check-sq','ic-sm')+'내 화면</div>'+
    '<div class="h-row"><h1>내 할 일</h1><span class="pill">2건</span></div>'+
    '<div class="meta"><i>'+ico('i-user','ic-sm')+'하이어링 매니저 화면 · 카드 2~3장을 넘기지 않습니다</i></div></header>'+
    '<div class="stage"><div class="grid g2" style="max-width:760px">'+
      todoCard('i-check-sq','평가지 작성','이서연 · 2차 인터뷰','8/10 인터뷰 완료 · 48시간 경과','esc','지금 작성')+
      todoCard('i-users','킥오프 참석자 지정','백엔드 엔지니어 (시니어)','차상위·협업 리더를 지정해 주세요','late','참석자 지정')+
    '</div>'+
    note(['HM은 <b>이 화면만</b> 봅니다. 파이프라인 전체를 볼 필요가 없습니다.',
          '할 일이 없으면 빈 상태가 정상입니다. 억지로 채우지 않습니다.'])+'</div>';
}
function todoCard(i,t,s,d,st,btn){
  return '<div class="sheet" style="padding:18px 20px'+(st==='esc'?';box-shadow:inset 0 0 0 1px var(--esc-rim), var(--sh-1)':'')+'">'+
    '<div style="display:flex;align-items:center;gap:8px">'+ico(i)+
      '<b style="font-size:14px;letter-spacing:-.02em">'+t+'</b>'+
      '<span class="pill '+(st==='esc'?'bad':'warn')+'" style="margin-left:auto">'+(st==='esc'?'지연':'대기')+'</span></div>'+
    '<div style="font-size:12.5px;color:var(--t2);margin-top:8px">'+s+'</div>'+
    '<div style="font-size:11.5px;color:var(--t4);margin-top:2px">'+d+'</div>'+
    '<button class="btn solid" style="width:100%;justify-content:center;margin-top:14px">'+btn+'</button></div>';
}

function viewEvals(){
  var rows=DB.cands.filter(function(c){ return ['s3','s4'].indexOf(c.st)>=0; }).map(function(c){
    var has=(DB.evals[c.id]||[]).length;
    return '<tr><td class="strong"><a href="#/c/'+c.id+'">'+esc(c.nm)+'</a></td>'+
      '<td style="color:var(--t3)">'+esc(stageById(c.p,c.st).nm)+'</td>'+
      '<td>'+(has?'<span class="pill ok">'+has+'명 제출</span>':'<span class="pill warn">미제출</span>')+'</td>'+
      '<td class="num">'+(has?(DB.evals[c.id].reduce(function(a,e){return a+e.tot;},0)/has).toFixed(1):'—')+'</td>'+
      '<td style="text-align:right"><button class="btn quiet">'+(has?'비교 보기':'작성 요청')+'</button></td></tr>'; }).join('');
  return '<header class="top"><div class="crumb">'+ico('i-check-sq','ic-sm')+'채용</div>'+
    '<div class="h-row"><h1>평가</h1><div class="spacer"><button class="btn">'+ico('i-sliders','ic-sm')+'스코어카드 편집</button></div></div>'+
    '<div class="meta"><i>'+ico('i-info','ic-sm')+'Pass / Fail / Hold 클릭 시 <b>다음 단계가 자동 트리거</b>됩니다</i></div></header>'+
    '<div class="stage"><div class="sheet"><table class="tb"><thead><tr><th>후보자</th><th>단계</th>'+
      '<th>제출</th><th class="num">평균</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      note(['평가지는 <b>좌: 이력서 / 우: 스코어카드</b>로 한 화면에 둡니다. 창을 옮기며 쓰지 않습니다.'])+'</div>';
}

function viewOffers(){
  var os=DB.cands.filter(function(c){ return ['s5','s6'].indexOf(c.st)>=0; });
  return '<header class="top"><div class="crumb">'+ico('i-flag','ic-sm')+'채용</div>'+
    '<div class="h-row"><h1>오퍼</h1><span class="pill">'+os.length+'건</span>'+
      '<div class="spacer"><button class="btn br">'+ico('i-plus','ic-sm')+'오퍼 작성</button></div></div>'+
    '<div class="meta"><i>'+ico('i-info','ic-sm')+'거절 사유는 <b>필수 기록</b>입니다</i></div></header>'+
    '<div class="stage"><div class="sheet"><table class="tb"><thead><tr><th>후보자</th><th>공고</th>'+
      '<th>상태</th><th>입사 예정일</th><th class="num">경과</th><th></th></tr></thead><tbody>'+
      os.map(function(c){
        var acc=stageById(c.p,c.st).kind==='hired';
        return '<tr><td class="strong"><a href="#/c/'+c.id+'">'+esc(c.nm)+'</a></td>'+
          '<td style="color:var(--t3)">'+esc(posById(c.p).title)+'</td>'+
          '<td>'+(acc?'<span class="pill ok">Accepted</span>':'<span class="pill bad">Pending · 처우 재협의</span>')+'</td>'+
          '<td class="mono">'+(acc?'2026-09-01':'—')+'</td><td class="num">'+c.d+'d</td>'+
          '<td style="text-align:right"><button class="btn quiet">발송 기록</button></td></tr>'; }).join('')+
      '</tbody></table></div>'+
      note(['오퍼 결과는 Accepted / Declined / Pending 세 가지뿐입니다. <b>Declined면 사유 입력 없이는 저장되지 않습니다</b> — 거절 사유가 다음 채용의 유일한 자산이기 때문입니다.'])+'</div>';
}

function notFound(){ return '<div class="stage"><div class="empty">'+ico('i-alert')+
  '<b>화면을 찾을 수 없습니다</b><span>주소를 확인해 주세요</span></div></div>'; }

/* ---------- 공통 설명 블록 ---------- */
function note(items){
  return '<div class="note"><h4>'+ico('i-info','ic-sm')+'이 화면에서 관리하는 법</h4><ul>'+
    items.map(function(i){ return '<li>'+i+'</li>'; }).join('')+'</ul></div>';
}

/* =========================================================
   라우터
   ========================================================= */
function parse(){
  var h=(location.hash||'#/inbox').replace(/^#/,'');
  return h.split('/').filter(Boolean);
}
function render(){
  var s=parse(), main=$('#view'), body='', wire=null;

  if(s[0]==='p' && s[1]){
    boardState.pid=s[1];
    var t=s[2]||'board';
    if(t==='board'){ body=viewBoard(s[1]); wire=wireBoard; }
    else if(t==='progress'){ body=viewProgress(s[1]); }
    else if(t==='setup'){ body=viewSetup(s[1]); wire=wireSetup; }
    else if(t==='auto'){ body=viewAuto(s[1]); wire=wireAuto; }
    else if(t==='links'){ body=viewLinks(s[1]); }
    else body=notFound();
  }
  else if(s[0]==='c' && s[1]) body=viewCandidate(s[1]);
  else if(s[0]==='inbox'){ body=viewInbox(); wire=wireInbox; }
  else if(s[0]==='positions') body=viewPositions();
  else if(s[0]==='candidates') body=viewCandidates();
  else if(s[0]==='schedule') body=viewSchedule();
  else if(s[0]==='interviewers') body=viewInterviewers();
  else if(s[0]==='dashboard') body=viewDashboard();
  else if(s[0]==='export') body=viewExport();
  else if(s[0]==='settings') body=viewSettings();
  else if(s[0]==='todo') body=viewTodo();
  else if(s[0]==='evals') body=viewEvals();
  else if(s[0]==='offers') body=viewOffers();
  else body=viewInbox(), wire=wireInbox;

  main.innerHTML=body;
  renderSide(s.join('/'));
  if(wire) wire();

  /* 공통 배선 */
  on('[data-copy]','click',function(e){
    var v=e.currentTarget.getAttribute('data-copy');
    if(navigator.clipboard) navigator.clipboard.writeText(v).catch(function(){});
    toast('링크를 복사했습니다'); });
  on('[data-act="share"]','click',function(){ location.hash='#/p/'+boardState.pid+'/links'; });
  on('[data-act="addcand"]','click',function(){ toast('후보자 추가 · 이력서 업로드 또는 지원 링크 유입'); });
  on('.tb a, .qr','click',function(){}, main);
}

window.addEventListener('hashchange',function(){ closeOverlay(); render(); window.scrollTo(0,0); });
render();

})();
