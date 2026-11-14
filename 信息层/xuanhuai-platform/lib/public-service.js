const crypto=require('node:crypto');
const {fail,str}=require('./storage');
const S=require('./schedule');
const {missingPlace}=require('./learning');
const labels={title:'课程',date:'日期',time:'时间',place:'地点',campus:'校区',teacher:'主讲人',organizer:'主办方',topic:'主题',guest:'嘉宾',registration:'报名方式',is_running:'是否开课',note:'说明',status:'核对状态',visibility:'可见范围',rule:'周次规则',ended:'本学期已结课'};
const gapLabels={pending_delivery:'已登记待转交',delivered:'已向负责老师询问',pending_confirmation:'已答复待确认',answered:'已确认'};
const internal={id:'local-teacher',role:'teacher'};
const stamp=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
function createPublicService(db,knowledge){
 const read=()=>S.migrate(db.read());
 const course=(d,id)=>d.catalog.find(c=>c.id===(d.aliases[id]||id));
 const session=(d,id)=>S.sessions(d).find(s=>s.id===id);
 function authorized(c,a){if(!S.staff(a))fail('需要教师权限',403);if(!S.owns(c,a))fail('只能修改自己负责的课程；可提交更正建议',403);}
 function view(d,s,a,now=new Date()){
  const c=course(d,s.courseId),{draftEdit,question,legacyPreviewOnly,...out}=s;
  delete out.reviewedBy;
  out.title=c.title;out.courseId=c.id;out.visibility=s.visibility||c.visibility;out.past=s.date<S.localDate(now);out.rule=c.rule;
  out.statusLabel=s.status==='cancelled'?'已取消':s.status==='confirmed'?'已确认':s.status==='draft'?'草稿':'沿用本学期安排，本周待确认';
  out.fieldLabels=Object.fromEntries(Object.entries(s.fieldStatus||{}).map(([k,v])=>[k,v==='confirmed'?'已确认':v==='pending'?'待老师确认':'沿用本学期安排，本周待确认']));
  if(S.owns(c,a)){out.question=question;out.editable=true;}return out;
 }
 function listCourses(query='',actor=internal,options={}){
  const d=read(),now=options.now||new Date(),start=options.start?S.monday(options.start):S.weekStart(S.localDate(now)),end=options.start?S.addDays(start,6):S.addDays(start,13),q=String(query).trim().toLowerCase();
  const selected=S.sessions(d).filter(s=>(options.all||s.date>=start&&s.date<=end)&&S.visible(d,s,actor)&&(s.status!=='draft'||S.owns(course(d,s.courseId),actor))&&(!q||`${course(d,s.courseId).title} ${s.place} ${s.teacher}`.toLowerCase().includes(q)));
  return {start,end,week:`${start} 至 ${end}`,timeZone:'Asia/Shanghai',notice:'已确认与沿用安排分开标注；空白项表示尚未确认，不表示课程不存在。',courses:selected.map(s=>view(d,s,actor,now)).sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time))};
 }
 function getCourse(id,actor=internal){const d=read(),s=session(d,id)||S.sessions(d).filter(s=>s.courseId===id&&S.visible(d,s,actor)).sort((a,b)=>b.date.localeCompare(a.date))[0];if(!s||!S.visible(d,s,actor)||(s.status==='draft'&&!S.owns(course(d,s.courseId),actor)))fail('课程不存在或无权查看',404);return view(d,s,actor);}
 function stableId(id){const d=read();return session(d,id)?.courseId||course(d,id)?.id||id;}
 function changes(after=0,actor=internal){const n=Number(after);if(!Number.isSafeInteger(n)||n<0)fail('变更游标不正确');const d=read();return d.changes.filter(e=>e.seq>n&&S.visible(d,{courseId:e.courseId,visibility:e.visibility||'members'},actor)&&S.visible(d,session(d,e.sessionId)||{courseId:e.courseId,visibility:course(d,e.courseId)?.visibility},actor));}
 const latestSeq=()=>read().changes.at(-1)?.seq||0;
 function normalizeFields(fields){
  if(!fields||typeof fields!=='object'||Array.isArray(fields))fail('请提供修改字段');const out={};
  for(const [k,v] of Object.entries(fields)){
   if(![...S.fieldNames,'title','status'].includes(k))fail('不支持修改这个字段');
   if(typeof v!=='string'||v.length>500)fail(`${labels[k]}须为不超过 500 字的文本`);out[k]=v.trim();
   if(['title','date','time'].includes(k)&&!out[k])fail(`${labels[k]}不能为空`);
   if(k==='date')S.date(v);
   if(k==='visibility'&&!['members','staff'].includes(v))fail('可见范围无效');
   if(k==='status'&&!['confirmed','unconfirmed','cancelled'].includes(v))fail('核对状态不正确');
   if(k==='is_running'&&!['yes','no',''].includes(v))fail('是否开课请填 yes 或 no');
  }return out;
 }
 function pendingProposal(d,actor,items,extra={}){const p={id:uid(),actor:actor.id,created:stamp(),state:'pending',items,...extra};d.proposals.push(p);db.write(d);return p;}
 function patchItem(d,s,fields,actor,evidence={},extra={}){const c=course(d,s.courseId);authorized(c,actor);return {kind:'session',id:s.id,courseId:c.id,title:c.title,baseRevision:s.revision||0,courseRevision:c.revision||0,before:Object.fromEntries(Object.keys(fields).map(k=>[k,s[k]??''])),fields,evidence,...extra};}
 function propose(updates,actor,sourceText='',gapId=null){
  if(!S.staff(actor))fail('请先登录教师工作台',401);if(!Array.isArray(updates)||!updates.length||updates.length>100)fail('没有可确认的修改');const d=read(),seen=new Set(),items=[];
  const gap=gapId?d.gaps.find(g=>g.id===gapId):null;if(gapId&&(!gap||!gapOwned(d,gap,actor)||gap.status==='answered'))fail('问题已关闭或无权回答',409);
  for(const u of updates){if(seen.has(u.id))fail('同一提案不能重复修改一个场次');seen.add(u.id);const s=session(d,u.id);if(!s)fail('场次不存在',404);authorized(course(d,s.courseId),actor);
   const raw={},evidence={};for(const [k,v] of Object.entries(u.fields||{})){raw[k]=v&&typeof v==='object'?v.value:v;if(sourceText&&(!v.quote||!sourceText.includes(v.quote)))fail('提案缺少原文证据');evidence[k]={quote:sourceText?v.quote:`老师确认：${raw[k]}`,source:'老师提供'};}
   const values=normalizeFields(raw),fields=Object.fromEntries(Object.entries(values).filter(([k,v])=>v!==s[k]||(gap?.field===k)));
   if('date'in fields&&S.weekStart(fields.date)!==s.weekStart)fail('改期需在同一周；跨周请取消原场次并新增场次');
   if(Object.keys(fields).length)items.push(patchItem(d,s,fields,actor,evidence));
  }if(!items.length)fail('内容与现有记录一致，无需更新');
  if(gap){const previous=d.proposals.find(p=>p.id===gap.proposalId);if(previous?.state==='pending')previous.state='superseded';gap.status='pending_confirmation';}
  const p={id:uid(),actor:actor.id,created:stamp(),state:'pending',items,...(gap?{gapId:gap.id}:{})};if(gap)gap.proposalId=p.id;d.proposals.push(p);db.write(d);return p;
 }
 function addEvent(d,p,c,s,before,after,actor){const event={id:uid(),seq:(d.changes.at(-1)?.seq||0)+1,proposalId:p.id,courseId:c.id,sessionId:s?.id,title:c.title,before:before.visibility==='staff'?{}:before,after,created:stamp(),actor:actor.name||actor.id,provider:actor.name||actor.id,confirmedAt:stamp(),visibility:s?.visibility||c.visibility};d.changes.push(event);return event;}
 function resolveGaps(d,s,fields,actor){for(const g of d.gaps)if(g.sessionId===s.id&&g.status!=='answered'&&g.field in fields&&fields[g.field]&&!((g.field==='place')&&missingPlace(s))){const previous=d.proposals.find(p=>p.id===g.proposalId);if(previous?.state==='pending')previous.state='superseded';Object.assign(g,{status:'answered',answer:String(fields[g.field]),answeredAt:stamp(),answeredBy:actor.id,revision:s.revision});delete g.proposalId;}}
 function confirm(id,actor){
  if(!S.staff(actor))fail('请先登录教师工作台',401);const d=read(),p=d.proposals.find(p=>p.id===id&&p.actor===actor.id);if(!p)fail('提案不存在',404);
  if(p.state==='confirmed')return {alreadyConfirmed:true,changes:changes(0,actor).filter(e=>e.proposalId===id)};
  if(p.state!=='pending')fail('这份提案已被替代，请核对最新提案',409);
  if(p.weekStart&&d.weeks[p.weekStart]?.revision!==p.weekRevision)fail('课表已有变化，请重新整理',409);
  if(p.gapId){const g=d.gaps.find(g=>g.id===p.gapId);if(!g||!gapOwned(d,g,actor)||g.status==='answered'||g.proposalId!==p.id)fail('问题已解决或提案已失效',409);}
  for(const item of p.items){
   if(item.kind==='newCourse'){if(d.catalog.some(c=>S.normalizeName(c.title)===S.normalizeName(item.fields.title)))fail('同名课程已存在，请新增场次',409);continue;}
   if(item.kind==='answer'){if(!gapOwned(d,d.gaps.find(g=>g.id===item.id),actor))fail('问题已重新分配',403);continue;}
   const c=course(d,item.courseId);authorized(c,actor);if(!c||(c.revision||0)!==item.courseRevision)fail('课程已有变化，请重新整理再确认',409);
   if(item.kind==='session'){const s=session(d,item.id);if(!s||(s.revision||0)!==item.baseRevision)fail('课程在提案生成后已有变化，请重新整理再确认',409);}
   if(item.kind==='newSession'&&session(d,item.id))fail('场次已存在',409);
  }
  const events=[],now=stamp();
  for(const item of p.items){
   if(item.kind==='answer'){const g=d.gaps.find(g=>g.id===item.id);Object.assign(g,{status:'answered',answer:item.fields.answer,answeredAt:now,answeredBy:actor.id});continue;}
   if(item.kind==='newCourse'){const c={id:item.id,title:item.fields.title,ownerId:S.admin(actor)?null:actor.id,ownerName:actor.name||'',visibility:item.fields.visibility||'members',revision:1,rule:item.rule||null,templates:[]};d.catalog.push(c);events.push(addEvent(d,p,c,null,{},item.fields,actor));continue;}
   const c=course(d,item.courseId);
   if(item.kind==='catalog'){
    Object.assign(c,item.fields);c.revision++;c.provider=actor.name||actor.id;c.confirmedAt=now;
    if(item.fields.rule)c.ruleConfirmed=true;
    if(item.fields.ended)for(const s of S.sessions(d).filter(s=>s.courseId===c.id&&s.date>=S.localDate())){const before={status:s.status};s.status='cancelled';s.revision++;s.provider=actor.name||actor.id;s.confirmedAt=now;s.source=`由${s.provider}提供，${now} 确认结课`;d.weeks[s.weekStart].revision++;events.push(addEvent(d,p,c,s,before,{status:'cancelled',ended:true},actor));}
    events.push(addEvent(d,p,c,null,item.before,item.fields,actor));continue;
   }
   let s=session(d,item.id);
   if(item.kind==='newSession'){s={...item.fields,id:item.id,courseId:c.id,revision:0,fieldStatus:{},pendingFields:[],evidence:{}};d.weeks[s.weekStart]||={start:s.weekStart,end:S.addDays(s.weekStart,6),state:'published',revision:0,sessions:[],uncertain:[]};d.weeks[s.weekStart].sessions.push(s);}
   else Object.assign(s,item.fields);
   if(item.fields.title){c.title=item.fields.title;c.revision++;}
   if(item.fields.date)s.day=(new Date(s.date+'T12:00:00Z').getUTCDay()+6)%7+1;
   s.revision++;s.updated=now;s.provider=actor.name||actor.id;s.confirmedAt=now;s.source=`由${s.provider}提供，${now} 确认`;s.evidence||={};s.fieldStatus||={};
   for(const k of item.confirmFields||Object.keys(item.fields)){s.fieldStatus[k]='confirmed';s.evidence[k]={...(item.evidence[k]||{quote:String(s[k]??'')}),source:s.source,provider:s.provider,confirmedAt:now};s.pendingFields=(s.pendingFields||[]).filter(f=>f!==k);}
   for(const k of S.fieldNames)if(!s[k]){s.fieldStatus[k]='pending';if(['time','place','teacher','campus'].includes(k)&&!s.pendingFields.includes(k))s.pendingFields.push(k);}
   if(s.is_running==='no')s.status='cancelled';
   if(s.status!=='cancelled')s.status=['time','place','teacher'].every(k=>s.fieldStatus[k]==='confirmed')&&!s.pendingFields.length?'confirmed':'unconfirmed';
   if(item.kind==='newSession'){for(const k of ['time','place','teacher','campus'])if(!s[k]){s.fieldStatus[k]='pending';s.pendingFields.push(k);}s.status=s.pendingFields.length?'unconfirmed':'confirmed';s.publishedAt=now;}
   if(item.publish){s.publishedAt=now;s.reviewedBy=actor.id;delete s.draftEdit;}
   d.weeks[s.weekStart].revision++;
   events.push(addEvent(d,p,c,s,item.before,{...item.fields,...(item.publish?{status:s.status}: {})},actor));resolveGaps(d,s,Object.fromEntries((item.confirmFields||Object.keys(item.fields)).map(k=>[k,s[k]])),actor);
  }
  if(p.weekStart){const w=d.weeks[p.weekStart];w.state=w.sessions.every(s=>s.publishedAt||s.status==='cancelled')?'published':'partially_published';w.confirmedAt=now;}
  if(p.suggestionId){const sg=d.suggestions.find(x=>x.id===p.suggestionId);sg.state='resolved';}
  p.state='confirmed';p.confirmed=now;db.write(d);return {changes:events};
 }
 function gapView(g){return {id:g.id,courseId:g.courseId,sessionId:g.sessionId,field:g.field,title:g.title,status:g.status,statusLabel:gapLabels[g.status],routing:g.assignedTo?'owner':'unassigned',created:g.created,deliveredAt:g.deliveredAt,answeredAt:g.answeredAt,notice:`${gapLabels[g.status]}；当前只在本机服务流转，未发送邮件或跨设备联系老师。`,...(g.status==='answered'?{answer:g.answer,revision:g.revision}:{})};}
 function gapOwned(d,g,a){if(!g)return false;const c=course(d,g.courseId);const owner=c?.ownerId||g.assignedTo;return owner?!!(a?.role==='teacher'&&owner===a.id):S.admin(a);}
 function queue(d,{s,c,title,field,question,scope}){
  const match=d.gaps.find(g=>g.status!=='answered'&&g.field===field&&(s?g.sessionId===s.id:c?g.courseId===c.id&&!g.sessionId&&g.scope===scope:S.normalizeName(g.title)===S.normalizeName(title)&&g.scope===scope));
  if(match)return match;
  const g={id:uid(),courseId:c?.id||null,sessionId:s?.id||null,title:c?.title||title,field,question:question||`${title||c?.title}的${labels[field]||field}是什么？`,scope,assignedTo:c?.ownerId||c?.legacyResponsibleId||null,status:'pending_delivery',created:stamp()};d.gaps.push(g);return g;
 }
 function registerGap(input,actor=internal){
  const args=typeof input==='string'?{id:input}:input||{},field=args.field||'place';if(!['place','time','teacher','is_running','registration','topic','guest','campus'].includes(field))fail('不支持的追问字段');
  const d=read(),s=args.id?session(d,args.id):null,c=s?course(d,s.courseId):args.id?course(d,args.id):null;
  if(args.id){getCourse(args.id,actor);if(!s&&!c)fail('课程不存在',404);if(field==='place'&&s&&!missingPlace(s)&&s.fieldStatus?.place==='confirmed')fail('这门课已经有地点，请先查看课程详情');}
  const title=c?.title||str(args.title,'课程名称',200);const g=queue(d,{s,c,title,field,scope:args.start?S.monday(args.start):undefined});db.write(d);return gapView(g);
 }
 function gapResult(id,actor=internal){const d=read(),g=d.gaps.find(g=>g.id===id);if(!g)fail('问题不存在',404);const s=session(d,g.sessionId);if(g.courseId&&!S.visible(d,s||{courseId:g.courseId,visibility:course(d,g.courseId)?.visibility},actor))fail('问题不存在或无权查看',404);return gapView(g);}
 function pendingGaps(actor){if(!S.staff(actor))fail('需要教师权限',403);const d=read();return d.gaps.filter(g=>gapOwned(d,g,actor)&&g.status!=='answered').map(g=>({...gapView(g),question:g.question}));}
 function receiveQuestions(actor){if(!S.staff(actor))fail('需要教师权限',403);const d=read();for(const g of d.gaps)if(gapOwned(d,g,actor)&&g.status==='pending_delivery'&&(g.assignedTo||course(d,g.courseId)?.ownerId)){g.assignedTo||=actor.id;g.status='delivered';g.deliveredAt=stamp();}db.write(d);return pendingGaps(actor);}
 function answerGap(id,answer,actor){const d=read(),g=d.gaps.find(g=>g.id===id);if(!g)fail('问题不存在',404);if(!gapOwned(d,g,actor))fail('只能回答分配给自己的问题',403);if(g.status==='answered')fail('该问题已有答复');answer=str(answer,labels[g.field]||'答复',500);if(g.field==='place'&&missingPlace({place:answer}))fail('请填写明确地点，不能用待定作为答案');if(g.sessionId)return propose([{id:g.sessionId,fields:{[g.field]:answer}}],actor,'',g.id);
  const previous=d.proposals.find(p=>p.id===g.proposalId);if(previous?.state==='pending')previous.state='superseded';const p={id:uid(),actor:actor.id,state:'pending',created:stamp(),gapId:g.id,items:[{kind:'answer',id:g.id,title:g.title,before:{},fields:{answer},evidence:{answer:{quote:answer}}}]};g.status='pending_confirmation';g.proposalId=p.id;d.proposals.push(p);db.write(d);return p;
 }
 function assignOwner(id,teacher,actor){if(!S.admin(actor))fail('需要管理员权限',403);const d=read(),c=course(d,id);if(!c)fail('课程不存在',404);c.ownerId=teacher?.id||null;delete c.legacyResponsibleId;if(teacher)c.ownerName=teacher.name;c.revision++;for(const g of d.gaps.filter(g=>g.courseId===c.id&&g.status!=='answered')){const p=d.proposals.find(p=>p.id===g.proposalId);if(p?.state==='pending')p.state='superseded';g.assignedTo=c.ownerId;g.status='pending_delivery';delete g.deliveredAt;delete g.proposalId;}db.write(d);return {courseId:c.id,ownerId:c.ownerId,ownerName:c.ownerName};}
 function assignQuestion(id,teacherId,actor){if(!S.admin(actor))fail('需要管理员权限',403);const d=read(),g=d.gaps.find(g=>g.id===id);if(!g||g.courseId)fail('请通过课程负责人分配已知课程的问题');if(g.status==='answered')fail('问题已关闭');const old=d.proposals.find(p=>p.id===g.proposalId);if(old?.state==='pending')old.state='superseded';g.assignedTo=teacherId;g.status='pending_delivery';delete g.proposalId;delete g.deliveredAt;db.write(d);return gapView(g);}
 function catalog(actor){if(!S.staff(actor))fail('需要教师权限',403);return read().catalog.filter(c=>c.visibility==='members'||S.owns(c,actor)).map(c=>({...c,editable:S.owns(c,actor)}));}
 function getDraft(start,actor){if(!S.staff(actor))fail('需要教师权限',403);const d=read(),w=d.weeks[S.monday(start)];if(!w)fail('该周尚未生成',404);return {...w,questions:S.admin(actor)?w.questions||[]:[],sessions:w.sessions.filter(s=>S.visible(d,s,actor)).map(s=>({...view(d,s,actor),...(S.owns(course(d,s.courseId),actor)?{draftEdit:s.draftEdit}: {})})),uncertain:(w.uncertain||[]).filter(x=>S.visible(d,{courseId:x.courseId,visibility:course(d,x.courseId)?.visibility},actor))};}
 function editDraft(start,id,fields,confirmedFields,actor){const d=read(),w=d.weeks[S.monday(start)],s=w?.sessions.find(s=>s.id===id);if(!s)fail('场次不存在',404);authorized(course(d,s.courseId),actor);if(s.publishedAt||w.state==='published')fail('发布后的修改请走变更提案',409);const patch=normalizeFields(fields||{});if(patch.date&&S.weekStart(patch.date)!==start)fail('日期必须在本周');if('status'in patch||'title'in patch)fail('草稿请使用课程变更工具修改状态或名称');if(!Array.isArray(confirmedFields)||confirmedFields.some(k=>!S.fieldNames.includes(k)))fail('请明确列出已核对的字段');const merged={...s,...patch};for(const k of confirmedFields)if(k!=='note'&&(!merged[k]||(k==='place'&&missingPlace(merged))))fail(`不能确认空白的${labels[k]}`);s.draftEdit={fields:patch,confirmedFields,actor:actor.id};s.revision++;w.revision++;db.write(d);return getDraft(start,actor);}
 function prepareWeek(start,actor){const d=read(),w=d.weeks[S.monday(start)];if(!w)fail('该周尚未生成',404);if(!S.staff(actor))fail('需要教师权限',403);const items=w.sessions.filter(s=>S.owns(course(d,s.courseId),actor)&&!s.publishedAt&&s.status!=='cancelled').map(s=>{const edit=s.draftEdit||{fields:{},confirmedFields:[]};const merged={...s,...edit.fields};const confirmFields=[...new Set([...S.fieldNames.filter(k=>!s.pendingFields?.includes(k)&&merged[k]),...edit.confirmedFields])];return patchItem(d,s,edit.fields,actor,{}, {publish:true,confirmFields,review:{...view(d,merged,actor),unresolved:(s.pendingFields||[]).filter(k=>!confirmFields.includes(k))}});});if(!items.length)fail('没有可确认的本人场次');return pendingProposal(d,actor,items,{weekStart:start,weekRevision:w.revision});}
 function proposeOperation(operation,input,actor){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('请提供操作内容');
  if(!S.staff(actor))fail('需要教师权限',403);const d=read();
  if(operation==='add_course'){const title=str(input.title,'课程名',200);if(d.catalog.some(c=>S.normalizeName(c.title)===S.normalizeName(title)))fail('同名课程已存在，请新增场次',409);const visibility=input.visibility||'members';normalizeFields({visibility});const id=uid();return pendingProposal(d,actor,[{kind:'newCourse',id,title,before:{},fields:{title,visibility},evidence:{},rule:input.rule?S.validRule(input.rule):null}]);}
  const c=course(d,input.courseId||input.id);if(operation==='cancel_session'){const s=session(d,input.id);if(!s)fail('场次不存在',404);return propose([{id:s.id,fields:{status:'cancelled'}}],actor);}
  if(!c)fail('课程不存在',404);authorized(c,actor);
  if(operation==='add_session'){const date=S.date(input.date),start=S.weekStart(date),values=normalizeFields({time:input.time||'',place:input.place||'',teacher:input.teacher||'',campus:input.campus||'',visibility:input.visibility||c.visibility});if(c.ended)fail('本学期已结课，需先修正规则');const fields={...values,date,day:(new Date(date+'T12:00:00Z').getUTCDay()+6)%7+1,weekStart:start,title:c.title,status:'confirmed'};return pendingProposal(d,actor,[{kind:'newSession',id:uid(),courseId:c.id,title:c.title,courseRevision:c.revision,before:{},fields,evidence:{}}]);}
  let fields;if(operation==='end_course')fields={ended:true};else if(operation==='update_rule')fields={rule:S.validRule(input.rule),ended:false};else fail('不支持的操作');return pendingProposal(d,actor,[{kind:'catalog',id:c.id,courseId:c.id,title:c.title,courseRevision:c.revision,before:Object.fromEntries(Object.keys(fields).map(k=>[k,c[k]])),fields,evidence:{}}]);
 }
 function suggest(id,fields,actor){if(!S.staff(actor))fail('需要教师权限',403);const d=read(),s=session(d,id);if(!s||!S.visible(d,s,actor))fail('场次不存在或无权查看',404);const sg={id:uid(),sessionId:id,courseId:s.courseId,title:course(d,s.courseId).title,fields:normalizeFields(fields),by:actor.id,state:'pending',created:stamp()};d.suggestions.push(sg);db.write(d);return sg;}
 function suggestions(actor){if(!S.staff(actor))fail('需要教师权限',403);const d=read();return d.suggestions.filter(s=>S.owns(course(d,s.courseId),actor)&&s.state==='pending');}
 function acceptSuggestion(id,actor){const d=read(),sg=d.suggestions.find(x=>x.id===id&&x.state==='pending');if(!sg)fail('建议不存在',404);authorized(course(d,sg.courseId),actor);const p=propose([{id:sg.sessionId,fields:sg.fields}],actor);const latest=read();latest.proposals.find(x=>x.id===p.id).suggestionId=id;db.write(latest);return {...p,suggestionId:id};}
 function summary(actor,options={}){const out=listCourses('',actor,options);for(const c of out.courses)c.conflicts=[];const slot=require('./learning').slot;for(let i=0;i<out.courses.length;i++)for(let j=i+1;j<out.courses.length;j++){const a=out.courses[i],b=out.courses[j],x=slot(a),y=slot(b);if(a.date===b.date&&a.status!=='cancelled'&&b.status!=='cancelled'&&x&&y&&x.start<y.end&&y.start<x.end){a.conflicts.push(b.id);b.conflicts.push(a.id);}}return out;}
 const weekly=require('./weekly').createWeekly(db,{read,course,queue,getDraft});
 return {isPreviewOnly:id=>!!session(read(),id)?.legacyPreviewOnly,knowledge,labels,listCourses,getCourse,stableId,changes,latestSeq,propose,confirm,registerGap,gapResult,pendingGaps,receiveQuestions,answerGap,assignOwner,assignQuestion,catalog,getDraft,editDraft,prepareWeek,proposeOperation,suggest,suggestions,acceptSuggestion,summary,...weekly};
}
module.exports={createPublicService};
