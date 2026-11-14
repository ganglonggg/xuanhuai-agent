(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const paths = {
    arrow:'<path d="M4 9h10M10 5l4 4-4 4"/>',
    'arrow-left':'<path d="M14 9H4m4-4L4 9l4 4"/>',
    'arrow-up':'<path d="M9 14V4M5 8l4-4 4 4"/>',
    chevron:'<path d="m5 7 4 4 4-4"/>',
    close:'<path d="m5 5 8 8M13 5l-8 8"/>',
    user:'<circle cx="9" cy="6" r="2.7"/><path d="M3.8 16v-2a5.2 5.2 0 0 1 10.4 0v2"/>',
    spark:'<path d="M9 1v16M1 9h16M3.5 3.5l11 11m0-11-11 11"/>',
    lock:'<rect x="4" y="8" width="10" height="8" rx="2"/><path d="M6 8V5a3 3 0 0 1 6 0v3M9 11v2"/>',
    bookmark:'<path d="M5 2h8v14l-4-3-4 3z"/>',
    bell:'<path d="M3 13h12l-1.6-2V7a4.4 4.4 0 0 0-8.8 0v4zM7 16h4"/>',
    search:'<circle cx="7.8" cy="7.8" r="4.7"/><path d="m11.3 11.3 4 4"/>',
    sliders:'<path d="M2 5h5m4 0h5M2 13h9m4 0h1"/><circle cx="9" cy="5" r="2"/><circle cx="13" cy="13" r="2"/>',
    id:'<rect x="2" y="3" width="14" height="12" rx="2"/><circle cx="6" cy="7" r="1.5"/><path d="M4 12v-1a2 2 0 0 1 4 0v1m3-5h3m-3 4h3"/>',
    clock:'<circle cx="9" cy="9" r="6.5"/><path d="M9 5v4l3 2"/>',
    pin:'<path d="M14.5 7c0 4-5.5 9-5.5 9S3.5 11 3.5 7a5.5 5.5 0 0 1 11 0Z"/><circle cx="9" cy="7" r="1.8"/>',
    info:'<circle cx="9" cy="9" r="6.5"/><path d="M9 8v5m0-8v1"/>',
    check:'<path d="m4 9 3.4 3.4L14 5.8"/>',
    return:'<path d="M14 4v6a3 3 0 0 1-3 3H4m3-3-3 3 3 3"/>',
    link:'<path d="m7 6 2-2a3.5 3.5 0 0 1 5 5l-2 2M6 7 4 9a3.5 3.5 0 0 0 5 5l2-2m-5-1 5-5"/>',
    calendar:'<rect x="2.5" y="4" width="13" height="12" rx="2"/><path d="M6 2v4m6-4v4M3 8h12m-9 3h1m3 0h1"/>',
    mail:'<rect x="2" y="4" width="14" height="11" rx="2"/><path d="m3 5 6 5 6-5"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 18 18" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
  function hydrate(root = document) { $$('[data-icon]', root).forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
  const info = [
    {id:'workshop',type:'活动',title:'把 AI 想法，做成第一个产品',short:'AI 产品共创工作坊',desc:'带着一个校园里的小问题来，在真实讨论里找到产品的第一步。',date:'2026-11-18',day:18,start:'14:00',end:'16:00',campus:'北洋园',venue:'宣怀学院共创空间（虚构）',source:'学院活动公告 · 示例',tags:['AI 产品','共创','工作坊'],art:'silk',note:'适合正在寻找产品实践的同学；是否有时间参加，仍需你自己确认。',details:'从场景观察、问题定义到纸面原型，用两小时完成一次轻量的产品共创。不要求已有完整方案，也不用带着一个“成熟想法”来。',agenda:['14:00 — 从一个校园问题开始','14:30 — 小组讨论与原型草绘','15:30 — 交流、反馈与下一步'],week:0},
    {id:'course',type:'课程',title:'从 0 到 1：产品设计的第一课',short:'产品设计入门',desc:'把观察变成问题，把问题变成一个可验证的方案。',date:'2026-11-17',day:17,start:'19:00',end:'20:30',campus:'线上',venue:'线上会议室 · 链接待确认',source:'公开课程整理 · 示例',tags:['产品设计','入门','公开课'],art:'paper',note:'围绕需求与设计展开，不需要编程基础；本期为演示课程。',details:'从日常的小观察出发，学习梳理用户问题、设计假设和验证方式。课程以小案例和交流为主。',agenda:['19:00 — 发现与定义问题','19:35 — 原型与验证','20:10 — 开放提问'],week:0},
    {id:'project',type:'项目',title:'为校园信息，设计一种更好的相遇',short:'校园信息助手共创',desc:'一个校园信息助手的小型共创，正在寻找体验设计与前端方向。',date:'2026-11-20',day:20,start:'',end:'',campus:'北洋园',venue:'具体讨论地点待确认',source:'学生项目需求卡 · 示例',tags:['体验设计','前端','校园服务'],art:'line',note:'这是公开项目需求，不代表已与你完成匹配。投入时间与分工尚待沟通。',details:'希望将散落在不同渠道的校园公开信息，整理成更容易浏览的体验。先做一个小范围可用的原型，不预设所有人长期加入。',agenda:['阶段一 — 访谈与信息整理','阶段二 — 原型设计与验证','投入时间、分工及成果归属均待双方确认'],week:0},
    {id:'story',type:'活动',title:'从一次尝试，到一段创业日常',short:'校友创业小聚',desc:'不只聊结果，也聊那些还没想明白的选择。',date:'2026-11-19',day:19,start:'18:30',end:'20:00',campus:'卫津路',venue:'校友交流室（虚构）',source:'社群活动整理 · 示例',tags:['创业','校友','交流'],note:'开放的创业故事交流；未使用你的个人经历作为推荐依据。',details:'一场小规模的经验交流，从真实的选择、失败与转向聊起。你可以带问题来，也可以只是听听。',agenda:['18:30 — 主题分享','19:15 — 自由交流'],week:0},
    {id:'prototype',type:'课程',title:'先让原型，替你回答一个问题',short:'轻量原型实验课',desc:'不用一次做完一个产品。先验证最重要的那一个假设。',date:'2026-11-20',day:20,start:'14:00',end:'15:30',campus:'北洋园',venue:'创新实践教室（虚构）',source:'公开课程整理 · 示例',tags:['原型','设计验证','实践'],note:'适合希望把概念变成可讨论原型的同学。',details:'学习用低成本的方式制作可交互原型，再用简短的用户反馈判断是否继续。工具不限，以表达清楚为先。',agenda:['14:00 — 找到要验证的假设','14:30 — 快速原型与互评'],week:0},
    {id:'sustain',type:'项目',title:'让可持续，成为校园里的小事',short:'校园循环计划',desc:'从一件旧物的流转开始，试一次小范围的校园共创。',date:'2026-11-25',day:25,start:'',end:'',campus:'卫津路',venue:'初次交流地点待确认',source:'学生项目需求卡 · 示例',tags:['可持续','校园','运营'],note:'开放的项目需求；角色、时间与合作方式均待确认。',details:'围绕校园闲置物品的再使用，探索一个小范围循环机制。正在寻找对调研、内容和运营感兴趣的同学。',agenda:['范围 — 校园小规模试验','方式 — 先讨论再决定是否参与'],week:1}
  ];
  const peers = [
    {id:'campus',name:'林同学',initial:'林',title:'让校园信息，更好地流动',desc:'一个会做开发的人，和一个关心体验的人，也许能把同一个问题往前推一步。',tags:['体验设计 × 前端开发','校园 AI'],skills:'前端原型与数据整理',need:'一起梳理信息体验',state:'ready'},
    {id:'idea',name:'陈同学',initial:'陈',title:'把一个小想法，轻轻落地',desc:'先用一周探索需求，不承诺长期加入。你们的投入节奏还需要聊一聊。',tags:['产品探索 × 用户访谈','轻量实践'],skills:'访谈与场景调研',need:'原型设计与验证',state:'waiting'},
    {id:'green',name:'许同学',initial:'许',title:'给旧物，下一段校园故事',desc:'本次安排暂时没有对齐。让这次停在这里，也为下一次保留余地。',tags:['校园循环','本次未继续'],skills:'内容与社群运营',need:'校园服务设计',state:'closed'}
  ];
  const storageKey = 'xuanhuai-satin-demo-v1';
  let persisted = {};
  try { persisted = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch (_) { /* Local file storage can be disabled. */ }
  const state = {
    saved:new Set(Array.isArray(persisted.saved) ? persisted.saved.filter(id => info.some(item => item.id === id)) : []),
    reduce:!!persisted.reduce, reminders:persisted.reminders !== false, filter:'all',search:'',campus:'all',week:0,selectedDay:18,
    profile:null,interview:{step:0,answers:[],messages:[],active:false},pause:null,history:[],pending:null,dialog:null,
    connections:Object.fromEntries(peers.map(p => [p.id,{status:p.state,authorized:p.state==='waiting',contact:false}])),notificationRead:false
  };
  function persist() { try { localStorage.setItem(storageKey,JSON.stringify({saved:[...state.saved],reduce:state.reduce,reminders:state.reminders})); } catch (_) {} }
  const dialog = $('#app-dialog');
  let returnFocus = null, closeTimer, toastTimer, toastAction = null;
  function openDialog(title, eyebrow, html, className='') {
    clearTimeout(closeTimer);dialog.classList.remove('closing');
    if (!dialog.open) returnFocus=document.activeElement;
    dialog.className='app-dialog '+className;
    $('#dialog-title').textContent=title;$('#dialog-eyebrow').textContent=eyebrow;
    $('#dialog-content').innerHTML=html;hydrate(dialog);
    if (!dialog.open) {dialog.showModal();document.body.classList.add('modal-open');}
    $('#dialog-content').scrollTop=0;
    requestAnimationFrame(() => { $('.close-dialog',dialog).focus({preventScroll:true}); });
  }
  function closeDialog() {
    if (!dialog.open || dialog.classList.contains('closing')) return;
    dialog.classList.add('closing');
    closeTimer=setTimeout(() => {dialog.close();dialog.classList.remove('closing');document.body.classList.remove('modal-open');returnFocus?.focus?.({preventScroll:true});}, state.reduce?0:180);
  }
  function toast(message, actionLabel, action) {
    clearTimeout(toastTimer);const box=$('#toast');box.classList.remove('toast-out');box.innerHTML=icon('check')+`<span>${escape(message)}</span>`+(actionLabel?`<button data-action="toast-action">${escape(actionLabel)}</button>`:'');box.hidden=false;toastAction=action||null;
    toastTimer=setTimeout(() => {box.classList.add('toast-out');setTimeout(() => {box.hidden=true;},220);},actionLabel?6000:3500);
  }
  function updateCounts() {
    $('#saved-count').textContent=state.saved.size;$('.saved-tiny-count').textContent=state.saved.size;
    $('#profile-note').textContent=state.profile?'已确认':'待认识';
  }
  function setMotion() {document.body.classList.toggle('reduce-motion',state.reduce);document.body.classList.toggle('js-motion',!state.reduce&&!matchMedia('(prefers-reduced-motion: reduce)').matches);}
  function scrollToSection(id) { closeMenu();const target=document.getElementById(id);target?.scrollIntoView({behavior:state.reduce?'instant':'smooth',block:'start'}); }
  function dateText(item) {return item.date.slice(5).replace('-','.');}
  function art(item) {
    if(!item.art) return '';
    return `<div class="card-art art-${item.art}" aria-hidden="true">${item.art==='silk'?'<span class="orb"></span><i class="arc"></i><i class="arc"></i><span class="art-type">AN IDEA, A BEGINNING.</span><span class="art-number">01</span>':item.art==='paper'?'<span class="paper back"></span><span class="paper"></span><span class="art-type" style="color:#9b805b">THINK / MAKE / LEARN</span>':'<span class="loop"></span><span class="art-type" style="color:#a2767e">TOGETHER, A LITTLE FURTHER.</span>'}</div>`;
  }
  function renderFeed() {
    const query=state.search.trim().toLowerCase();
    const items=info.filter(item => (state.filter==='all'||(state.filter==='saved'?state.saved.has(item.id):item.type===state.filter))&&(state.campus==='all'||item.campus===state.campus)&&(!query||[item.title,item.desc,item.campus,...item.tags].join(' ').toLowerCase().includes(query)));
    $('#result-count').textContent=`${items.length} 条${state.filter==='saved'?'已关注':'公开'}信息`;
    $$('.filter-tabs button').forEach(btn => {const selected=btn.dataset.filter===state.filter;btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));});
    $('#information-grid').innerHTML=items.length?items.map(item=>`<article class="info-card ${item.art?'':'compact'}"><button class="card-open" data-info="${item.id}" aria-label="查看：${escape(item.title)}">${art(item)}<div class="card-body"><div class="card-meta"><span class="type-chip">${item.type}</span><span>${item.type==='项目'?'公开需求':'公开信息'} · 示例</span></div><h3>${item.title}</h3><p>${item.desc}</p><div class="card-facts"><span>${icon('clock')}${dateText(item)} ${item.start||'时间待确认'}</span><span>${icon('pin')}${item.campus}</span></div></div></button><div class="card-bottom"><span>${escape(item.source.replace(' · 示例',''))}</span>${saveButton(item.id)}</div></article>`).join(''):`<div class="empty-state"><span class="empty-icon">${icon('search')}</span><h3>把范围，稍微放宽一点。</h3><p>${state.filter==='saved'?'还没有符合条件的关注信息。看到感兴趣的卡片，可以先收藏。':'没有找到符合当前筛选的信息。试试另一个关键词或校区。'}</p><button class="secondary" data-action="reset-filter">查看全部信息 ${icon('arrow')}</button></div>`;
    updateCounts();
  }
  function saveButton(id) {const saved=state.saved.has(id);return `<button class="save-button ${saved?'saved':''}" data-save="${id}" aria-pressed="${saved}" aria-label="${saved?'取消关注':'关注'}：${escape(info.find(i=>i.id===id).title)}">${icon(saved?'check':'bookmark')}<span>${saved?'已关注':'关注'}</span></button>`;}
  function toggleSave(id) {
    const was=state.saved.has(id);was?state.saved.delete(id):state.saved.add(id);persist();renderFeed();
    $$(`[data-save="${id}"]`,dialog).forEach(btn=>{btn.classList.toggle('saved',!was);btn.setAttribute('aria-pressed',String(!was));btn.setAttribute('aria-label',(!was?'取消关注':'关注')+'：'+info.find(i=>i.id===id).title);btn.innerHTML=icon(!was?'check':'bookmark')+`<span>${!was?'已关注':'关注'}</span>`;});
    toast(was?'已取消关注':'已放进我的关注','撤销',()=>{was?state.saved.add(id):state.saved.delete(id);persist();renderFeed();if(state.dialog?.kind==='info')showInfo(id);toast('已撤销');});
  }
  function showInfo(id) {
    const item=info.find(i=>i.id===id);if(!item)return;state.dialog={kind:'info',id};
    openDialog(item.title,'THE DETAILS / 公开信息 · 虚构示例',`<div class="detail-tags"><span>${item.type}</span>${item.tags.map(t=>`<span>${t}</span>`).join('')}</div><p class="lead" style="margin-top:23px">${item.desc}</p><p>${item.details}</p><dl class="detail-facts"><div><dt>日期与时间 · 北京时间</dt><dd>${item.date}${item.start?'　'+item.start+' — '+item.end:' · 具体时刻待确认'}</dd></div><div><dt>地点与校区</dt><dd>${item.campus} · ${item.venue}</dd></div></dl><div class="notice neutral">${icon('info')}<div>${item.note}<br>尚未按你的个人课表判断时间冲突。</div></div><h3>${item.type==='项目'?'关于这次共创':'到现场，可以做什么'}</h3><ul class="fact-list">${item.agenda.map(a=>`<li>${a}</li>`).join('')}</ul><div class="detail-source"><strong>信息从哪里来</strong><p>${item.source}。本条为前端演示编写，不是已核对的学院公告。</p><div class="source-timeline"><p><time>2026.11.15 · 示例记录</time>整理为本期公开信息；没有真实来源链接，不提供假报名入口。</p>${id==='workshop'?'<p><time>2026.11.16 · 示例更新</time>地点字段示意更新；关注不会改变，但需留意后续确认。</p>':''}</div></div><div class="dialog-actions"><button class="secondary" data-action="question" data-id="${id}">${icon('mail')}询问缺失信息</button>${saveButton(id)}</div>`);
  }
  function renderCalendar() {
    const first=16+7*state.week;$('#week-range').textContent=`11.${first} — 11.${first+6}`;
    $('[data-week="-1"]').disabled=state.week===0;$('[data-week="1"]').disabled=state.week===1;
    $('#calendar-days').innerHTML=['MON','TUE','WED','THU','FRI'].map((day,index)=>{const date=first+index;const events=info.filter(i=>i.week===state.week&&i.day===date&&i.type!=='项目');return `<div class="calendar-day ${date===state.selectedDay?'selected':''} ${events.length?'has-events':''}"><button class="calendar-day-head" data-day="${date}" aria-label="查看 11 月 ${date} 日，${events.length} 项安排" aria-pressed="${date===state.selectedDay}"><small>${day}</small><strong>${date}</strong></button>${events.length?events.map(i=>`<button class="calendar-event ${i.type==='活动'?'event-gold':''}" data-info="${i.id}"><span>${i.start}</span><strong>${i.short}</strong><small>${i.campus} · ${i.type}</small></button>`).join(''):'<span class="no-event">留一点空白</span>'}</div>`;}).join('');
    renderDay();
  }
  function renderDay() {
    const events=info.filter(i=>i.day===state.selectedDay&&i.type!=='项目');
    $('#week-aside').innerHTML=`<p class="eyebrow">A LITTLE ROOM FOR YOU</p><div class="aside-day">Nov. ${state.selectedDay}</div><h3>${events.length?'这一天，去探索。':'空白，也是好安排。'}</h3><p>${events.length?'给感兴趣的事留一段时间。点击课程，可以继续了解。':'目前没有公开课程或活动。可以留给自己，也可以看看其他的可能。'}</p><div class="aside-items">${events.map(i=>`<button class="aside-item" data-info="${i.id}"><span>${i.start} — ${i.end} · ${i.campus}</span>${i.title}</button>`).join('')}</div><button class="text-button" data-action="view-courses">浏览全部课程${icon('arrow')}</button>`;
  }
  function renderConnections() {
    $('#connection-grid').innerHTML=peers.map(peer=>{const s=state.connections[peer.id].status;const status={ready:'待你看看',waiting:'等待对方',mutual:'双方愿意',connected:'授权已确认',closed:'本次未继续'}[s];return `<article class="connection-card"><div class="connection-top"><span class="connection-symbol" aria-hidden="true">${icon('link')}</span><span class="connection-status ${s==='waiting'?'waiting':s==='closed'?'closed':''}">${status}</span></div><h3>${peer.title}</h3><p>${peer.desc}</p><div class="complement-tags">${peer.tags.map(t=>`<span>${t}</span>`).join('')}</div><div class="peer-line"><span class="peer-avatar">${peer.initial}</span><span>${peer.name} · 虚构合作卡</span></div><button class="text-button" data-brief="${peer.id}">${s==='closed'?'回看本次简报':s==='waiting'?'查看进展':'打开合作简报'}${icon('arrow')}</button></article>`;}).join('');
  }
  const questions = [
    {key:'goal',title:'我正在寻找',question:'最近，你最想推进的一件事是什么？一个模糊的想法也可以。',choices:['想做一个校园 AI 产品','寻找实践项目','先了解创业与产品设计']},
    {key:'skills',title:'我能提供',question:'如果一起做一件事，你愿意带来什么？能力、经验，或你感兴趣的角色都可以。',choices:['UI 与交互设计','前端开发与原型制作','调研、内容与社群运营']},
    {key:'availability',title:'近期条件',question:'最近能投入多少时间？也可以告诉我明确的时间限制。不确定，就先留白。',choices:['每周大约 2—3 小时','优先短期、小范围尝试','近期先学习，暂不参与项目']}
  ];
  function startInterview(initial='') {
    if(state.interview.active && !initial) {showInterview();return;}
    state.interview={step:0,answers:[],active:true,messages:[{role:'agent',text:'我们用 3 个小问题，整理一个只对你可见的画像草稿。你可以跳过，也可以随时关闭；本次打开页面期间可以继续。\n\n'+questions[0].question}]};
    if(initial) {state.interview.answers[0]=initial;state.interview.step=1;state.interview.messages.push({role:'user',text:initial},{role:'agent',text:'先按你的原话放进草稿，不额外推断。\n\n'+questions[1].question});}
    showInterview();
  }
  function showInterview() {
    const session=state.interview;
    if(session.step>=3){showReview();return;}
    state.dialog={kind:'interview'};
    openDialog('先从认识你开始','GETTING TO KNOW YOU / 本地引导 · '+(session.step+1)+' / 3',`<div class="interview-layout"><div class="chat-column"><div class="interview-progress" aria-label="已完成 ${session.step} 个，共 3 个问题">${questions.map((q,i)=>`<i class="${i<session.step?'complete':''}"></i>`).join('')}</div><div class="conversation" id="conversation" aria-label="访谈对话">${session.messages.map(m=>`<div class="message ${m.role}"><span class="message-icon">${icon(m.role==='agent'?'spark':'user')}</span><div class="message-content">${escape(m.text)}</div></div>`).join('')}</div><div class="interview-choices">${questions[session.step].choices.map(c=>`<button class="choice-chip" data-answer="${escape(c)}">${c}</button>`).join('')}</div><form id="interview-form" class="interview-input"><label class="sr-only" for="interview-answer">${questions[session.step].question}</label><textarea id="interview-answer" placeholder="用自己的话说说…" maxlength="500" rows="2"></textarea><div><button type="button" class="text-button" data-action="skip-question">这题先跳过</button><button class="primary" type="submit">${session.step===2?'整理草稿':'继续'}${icon('arrow')}</button></div></form><p class="small-note">本地规则演示，不是实时 AI。原话只留在本次页面内存中，刷新后清空。</p></div><aside class="live-draft"><div class="draft-status"><i></i>正在整理 · 尚未生效</div><h3>一点点，清晰起来。</h3><p>确认前，不作为正式画像。</p><dl>${questions.map((q,i)=>`<div class="draft-field"><dt>${q.title} · 本人提供</dt><dd class="${session.answers[i]?'':'unknown'}">${escape(session.answers[i]||'尚未提供')}</dd></div>`).join('')}</dl><p class="small-note">只记下你说的，不把未知当成否定。</p></aside></div>`,'interview-dialog');
    requestAnimationFrame(()=>{$('#conversation').scrollTop=$('#conversation').scrollHeight;});
  }
  function answerQuestion(answer) {
    if(state.interview.step>=3)return;
    const session=state.interview;session.answers[session.step]=answer;session.messages.push({role:'user',text:answer||'这题先跳过'});session.step++;
    if(session.step<3)session.messages.push({role:'agent',text:(answer?'记下了，先保留你的原话。':'没关系，先标为尚未提供。')+'\n\n'+questions[session.step].question});
    showInterview();
  }
  function showReview() {
    const answers=state.interview.answers;
    state.dialog={kind:'review'};
    openDialog('这是我刚认识的你','YOUR FIRST PORTRAIT / 等待本人确认',`<div class="review-summary">${icon('spark')}<div><strong>不是标签，是可以改写的开始。</strong><p>下面只整理你刚才提供的内容。未知保持未知，你可以直接编辑。</p></div></div><form id="confirm-profile"><label class="field"><span>我正在寻找</span><textarea name="goal" maxlength="500" placeholder="尚未提供">${escape(answers[0]||'')}</textarea></label><label class="field"><span>我能提供</span><textarea name="skills" maxlength="500" placeholder="尚未提供">${escape(answers[1]||'')}</textarea></label><div class="form-row"><label class="field"><span>近期条件</span><input name="availability" maxlength="500" placeholder="尚未提供" value="${escape(answers[2]||'')}"></label><label class="field"><span>常去校区 · 可选</span><select name="campus"><option value="">尚未提供</option>北洋园</option><option>卫津路</option><option>线上优先</option></select></label></div><div class="notice neutral">${icon('lock')}<div>仅自己可见。确认画像不会公开资料，也不会自动开启合作匹配。演示中只保存在页面内存。</div></div><div class="dialog-actions"><button type="button" class="secondary" data-action="restart-interview">重新聊聊</button><button class="primary" type="submit">确认，让下一步发生${icon('check')}</button></div></form>`);
  }
  function saveProfile(form, source) {
    const data=new FormData(form);const profile={};['goal','skills','availability','campus'].forEach(k=>{profile[k]=String(data.get(k)||'').trim();});
    state.profile=profile;state.interview.active=false;
    state.history.push({type:'profile',label:source==='interview'?'确认初版画像':'本人编辑画像',at:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})});
    $('#hero-greeting').textContent='想法已记下，我们从你感兴趣的方向开始。';
    $('#feed-caption').textContent='画像已由你确认。以下仍为公开示例，尚未进行真实个性化匹配。';
    updateCounts();showProfile();toast(source==='interview'?'画像已确认 · 仅在本次页面内生效':'画像已更新');
  }
  function showProfile(edit=false) {
    state.dialog={kind:'profile'};
    if(!state.profile){openDialog('我的画像','MY PORTRAIT / 先认识一点点',`<div class="empty-state"><span class="empty-icon">${icon('user')}</span><h3>你的故事，还没开始整理。</h3><p>不急着给自己下定义。聊三个问题，或先看看公开机会。</p><button class="primary" data-action="interview">${state.interview.active?'继续上次访谈':'从认识我开始'}${icon('arrow')}</button></div>${state.pause?`<div class="notice neutral">${icon('clock')}<div>已确认临时暂停项目邀请至 ${escape(state.pause.until)}。兴趣与能力仍未提供，没有被推断或修改。<br><button class="text-button" data-action="undo-pause">撤销临时状态${icon('return')}</button></div></div>`:''}<div class="notice neutral">${icon('lock')}<div>不做画像也能浏览全部公开信息。未提供的内容不会被当作“不具备”。</div></div>`);return;}
    const p=state.profile;
    if(edit) {openDialog('把变化，告诉我','EDIT YOUR PORTRAIT / 本人编辑',`<form id="edit-profile">${questions.map(q=>`<label class="field"><span>${q.title} · 本人提供</span><textarea name="${q.key}" maxlength="500" placeholder="尚未提供">${escape(p[q.key])}</textarea></label>`).join('')}<label class="field"><span>常去校区</span><select name="campus">${['','北洋园','卫津路','线上优先'].map(v=>`<option value="${v}" ${p.campus===v?'selected':''}>${v||'尚未提供'}</option>`).join('')}</select></label><p class="small-note">保存后仅在本次打开的页面内生效，不发送到服务器。</p><div class="dialog-actions"><button class="secondary" type="button" data-action="profile">取消</button><button class="primary" type="submit">保存修改${icon('check')}</button></div></form>`);return;}
    openDialog('我的画像','MY PORTRAIT / 由你确认，由你改写',`<div class="profile-preview"><p class="eyebrow">A PORTRAIT, NOT A LABEL</p><h3>你好，正在探索的你。</h3><dl>${questions.map(q=>`<dt>${q.title}</dt><dd>${escape(p[q.key]||'尚未提供')}</dd>`).join('')}<dt>常去校区</dt><dd>${escape(p.campus||'尚未提供')}</dd><dt>信息来源</dt><dd>本人提供 · 本次页面内确认</dd><dt>可见范围</dt><dd>仅自己可见</dd></dl></div>${state.pause?`<div class="notice neutral">${icon('clock')}<div>你已确认一项临时状态：暂停项目邀请至 ${escape(state.pause.until)}。只影响邀请节奏，不改变兴趣和能力。<br><button class="text-button" data-action="undo-pause">撤销临时状态${icon('return')}</button></div></div>`:''}<div class="dialog-actions"><button class="secondary" data-action="propose-pause">更新近期状态</button><button class="primary" data-action="edit-profile">编辑画像${icon('arrow')}</button></div><h3>修改记录</h3>${state.history.slice().reverse().slice(0,5).map(h=>`<div class="history-entry"><strong>${escape(h.label)}</strong><span>${escape(h.at||'本次会话')} · 本人确认 · 本地示例</span></div>`).join('')}<p class="small-note">画像和访谈不写入浏览器长期存储，刷新会清空；关注与界面偏好保留在当前浏览器。任何已分享的信息，不能仅靠撤销画像从他人手中收回。</p>`);
  }
  function showPauseForm() {
    openDialog('只更新你明确说的部分','A CHANGE, WITH YOUR SAY / 临时状态',`<p class="lead">最近的节奏变了？先说清楚，再决定是否更新。</p><p>不是从“匹配没有继续”推断你的状态。你需要在这里明确提供限制和期限，系统才会生成一条待确认建议。</p><form id="pause-form"><label class="field"><span>你的具体情况 · 必填</span><textarea name="evidence" required maxlength="300" placeholder="例如：最近在准备考试，这段时间先不参与新项目。"></textarea></label><label class="field"><span>暂停项目邀请至 · 必填（含所选日期）</span><input type="date" name="until" required min="2026-11-15" value="2026-11-29"></label><p class="small-note">原型使用 2026 年 11 月 15 日为示例基准日。此变化不等于拒绝长期兴趣，也不影响浏览课程。</p><div class="dialog-actions"><button class="secondary" type="button" data-action="profile">取消</button><button class="primary" type="submit">先预览改动${icon('arrow')}</button></div></form>`);
  }
  function showPausePreview() {
    const p=state.pending;
    openDialog('这一处变化，由你决定','PROFILE CHANGE / 尚未生效',`<p class="lead">仅调整项目邀请的节奏。</p><div class="diff-row"><div><span>原状态</span>${state.pause?'暂停至 '+escape(state.pause.until):'未设置临时暂停'}</div>${icon('arrow')}<div><span>建议更新 · 仅近期状态</span>暂停项目邀请至 ${escape(p.until)}（含当日）</div></div><h4>依据：你刚才明确说</h4><p style="white-space:pre-wrap">“${escape(p.evidence)}”</p><div class="notice neutral">${icon('info')}<div>不修改你的兴趣、能力或常去校区。仅影响期限内的新项目邀请，课程与公开信息仍可浏览；仅自己可见，演示中不会真实发送邀请。</div></div><p class="small-note">没有默认同意。忽略、关闭或稍后查看，都不会更新画像。</p><div class="dialog-actions"><button class="secondary" data-action="ignore-pause">忽略建议</button><button class="primary" data-action="confirm-pause">确认这一处变化${icon('check')}</button></div>`);
  }
  function showBrief(id) {
    const peer=peers.find(p=>p.id===id);if(!peer)return;const con=state.connections[id];state.dialog={kind:'brief',id};
    let decision='';
    if(con.status==='ready')decision=`<div class="dialog-actions"><button class="secondary" data-decline="${id}">暂不参与</button><button class="primary" data-consent="${id}">愿意进一步了解${icon('arrow')}</button></div><p class="small-note">下一步会先给你看共享内容。尚未发出意向，也没有交换联系方式。</p>`;
    if(con.status==='waiting')decision=`<div class="brief-state"><h3>你的意向已记录，等另一边。</h3><p>本地演示状态：只共享刚确认的合作摘要，未共享联系方式。你可以撤回，不需要解释。</p><button class="text-button" data-withdraw="${id}">撤回本次意向${icon('return')}</button></div><div class="demo-controls">演示控制 · 不是对方的真实操作<div><button data-simulate="agree" data-id="${id}">演示：对方也愿意</button><button data-simulate="decline" data-id="${id}">演示：对方未继续</button></div></div>`;
    if(con.status==='mutual')decision=`<div class="brief-state success"><h3>愿意同行，先确认怎么联系。</h3><p>双方意向已在演示中设为愿意。这还不是合作承诺，也不代表已经交换联系方式。</p></div><div class="dialog-actions"><button class="secondary" data-withdraw="${id}">撤回意向</button><button class="primary" data-contact="${id}">确认联系授权${icon('lock')}</button></div>`;
    if(con.status==='connected')decision=`<div class="brief-state success"><h3>联系授权已在本地确认。</h3><p>这里在正式产品中承接双方允许共享的联络方式。当前没有真实账号，不生成或交换任何联系方式。</p><button class="text-button" data-revoke="${id}">撤销后续共享授权${icon('return')}</button></div>`;
    if(con.status==='closed')decision=`<div class="brief-state"><h3>让这一次，先停在这里。</h3><p>此次没有继续，不代表能力不合适或兴趣改变。未修改任何画像，也不会替你继续游说。</p><button class="text-button" data-action="propose-pause">如果近期确实有变化，主动补充${icon('arrow')}</button></div>`;
    openDialog(peer.title,'CONNECTION BRIEF / 合作简报 · V1 · 虚构演示',`<div class="brief-heading"><div class="peer-line"><span class="peer-avatar">${peer.initial}</span>${peer.name} · 已授权合作卡示例</div><span class="outline-label">不含联系方式</span></div><p class="lead">两个不同的出发点，也许能把同一件事向前推一点。</p><div class="brief-panels"><div class="brief-panel"><h3>${icon('link')}可以互补的部分</h3><p>对方提供：${peer.skills}。<br>正在寻找：${peer.need}。<br>${state.profile?'你的方向仍需对照本次具体需求，不把自述能力等同于平台认证。':'你的画像尚未确认；当前仅展示流程示例，不宣称真实匹配。'}</p></div><div class="brief-panel"><h3>${icon('clock')}还需要说清楚</h3><p>每周能投入多少时间？<br>更倾向线上还是线下？<br>分工、成果归属与项目节奏均未知，不能视作已经一致。</p></div></div><h3>第一次真人讨论，可以从这里开始。</h3><ol class="fact-list"><li>各自最想解决的一个具体问题是什么？</li><li>是否愿意先做一周的小范围尝试？</li><li>第一步由谁做什么，什么时候回看？</li></ol><details class="brief-evidence"><summary>查看依据与共享边界</summary><p>示例依据：对方合作卡中的“${peer.skills}”与“${peer.need}”。本简报为预置的前端样例，没有真实 Agent 对话历史，也没有自动判断你们已经适合。<br>不读取或公开私人访谈全文、完整课表、账号信息和未授权资料。</p></details>${decision}`);
  }
  function showConsent(id) {
    const peer=peers.find(p=>p.id===id);const p=state.profile;state.dialog={kind:'consent',id};
    openDialog('只分享，这张合作卡','SHARE WITH INTENTION / 预览后再授权',`<p>接收对象：${peer.name}的个人 Agent（虚构）。用途：仅核对本次合作条件。授权仅对本次演示会话有效，不包含联系方式。</p><form id="consent-form" data-id="${id}"><label class="field"><span>本次想做什么 · 必填</span><textarea name="goal" required maxlength="300" placeholder="写一句本次希望推进的事">${escape(p?.goal||'希望先一起探索一个校园产品的小原型')}</textarea></label><label class="field"><span>本次能提供什么 · 可选</span><textarea name="skills" maxlength="300" placeholder="可以留白，不代表没有能力">${escape(p?.skills||'')}</textarea></label><label class="field"><span>近期投入条件 · 可选</span><input name="availability" maxlength="300" value="${escape(p?.availability||'')}" placeholder="尚未提供"></label><div class="notice neutral">${icon('lock')}<div>只分享以上三项，不含私人访谈、完整画像、课表或联系方式。正式产品应由后端校验权限；这里不真实发送。</div></div><label class="checkbox-row"><input type="checkbox" required name="authorize"><span>我已检查这张卡，允许仅在本次合作中共享以上摘要，并记录“愿意进一步了解”的意向。</span></label><div class="dialog-actions"><button class="secondary" type="button" data-brief="${id}">暂不授权</button><button class="primary" type="submit">授权并记录意向${icon('check')}</button></div></form>`);
  }
  function showDecline(id) {
    state.dialog={kind:'decline',id};openDialog('这次不参与，也没关系','YOUR CHOICE / 只处理本次合作',`<p class="lead">选择可以很轻，不必成为一个永久标签。</p><form id="decline-form" data-id="${id}"><p>可以选一个原因，也可以不说明。默认不分享原因、不修改画像。</p><div class="decline-reasons">${['时间不合适','本次需求不符','信息还不充分','不想说明'].map(r=>`<label><input type="radio" name="reason" value="${r}">${r}</label>`).join('')}</div><div class="notice neutral">${icon('info')}<div>结束本次合作后，不继续自动劝说。你的能力和兴趣都保持原样；如果近期状态有变化，可以之后主动补充。</div></div><div class="dialog-actions"><button class="secondary" data-brief="${id}" type="button">再看看</button><button class="primary" type="submit">确认本次不参与${icon('check')}</button></div></form>`);
  }
  function showContact(id) {
    state.dialog={kind:'contact',id};openDialog('再确认一次，才走近一点','A SEPARATE PERMISSION / 联系授权',`<p class="lead">双方愿意，不等于可以直接交换账号。</p><p>正式产品会在这里展示双方已允许共享的渠道与具体内容。当前没有真实登录账号，因此本原型只演示这一步授权，不收集你的邮箱、电话或微信号。</p><form id="contact-form" data-id="${id}"><div class="check-list"><label class="checkbox-row"><input type="checkbox" required><span>我理解这是独立于合作意向的授权，并确认在本地演示中继续；不会发送真实资料。</span></label></div><div class="dialog-actions"><button class="secondary" type="button" data-brief="${id}">暂不授权</button><button class="primary" type="submit">确认演示授权${icon('check')}</button></div></form>`);
  }
  function showSaved() {
    state.dialog={kind:'saved'};const items=info.filter(i=>state.saved.has(i.id));
    openDialog('先收好，再慢慢看','SAVED FOR LATER / 我的关注',items.length?`<p>关注的只是这个可能，不意味着报名或加入。</p><div class="mini-results">${items.map(i=>`<div class="list-item"><span class="list-icon">${icon('bookmark')}</span><div><h3>${i.title}</h3><p>${i.date} · ${i.campus} · 示例</p><button class="text-button" data-info="${i.id}">打开详情${icon('arrow')}</button></div><button class="icon-button" data-unsave="${i.id}" aria-label="取消关注：${i.title}">${icon('close')}</button></div>`).join('')}</div><p class="small-note">只将示例信息的编号保存在当前浏览器，不存访谈与联系方式。</p>`:`<div class="empty-state"><span class="empty-icon">${icon('bookmark')}</span><h3>给未来的自己，留一点可能。</h3><p>在感兴趣的信息卡片上点“关注”，以后就能从这里找到。</p><button class="primary" data-action="go-discover">去看看今日整理${icon('arrow')}</button></div>`);
  }
  function showNotifications() {
    state.notificationRead=true;$('.notification-dot').hidden=true;state.dialog={kind:'notifications'};
    openDialog('有一点新的进展','SMALL UPDATES / 动态与提醒 · 示例',`<div class="list-item"><span class="list-icon">${icon('pin')}</span><div><h3>工作坊地点，有一条更新</h3><p>“AI 产品共创工作坊”的示例地点已补充。正式信息仍需以原公告为准，演示不发送邮件。</p><small>2026.11.16 · 示例通知</small><br><button class="text-button" data-info="workshop">查看这条信息${icon('arrow')}</button></div></div><div class="list-item"><span class="list-icon">${icon('link')}</span><div><h3>有一份合作简报，等你看看</h3><p>先了解可互补的部分和未知条件，再决定是否授权进一步交流。</p><small>2026.11.15 · 示例通知</small><br><button class="text-button" data-brief="campus">打开简报${icon('arrow')}</button></div></div><p class="small-note">以上均为预置演示通知，并不是学院真实活动或他人的新消息。</p>`);
  }
  function showSettings() {
    state.dialog={kind:'settings'};openDialog('让节奏，适合你','MAKE IT YOURS / 偏好设置',`<div class="toggle-row"><div><strong>减少动态效果</strong><p>关闭绢光视差与出现动画，保留即时的状态反馈。也会尊重系统的减少动态设置。</p></div><button class="switch" role="switch" aria-label="减少动态效果" aria-checked="${state.reduce}" data-toggle="motion"><i></i></button></div><div class="toggle-row"><div><strong>关注信息的页面内提醒</strong><p>演示开关，只影响此原型偏好；没有邮件、系统推送或后台任务。</p></div><button class="switch" role="switch" aria-label="关注信息的页面内提醒" aria-checked="${state.reminders}" data-toggle="reminders"><i></i></button></div><h3>这台浏览器记住什么</h3><p>仅保存关注的示例信息编号与以上偏好。访谈、画像、合作卡、授权均在页面内存中，刷新即清空。</p><div class="notice neutral">${icon('info')}<div>这是设计交互原型，不是实际账号或安全权限系统。请不要输入真实联系方式、课表或敏感信息。</div></div><div class="dialog-actions"><button class="danger-button" data-action="reset-confirm">重置演示</button><button class="primary" data-action="close-dialog">完成${icon('check')}</button></div>`);
  }
  function showAccount() {
    state.dialog={kind:'account'};openDialog('一个只属于你的入口','YOUR SPACE / 账号信息',`<div class="review-summary">${icon('user')}<div><strong>本地访客 · 体验模式</strong><p>当前未登录，未验证学籍，也没有连接学院身份系统。</p></div></div><div class="account-detail"><div><span>身份</span><strong>交互演示访客</strong></div><div><span>所属社群</span><strong>宣怀学院 · 产品概念场景</strong></div><div><span>真实账户</span><strong>尚未接入</strong></div><div><span>画像可见范围</span><strong>仅本次页面</strong></div></div><p class="small-note">正式版本的学院标识使用、身份认证与账号管理需团队确认。这里不模拟“登录成功”，也不收集账号密码。</p><div class="dialog-actions"><button class="secondary" data-action="settings">偏好设置</button><button class="primary" data-action="profile">我的画像${icon('arrow')}</button></div>`);
  }
  function showAbout() {
    state.dialog={kind:'about'};openDialog('让设计，先真实可感','XUANHUAI AGENT / 绯金绢光 · 交互原型',`<p class="lead">一份为宣怀社群展开的日常。</p><p>保留原色学院标识，以象牙白留白、绯红的温度和香槟金绢光，将对话、公开信息与合作可能串成一条纵向体验。</p><h3>你现在可以体验</h3><ul class="fact-list"><li>三个问题的访谈、可编辑草稿与本人确认。</li><li>分类、搜索、校区筛选、关注与卡片详情。</li><li>一周公开课程日历与日期切换。</li><li>合作简报、共享预览、独立授权、撤回与结束。</li><li>个人画像编辑、明确依据的临时状态更新与撤销。</li></ul><div class="notice neutral">${icon('info')}<div>所有人物、课程、项目、消息和 Agent 状态均为虚构演示。没有后端、真实匹配、报名、邮件或联系交换。请勿输入敏感资料。</div></div><p class="small-note">页面时间基于 2026 年 11 月 16—29 日的示例安排；活动时区统一显示北京时间 UTC+8。微交互支持键盘、触屏与系统减少动态设置。</p><div class="dialog-actions"><button class="primary" data-action="close-dialog">开始体验${icon('arrow')}</button></div>`);
  }
  function showPrinciples() {
    state.dialog={kind:'principles'};openDialog('不把一次结果，写成你的标签','A PORTRAIT, NOT A VERDICT / 画像更新原则',`<p class="lead">合作没有继续，不是更新画像的依据。</p><div class="brief-panels"><div class="brief-panel"><h3>可以作为依据</h3><p>你明确说出的新目标、可提供的能力，或带有期限的时间限制。要能对应具体字段，并由你确认。</p></div><div class="brief-panel"><h3>不能直接推断</h3><p>没匹配上 ≠ 没能力。<br>没有回复 ≠ 没兴趣。<br>这周很忙 ≠ 永远不想参加。<br>对方拒绝 ≠ 你不适合。</p></div></div><h3>每次更新，先看这四件事</h3><ol class="fact-list"><li>原值和建议值分别是什么。</li><li>依据来自哪一句明确的本人陈述。</li><li>影响范围和失效期限是什么。</li><li>确认、忽略和撤销都能自己决定。</li></ol><div class="dialog-actions"><button class="secondary" data-action="close-dialog">知道了</button><button class="primary" data-action="propose-pause">体验一次临时状态更新${icon('arrow')}</button></div>`);
  }
  function showQuestion(id) {
    const item=info.find(i=>i.id===id);state.dialog={kind:'question',id};
    openDialog('不确定的，先问清楚','ASK, DON’T ASSUME / 本地追问草稿',`<p>关于「${item.title}」。原型只保留本地草稿，不真实发给老师或负责人。</p><form id="question-form" data-id="${id}"><label class="field"><span>具体想确认什么</span><textarea name="question" required maxlength="500" placeholder="例如：线上会议链接在哪里查看？">${item.venue.includes('待确认')?'想确认一下具体地点或参与链接。':''}</textarea></label><div class="notice neutral">${icon('mail')}<div>没有接入分派或邮件服务，因此不会显示“老师已收到”。正式产品应区分待分派、等待答复与已答复。</div></div><div class="dialog-actions"><button class="secondary" type="button" data-info="${id}">返回详情</button><button class="primary" type="submit">保存本地追问草稿${icon('check')}</button></div></form>`);
  }
  function resetFilters() {state.filter='all';state.search='';state.campus='all';$('#feed-search').value='';$('#campus-filter').value='all';renderFeed();}
  function heroSubmit() {
    const text=$('#hero-input').value.trim();
    if(!text) {startInterview();return;}
    const searchIntent=/今日|今天|本周|课程|课表|日历|有哪些|查找|检索|搜索|看看|找找/.test(text);
    if(!searchIntent&&/^(我想|我会|我是|希望|想做|认识我|开始访谈|帮我建立)/.test(text)){startInterview(/^(认识我|开始访谈|帮我建立)/.test(text)?'':text);$('#hero-input').value='';return;}
    resetFilters();
    if(/课程|课表|日历/.test(text)) {scrollToSection('week');toast('已展开一周公开课程 · 不是个人课表');}
    else {const directTag=['AI','产品设计','原型','创业','可持续','前端','校园','运营'].find(t=>text.toLowerCase().includes(t.toLowerCase()));const generic=searchIntent||/^(有什|推荐|帮我找|最近)/.test(text);const query=directTag||(generic?'':text);if(/项目/.test(text))state.filter='项目';else if(/活动/.test(text))state.filter='活动';state.search=query;$('#feed-search').value=query;renderFeed();scrollToSection('discover');toast(query?`已按“${query}”检索本地示例`:'已为你展开本期整理 · 全部为示例');}
    $('#hero-input').value='';
  }
  function closeMenu() {$('#me-menu').hidden=true;$('#me-button').setAttribute('aria-expanded','false');}
  function setNav() {
    const top=scrollY+innerHeight*.38;let active='home';
    $$('.chapter').forEach(section=>{if(section.offsetTop<=top)active=section.id;});
    $$('.main-nav>a,.chapter-rail>a').forEach(a=>{const selected=a.getAttribute('href')==='#'+active;a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
    const current=$('.main-nav>a.active');if(current){$('.nav-indicator').style.left=current.offsetLeft+'px';$('.nav-indicator').style.width=current.offsetWidth+'px';}
    $('.site-header').classList.toggle('scrolled',scrollY>50);
    const max=document.documentElement.scrollHeight-innerHeight;$('.reading-progress i').style.transform=`scaleX(${max?Math.min(scrollY/max,1):0})`;
    if(!state.reduce&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&scrollY<innerHeight*1.2)document.documentElement.style.setProperty('--silk-offset',`${Math.min(scrollY*.14,100)}px`);
  }
  let scrollPending=false;
  addEventListener('scroll',()=>{if(!scrollPending){scrollPending=true;requestAnimationFrame(()=>{setNav();scrollPending=false;});}},{passive:true});
  addEventListener('resize',setNav);
  $('#hero-form').addEventListener('submit',event=>{event.preventDefault();heroSubmit();});
  $('#hero-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('#hero-form').requestSubmit();}});
  $('#feed-search').addEventListener('input',event=>{state.search=event.target.value;renderFeed();});
  $('#campus-filter').addEventListener('change',event=>{state.campus=event.target.value;renderFeed();});
  $('#me-button').addEventListener('click',()=>{const expanded=$('#me-button').getAttribute('aria-expanded')==='true';$('#me-menu').hidden=expanded;$('#me-button').setAttribute('aria-expanded',String(!expanded));});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$('#me-menu').hidden){closeMenu();$('#me-button').focus();}}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');
    if(!event.target.closest('.me-wrap'))closeMenu();
    if(!target)return;
    if(target.matches('a[href^="#"]')){const id=target.getAttribute('href').slice(1);if(document.getElementById(id)){event.preventDefault();scrollToSection(id);}return;}
    if(target.disabled)return;
    if(target.matches('.close-dialog')){closeDialog();return;}
    if(target.dataset.filter){state.filter=target.dataset.filter;renderFeed();return;}
    if(target.dataset.info){showInfo(target.dataset.info);return;}
    if(target.dataset.save){toggleSave(target.dataset.save);return;}
    if(target.dataset.unsave){state.saved.delete(target.dataset.unsave);persist();renderFeed();showSaved();toast('已取消关注');return;}
    if(target.dataset.week){state.week=Math.max(0,Math.min(1,state.week+Number(target.dataset.week)));state.selectedDay=16+state.week*7;renderCalendar();$('#live-announcement').textContent='已切换至 11 月 '+(16+state.week*7)+' 日这一周';return;}
    if(target.dataset.day){state.selectedDay=Number(target.dataset.day);renderCalendar();return;}
    if(target.dataset.answer){answerQuestion(target.dataset.answer);return;}
    if(target.dataset.brief){showBrief(target.dataset.brief);return;}
    if(target.dataset.consent){showConsent(target.dataset.consent);return;}
    if(target.dataset.decline){showDecline(target.dataset.decline);return;}
    if(target.dataset.contact){showContact(target.dataset.contact);return;}
    if(target.dataset.withdraw){const id=target.dataset.withdraw;state.connections[id]={status:'ready',authorized:false,contact:false};renderConnections();showBrief(id);toast('已撤回意向，并取消本次后续共享');return;}
    if(target.dataset.revoke){const id=target.dataset.revoke;state.connections[id].status='mutual';state.connections[id].contact=false;renderConnections();showBrief(id);toast('已撤销后续联系共享 · 不代表能收回已发出信息');return;}
    if(target.dataset.simulate){const id=target.dataset.id;state.connections[id].status=target.dataset.simulate==='agree'?'mutual':'closed';if(target.dataset.simulate==='decline')state.connections[id].authorized=false;renderConnections();showBrief(id);toast('仅切换了演示状态，没有真实对方操作');return;}
    if(target.dataset.toggle){if(target.dataset.toggle==='motion'){state.reduce=!state.reduce;setMotion();target.setAttribute('aria-checked',String(state.reduce));}else {state.reminders=!state.reminders;target.setAttribute('aria-checked',String(state.reminders));}persist();toast('偏好已保存在当前浏览器');return;}
    const action=target.dataset.action;if(!action)return;closeMenu();
    const actions={
      about:showAbout,interview:()=>startInterview(),profile:()=>showProfile(),saved:showSaved,notifications:showNotifications,settings:showSettings,account:showAccount,principles:showPrinciples,
      'close-dialog':closeDialog,'edit-profile':()=>showProfile(true),'propose-pause':showPauseForm,
      'go-discover':()=>{closeDialog();scrollToSection('discover');},
      'view-courses':()=>{state.filter='课程';state.search='';state.campus='all';$('#feed-search').value='';$('#campus-filter').value='all';renderFeed();scrollToSection('discover');},
      'reset-filter':resetFilters,'current-week':()=>{state.week=0;state.selectedDay=18;renderCalendar();},
      'skip-question':()=>answerQuestion(''),'restart-interview':()=>startInterviewFresh(),
      'ignore-pause':()=>{state.pending=null;showProfile();toast('建议已忽略，画像未修改');},
      'confirm-pause':()=>{if(!state.pending)return;const old=state.pause;state.pause={...state.pending};state.pending=null;state.history.push({label:'确认临时状态：暂停至 '+state.pause.until});showProfile();toast('仅近期邀请状态已更新','撤销',()=>{state.pause=old;state.history.push({label:'撤销临时状态更新'});if(dialog.open)showProfile();toast('已撤销');});},
      'undo-pause':()=>{state.pause=null;state.history.push({label:'撤销临时状态更新'});showProfile();toast('已撤销临时状态，兴趣与能力未改变');},
      question:()=>showQuestion(target.dataset.id),
      'toast-action':()=>{const fn=toastAction;clearTimeout(toastTimer);$('#toast').hidden=true;toastAction=null;fn?.();},
      'reset-confirm':()=>openDialog('重新开始这次体验？','START FRESH / 重置演示',`<p class="lead">清空访谈、画像、合作状态与本浏览器中的关注和偏好。</p><p>此操作只影响本原型，不涉及真实账号。当前演示资料清空后不能恢复。</p><div class="dialog-actions"><button class="secondary" data-action="settings">保留当前体验</button><button class="danger-button" data-action="reset-all">确认重置</button></div>`),
      'reset-all':()=>{try{localStorage.removeItem(storageKey);}catch(_){}location.reload();}
    };actions[action]?.();
  });
  function startInterviewFresh(){state.interview.active=false;startInterview();}
  document.addEventListener('submit',event=>{
    const form=event.target;if(!form.closest('#app-dialog'))return;event.preventDefault();
    if(!form.reportValidity())return;
    if(form.id==='interview-form'){const value=$('#interview-answer').value.trim();if(!value){$('#interview-answer').focus();toast('写一句话，或选择“这题先跳过”');return;}answerQuestion(value);}
    if(form.id==='confirm-profile')saveProfile(form,'interview');
    if(form.id==='edit-profile')saveProfile(form,'edit');
    if(form.id==='pause-form'){const data=new FormData(form);const evidence=String(data.get('evidence')||'').trim();if(!evidence){toast('请先明确提供你的情况');return;}state.pending={evidence,until:String(data.get('until'))};showPausePreview();}
    if(form.id==='consent-form'){const id=form.dataset.id;const con=state.connections[id];con.authorized=true;con.status='waiting';con.card=Object.fromEntries(new FormData(form));renderConnections();showBrief(id);toast('已在本地记录授权与意向 · 未真实发送');}
    if(form.id==='decline-form'){const id=form.dataset.id;state.connections[id]={status:'closed',authorized:false,contact:false};renderConnections();showBrief(id);toast('本次已结束，画像未修改');}
    if(form.id==='contact-form'){const id=form.dataset.id;state.connections[id].status='connected';state.connections[id].contact=true;renderConnections();showBrief(id);toast('演示授权已确认 · 没有交换真实资料');}
    if(form.id==='question-form'){const id=form.dataset.id;const question=String(new FormData(form).get('question')||'').trim();if(!question){toast('请填写一个具体问题');return;}state.connections.localQuestion={id,question};openDialog('追问草稿，先替你收好','LOCAL DRAFT / 未发送',`<div class="notice success">${icon('check')}<div>只保存在本次页面内存中，没有发送给老师或负责人。</div></div><p class="lead" style="white-space:pre-wrap">${escape(question)}</p><p class="small-note">刷新页面后清空。本原型没有邮件或后台追问服务，因此不会显示“已收到”或“等待老师回复”。</p><div class="dialog-actions"><button class="secondary" data-info="${id}">返回详情</button><button class="primary" data-action="close-dialog">知道了${icon('check')}</button></div>`);}
  });
  hydrate();setMotion();renderFeed();renderCalendar();renderConnections();setNav();
  const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target);}});},{threshold:.08});
  $$('.reveal').forEach(el=>observer.observe(el));
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',setMotion);
  document.fonts.ready.then(setNav);
})();
