let cooperationTeacher=false,cooperationData=null,cooperationRequest=0;
const cooperationFields={skills:'技能标签（学生填写已有能力，项目方填写所需能力）',hours:'每周时数（学生填写可投入，项目方填写最低要求）',mode:'参与方式',title:'标题',summary:'可公开简介',lookingFor:'希望找到的人 / 想讨论的问题',offering:'能提供什么 / 可约时间',expectations:'投入与合作预期',kind:'类型',audience:'可见范围',memberIds:'指定成员',who:'我是谁',experience:'我做过什么',availability:'我能投入多少',decision:'是否继续',contact:'我批准交换的联系方式',time:'约见时间（北京时间）',duration:'时长（分钟）',place:'地点 / 线上方式',agenda:'约见议题'};
function cooperationValue(key,value){
 const names={project:'项目找人',availability:'导师可约时间',members:'所有已登录生态成员',selected:'仅指定成员',accepted:'愿意继续',declined:'暂不继续'};
 return ['kind','audience','decision'].includes(key)?names[value]||value:Array.isArray(value)?value.join('、'):String(value??'');
}
function cooperationPreview(draft){
 const p=draft.payload;
 return `<div class="cooperation-preview">${Object.entries(p).filter(([k])=>cooperationFields[k]).map(([k,v])=>`<div class="change-row"><span>${esc(cooperationFields[k])}</span><div>${draft.operation==='publish_need'&&draft.before&&JSON.stringify(draft.before[k])!==JSON.stringify(v)?`<del>${esc(cooperationValue(k,draft.before[k]))}</del>`:''}<strong>${esc(cooperationValue(k,v))}</strong></div></div>`).join('')}
 ${draft.operation==='publish_need'?'<p>请确认以上内容可向所选范围发布，且不含未经授权的技术细节。'+(draft.before?'修改后，尚未建立联系的旧意向将结束，学生需要按新条件重新表达意向。':'')+'</p>':''}
 ${draft.operation==='consent_contact'?'<p>只有双方都许可，才向彼此展示联系方式；交换后无法收回对方已经看到的信息。</p>':''}
 ${draft.operation==='decide_interest'?'<p>决定继续后仍需双方分别许可交换联系方式。暂不继续时，不向对方披露私人理由。</p>':''}
 ${draft.operation==='close_need'?'<p>关闭后停止接受新意向，尚未建立联系的意向会结束。已经交换的联系方式不会被收回。</p>':''}
 ${draft.operation==='propose_meeting'?'<p>这只是向对方提出约见，等对方确认后才算约定。</p>':''}
 ${draft.operation==='confirm_meeting'&&draft.before?.meeting?meetingHtml(draft.before.meeting):''}
 </div>`;
}
function meetingHtml(m){return `<div class="meeting"><b>${({proposed:'待对方确认约见',confirmed:'双方已确认约见',cancelled:'约见已取消'})[m.status]}</b><p>${esc(m.time.replace('T',' '))}（北京时间）· ${esc(m.duration)} 分钟<br>${esc(m.place)}<br>${esc(m.agenda)}</p></div>`;}
async function openCooperation(asTeacher=cooperationTeacher,refresh=false){
 const requestedTeacherId=asTeacher?state.teacherIdentity?.id:null;
 const request=++cooperationRequest;const data=await window.agent.cooperationBoard(asTeacher);
 if(request!==cooperationRequest||(refresh&&modalType!=='cooperation')||(asTeacher&&(!state.teacherEnabled||state.teacherIdentity?.id!==requestedTeacherId)))return;
 if(refresh&&JSON.stringify(data)===JSON.stringify(cooperationData))return;
 const scroll=refresh?document.querySelector('.dialog')?.scrollTop||0:0;
 const referenceOpen=refresh&&Boolean(document.querySelector('.member-reference')?.open);
 cooperationTeacher=asTeacher;cooperationData=data;
 const requests=data.interests;
 openModal(`<h2>项目与合作</h2><div class="feedback-actions"><button class="${asTeacher?'secondary':'primary'}" data-coop="student">学生身份</button>${state.teacherEnabled?`<button class="${asTeacher?'primary':'secondary'}" data-coop="teacher">${esc(state.teacherIdentity?.name||'老师 / 导师')} · 教师身份${state.cooperation?.teacher?.unread?' · '+state.cooperation.teacher.unread:''}</button>`:'<button class="secondary" data-coop="unlock">解锁教师身份</button>'}<button class="text-button" data-coop="refresh">刷新</button></div><p>${esc(data.notice)}</p>
 ${cooperationLearningHtml(data.adaptation)}
 ${cooperationUpdatesHtml(data.updates)}
 ${asTeacher?'<button class="primary" data-coop="new">发布项目需求或可约时间</button>':''}
 ${data.drafts.length?`<h3 class="subheading">待本人确认</h3>${data.drafts.map(d=>`<article class="notification"><h3>${esc(d.label)}</h3><p>${esc(d.context)}</p><button class="secondary" data-coop="draft" data-id="${esc(d.id)}">核对内容</button></article>`).join('')}`:''}
 <h3 class="subheading">${asTeacher?'生态需求与我发布的内容':'可以参与的项目与交流'}</h3>
 ${data.needs.map(n=>`<article class="cooperation-card"><span class="cooperation-tag">${n.kind==='availability'?'导师可约时间':'项目找人'} · ${n.status==='closed'?'已关闭':n.audience==='members'?'生态成员可见':'指定成员可见'}</span><h3>${esc(n.title)}</h3><p>${esc(n.summary)}</p><dl><dt>希望找到</dt><dd>${esc(n.lookingFor)}</dd><dt>可以提供</dt><dd>${esc(n.offering)}</dd><dt>合作预期</dt><dd>${esc(n.expectations)}</dd></dl><div class="feedback-actions">${n.owned&&n.status==='published'?`<button class="secondary" data-coop="edit" data-id="${esc(n.id)}">修改并重新确认</button><button class="text-button" data-coop="close" data-id="${esc(n.id)}">关闭需求</button>`:!asTeacher&&n.status==='published'?`<button class="primary" data-coop="interest" data-id="${esc(n.id)}">我想聊聊</button>`:''}</div></article>`).join('')||'<div class="sheet-empty">还没有可见的需求。老师确认发布后会显示在这里。</div>'}
 <h3 class="subheading">${asTeacher?'收到的意向':'我的意向与联系'}</h3>${requests.map(i=>`<article class="cooperation-card" data-interest-id="${esc(i.id)}"><h3>${esc(i.needTitle)}</h3><p class="cooperation-status">${esc(i.statusLabel)}</p><dl><dt>我是谁</dt><dd>${esc(i.card.who)}</dd><dt>做过什么</dt><dd>${esc(i.card.experience)}</dd><dt>能投入多少</dt><dd>${esc(i.card.availability)}</dd></dl>
 ${i.status==='accepted'?`<p>我的交换许可：${i.myConsent?'已同意':'尚未同意'} · 对方许可：${i.otherConsent?'已同意':'等待中'}</p>${i.myContact?`<p>我批准的联系方式：${esc(i.myContact)}</p>`:''}`:''}
 ${i.status==='accepted'&&i.myConsent?`<button class="secondary" data-coop="revokeConsent" data-id="${esc(i.id)}">撤销我的交换许可</button>`:''}
 ${i.status==='exchanged'?`<div class="contact-box"><b>双方已许可交换</b><p>对方联系方式：${esc(i.otherContact)}<br>我的联系方式：${esc(i.myContact)}</p><p>联系和聊天请使用双方选择的方式。</p></div>`:''}
 ${['submitted','accepted'].includes(i.status)?`<section><h4>双方授权代理 · 合作预检</h4><p>本人授权：${i.myPreflight?'已确认':'未确认'} · 对方授权：${i.otherPreflightAuthorized?'已确认':'等待中'}</p><button data-coop="preflight" data-id="${esc(i.id)}">填写并授权预检</button>${i.myPreflight?`<button data-coop="revokePreflight" data-id="${esc(i.id)}">撤销我的授权</button>`:''}${i.preflight?`<p>${esc(i.preflight.notice)}</p>${i.preflight.rounds.map(r=>`<p><b>${esc(r.agent)}</b> ${esc(r.message||'输出预检报告')}</p>`).join('')}${i.preflight.checks.map(c=>`<p>${esc(c.field)} · ${esc(c.status)}<br>学生：${esc(c.student)} / 项目方：${esc(c.owner)}<br>${esc(c.detail)}</p>`).join('')}<p>${esc(i.preflight.next)}</p>`:''}</section>`:''}${i.meeting?meetingHtml(i.meeting):''}<div class="feedback-actions">
 ${i.side==='owner'&&i.status==='submitted'?`<button class="primary" data-coop="accept" data-id="${esc(i.id)}">愿意继续</button>`:''}
 ${i.side==='owner'&&['submitted','accepted'].includes(i.status)?`<button class="secondary" data-coop="decline" data-id="${esc(i.id)}">暂不继续</button>`:''}
 ${i.side==='student'&&['submitted','accepted'].includes(i.status)?`<button class="secondary" data-coop="withdraw" data-id="${esc(i.id)}">撤回意向</button>`:''}
 ${i.status==='accepted'?`<button class="primary" data-coop="contact" data-id="${esc(i.id)}">${i.myConsent?'修改我的交换许可':'许可交换联系方式'}</button>`:''}
 ${i.status==='accepted'&&i.myConsent?`<button class="secondary" data-coop="revokeConsent" data-id="${esc(i.id)}">撤销我的交换许可</button>`:''}
 ${i.status==='exchanged'?`<button class="secondary" data-coop="meeting" data-id="${esc(i.id)}">${i.meeting&&i.meeting.status!=='cancelled'?'提出新的约见安排':'提出约见'}</button>`:''}
 ${i.meeting?.status==='proposed'&&i.meeting.proposedBy!==i.side?`<button class="primary" data-coop="confirmMeeting" data-id="${esc(i.id)}">确认这次约见</button>`:''}
 ${i.meeting&&i.meeting.status!=='cancelled'?`<button class="text-button" data-coop="cancelMeeting" data-id="${esc(i.id)}">取消约见</button>`:''}
 </div></article>`).join('')||'<p>还没有意向记录。</p>'}
 <details class="member-reference"><summary>用于指定可见范围的本人标识</summary><p>${esc(data.memberId)}</p></details>`,'cooperation');
 if(refresh){document.querySelector('.dialog').scrollTop=scroll;document.querySelector('.member-reference').open=referenceOpen;}
}
function cooperationUpdatesHtml(updates){
 if(!updates?.items.length)return '';
 return `<section class="cooperation-updates"><div class="sheet-heading"><h3>合作进度${updates.unread?' · '+updates.unread+' 条未读':''}</h3><button class="text-button" data-coop="readUpdates" data-through="${updates.latestSeq}">全部已读</button></div>${updates.items.slice().reverse().map(n=>`<article class="notification ${n.read?'':'cooperation-unread'}"><span class="time">${esc(new Date(n.created).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}))}${n.read?'':' · 未读'}</span><h3>${esc(n.title)}</h3><p>${esc(n.needTitle)}</p><p>${esc(n.body)}</p><button class="text-button" data-coop="viewUpdate" data-id="${esc(n.interestId)}">查看这条意向</button></article>`).join('')}</section>`;
}
function focusCooperationInterest(id){
 const card=[...document.querySelectorAll('[data-interest-id]')].find(e=>e.dataset.interestId===id);
 if(!card){toast('这条意向当前不可查看，请刷新进度');return;}
 card.setAttribute('tabindex','-1');card.focus({preventScroll:true});card.scrollIntoView({block:'start',behavior:'smooth'});
}
function inputField(key,label,value='',max=600,type='textarea'){
 return `<label>${esc(label)}${type==='textarea'?`<textarea name="${key}" maxlength="${max}" rows="3" required>${esc(value)}</textarea>`:`<input name="${key}" type="${type}" maxlength="${max}" value="${esc(value)}" required>`}</label>`;
}
function cooperationForm(title,operation,fields,extra={}){
 const formTeacher=cooperationTeacher,formTeacherId=state.teacherIdentity?.id;
 openModal(`<h2>${esc(title)}</h2><p>先整理为待确认卡片，核对后才执行。</p><form id="cooperationForm">${fields}<button class="primary">整理并核对</button></form>`,'cooperationForm');
 $('#cooperationForm').onsubmit=async event=>{
   event.preventDefault();const button=event.submitter||event.target.querySelector('button.primary');button.disabled=true;
   try{
     const values=Object.fromEntries(new FormData(event.target));
     if('memberIds' in values)values.memberIds=values.memberIds.split(/[\s,，]+/).filter(Boolean);
     if('duration' in values)values.duration=Number(values.duration);
     const draft=await window.agent.prepareCooperation(formTeacher,operation,{...extra,...values});if(formTeacher&&state.teacherIdentity?.id!==formTeacherId)return;showCooperationDraft(draft);
   }catch(e){toast(e.message);}finally{button.disabled=false;}
 };
}
function needForm(n={}){
 cooperationForm(n.id?'修改需求':'发布需求或可约时间','publish_need',
 `<label>类型<select name="kind"><option value="project" ${n.kind!=='availability'?'selected':''}>项目找人</option><option value="availability" ${n.kind==='availability'?'selected':''}>导师可约时间</option></select></label>`+
 ['title','summary','lookingFor','offering','expectations'].map(k=>inputField(k,cooperationFields[k],n[k]||'',k==='title'?120:k==='summary'?1000:600)).join('')+
 `<label>可见范围<select name="audience"><option value="members" ${n.audience!=='selected'?'selected':''}>所有已登录生态成员</option><option value="selected" ${n.audience==='selected'?'selected':''}>仅指定成员</option></select></label><label>指定成员标识（选择“仅指定成员”时填写，可用逗号分隔）<textarea name="memberIds" rows="2">${esc(n.memberIds?.join(', ')||'')}</textarea></label>`,n.id?{id:n.id}:{});
}
function showCooperationDraft(draft){
 openModal(`<h2>${esc(draft.label)}</h2><p>${esc(draft.context)}</p>${cooperationPreview(draft)}<p class="fine">草稿 24 小时内有效；确认时会再次检查权限和内容是否有变化。</p><div class="feedback-actions"><button class="primary" id="cooperationConfirm">${esc(draft.label)}</button><button class="secondary" id="cooperationDiscard">取消这项操作</button></div>`,'cooperationDraft');
 $('#cooperationConfirm').onclick=async event=>{event.target.disabled=true;try{await window.agent.confirmCooperation(cooperationTeacher,draft.id);await openCooperation();toast('已确认，进度已更新');}catch(e){toast(e.message);event.target.disabled=false;}};
 $('#cooperationDiscard').onclick=async()=>{try{await window.agent.discardCooperation(cooperationTeacher,draft.id);await openCooperation();}catch(e){toast(e.message);}};
}
$('#cooperationButton').onclick=()=>openCooperation(false).catch(e=>toast(e.message));
document.addEventListener('click',async event=>{
 const b=event.target.closest('[data-coop]');if(!b)return;
 const action=b.dataset.coop,id=b.dataset.id;
 try{
   if(action==='learningPause'||action==='learningResume'){await window.agent.cooperationLearningControl(action==='learningPause');await openCooperation();return;}
   if(action==='student'||action==='teacher'){await openCooperation(action==='teacher');return;}
   if(action==='unlock'){unlock();return;}
   if(action==='readUpdates'){await window.agent.markCooperationRead(cooperationTeacher,Number(b.dataset.through));await openCooperation();return;}
   if(action==='viewUpdate'){focusCooperationInterest(id);return;}
   if(action==='refresh'){await openCooperation();return;}
   if(action==='new'){needForm();return;}
   if(action==='edit'){needForm(cooperationData.needs.find(n=>n.id===id));return;}
   if(action==='draft'){showCooperationDraft(cooperationData.drafts.find(d=>d.id===id));return;}
   if(action==='interest'){
     cooperationForm('我想聊聊','send_interest',['who','experience','availability'].map(k=>inputField(k,cooperationFields[k])).join(''),{needId:id});return;
   }
   if(action==='preflight'){cooperationForm('授权我的代理核对合作条件','authorize_preflight',inputField('skills',cooperationFields.skills)+inputField('hours',cooperationFields.hours,8,3,'number')+'<label>参与方式<select name="mode"><option value="online">线上</option><option value="onsite">线下</option><option value="flexible">均可</option></select></label>',{id});return;}
   if(action==='contact'){cooperationForm('许可交换联系方式','consent_contact',inputField('contact','只填写你同意提供给对方的联系方式','',200),{id});return;}
   if(action==='meeting'){
     cooperationForm('提出约见安排','propose_meeting',inputField('time','约见时间（北京时间）','',40,'datetime-local')+inputField('duration','时长（10 至 240 分钟）',30,3,'number')+inputField('place','地点或线上方式','',300)+inputField('agenda','希望讨论什么','',500),{id});return;
   }
   const operations={revokePreflight:'revoke_preflight',revokeConsent:'revoke_consent',close:'close_need',withdraw:'withdraw_interest',accept:'decide_interest',decline:'decide_interest',confirmMeeting:'confirm_meeting',cancelMeeting:'cancel_meeting'};
   if(operations[action]){const asTeacher=cooperationTeacher,teacherId=state.teacherIdentity?.id;const draft=await window.agent.prepareCooperation(asTeacher,operations[action],{id,...(['accept','decline'].includes(action)?{decision:action==='accept'?'accepted':'declined'}:{})});if(asTeacher&&teacherId!==state.teacherIdentity?.id)return;showCooperationDraft(draft);}
 }catch(e){toast(e.message);}
});
setInterval(()=>{if(modalType==='cooperation')openCooperation(cooperationTeacher,true).catch(()=>{});},5000);

let lastCooperationTeacherId=null;
window.agent.onState(s=>{
 const id=s.teacherIdentity?.id||null;
 if(id!==lastCooperationTeacherId){cooperationRequest++;if(cooperationTeacher&&modalType?.startsWith('cooperation'))closeModal();cooperationTeacher=false;cooperationData=null;}
 lastCooperationTeacherId=id;
});
window.agent.onCommand(command=>{
 if(command?.type!=='cooperation')return;
 if(command.asTeacher&&(!state.teacherEnabled||state.teacherIdentity?.id!==(command.teacherId||'local-teacher'))){toast('请先解锁通知所属的教师身份，再查看合作进度');return;}
 openCooperation(command.asTeacher).then(()=>focusCooperationInterest(command.interestId)).catch(e=>toast(e.message));
});

function cooperationLearningHtml(a){
 if(!a||cooperationTeacher)return '';
 const names={proposed:'自主提出候选',activated:'验证后启用',rejected:'未达到门槛',rollback:'依据失效，自动回退',discarded:'候选依据失效',paused:'已暂停',resumed:'已恢复'};
 return `<section class="notification"><h3>合作流程 · 自主改进 v${a.version}</h3><p>${a.paused?'已暂停，使用基础流程':a.activeFields.length?'已生效：行动规划前检查'+esc(a.activeFields.join('、')):'尚未启用新策略，等待真实合作记录验证'}</p><p>有效项目记录 ${a.sampleCount||0} 条。系统自动从已完成的双方授权预检中发现问题，无需本人编写改进规则。</p>${a.candidate?`<p>候选：提前检查${esc(a.candidate.fields.join('、'))}<br>生成依据：${a.candidate.training.length} 个项目；后续验证：${a.candidate.validationCount} 个项目。需要至少两个后续项目，并同时包含有冲突与无冲突记录。</p>`:''}${(a.events||[]).slice(-4).reverse().map(e=>`<div><b>${esc(names[e.type]||e.type)}</b><p>${esc(e.reason)}</p>${e.before?`<p>后续记录漏检 ${e.before.missedConflicts} → ${e.after.missedConflicts}；误阻断 ${e.before.falseBlocks} → ${e.after.falseBlocks}；验证项目 ${e.after.total}</p>`:''}</div>`).join('')}<p class="fine">学习范围：结构化时间与参与方式的检查顺序。预检冲突不代表合作失败，评测不代表实际合作成功率。不会自动发送意向或许可。</p><button data-coop="${a.paused?'learningResume':'learningPause'}">${a.paused?'恢复自主改进':'暂停改进并恢复基础流程'}</button></section>`;
}
