const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createRuntime}=require('../runtime');
const coreDir=process.env.XUANHUAI_TEST_CORE_DIR||path.resolve(__dirname,'../../信息层/xuanhuai-platform');
const articleDir=process.env.XUANHUAI_TEST_ARTICLE_DIR||path.resolve(coreDir,'../天津大学宣怀学院公众号资料库/文章');
function fixture(t,model){const userData=fs.mkdtempSync(path.join(os.tmpdir(),'xh-client-test-'));const options={coreDir,articleDir,userData,apiKey:'test-secret-only',deepseekFactory:opts=>model||{enabled:true,model:opts.model,async complete(){return {content:'已查阅。'};}}};const runtime=createRuntime(options);t.after(async()=>{await runtime.dispose();fs.rmSync(userData,{recursive:true,force:true});});return {runtime,userData,options};}

test('桌面会话和个人数据持久化，密钥不写入文件',async t=>{
 const {runtime,userData,options}=fixture(t);const id=runtime.snapshot().activeId;
 runtime.profile('想做 AI 硬件');await runtime.send(id,'帮我了解创业案例');
 const reopened=createRuntime(options);t.after(()=>reopened.dispose());
 assert.equal(reopened.snapshot().conversations[0].messages.length,2);assert.equal(reopened.snapshot().personal.profile,'想做 AI 硬件');
 assert.ok(!fs.readFileSync(path.join(userData,'private/client.json'),'utf8').includes('test-secret-only'));
 assert.ok(runtime.exportText(id).includes('帮我了解创业案例'));
});
test('工具执行在会话中呈现，只有确认已签发的操作才能关注',async t=>{
 let round=0;const model={enabled:true,model:'mock',async complete(){return round++===0?{tool_calls:[{id:'0',type:'function',function:{name:'list_courses',arguments:'{"query":"科创领导力"}'}},{id:'1',type:'function',function:{name:'prepare_follow_course',arguments:'{"id":"7","follow":true}'}}]}:{content:'点击下方确认关注。'};}};
 const {runtime}=fixture(t,model),id=runtime.snapshot().activeId;let observed=false;runtime.on('state',s=>{if(s.conversations[0].messages.at(-1)?.steps?.length)observed=true;});
 await runtime.send(id,'帮我关注科创领导力');const reply=runtime.snapshot().conversations[0].messages.at(-1);
 assert.ok(observed);assert.equal(runtime.snapshot().personal.subscriptions.length,0);
 assert.throws(()=>runtime.confirmAction(id,reply.id,'forged'));
 runtime.confirmAction(id,reply.id,reply.actions[0].id);runtime.confirmAction(id,reply.id,reply.actions[0].id);
 assert.equal(runtime.snapshot().personal.subscriptions.length,1);assert.equal(runtime.snapshot().personal.subscriptions[0].title,'科创领导力');
});
test('停止任务会中断模型请求，并保存停止状态',async t=>{
 let entered;const started=new Promise(r=>entered=r);
 const model={enabled:true,model:'mock',async complete(messages,extra,controls){entered();await new Promise((resolve,reject)=>controls.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}};
 const {runtime}=fixture(t,model),id=runtime.snapshot().activeId;const job=runtime.send(id,'查资料');await started;runtime.stop();await job;
 assert.equal(runtime.snapshot().busyId,null);assert.equal(runtime.snapshot().conversations[0].messages.at(-1).status,'stopped');
});
test('客户端网关只提供工具服务，不再提供网站',async t=>{
 const {runtime}=fixture(t);const port=await runtime.startGateway(0),base=`http://127.0.0.1:${port}`;
 assert.equal((await fetch(base+'/')).status,404);
 const tools=await(await fetch(base+'/api/tools')).json();assert.ok(tools.tools.some(t=>t.name==='search_knowledge'));
 const external=await(await fetch(base+'/api/tools/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'search_knowledge',arguments:{query:'机器人'}})})).json();assert.ok(external.result.length);
});
test('教师确认发布需要解锁，准备提案不改变公共记录',async t=>{
 const model={enabled:true,model:'mock',async complete(){return {content:JSON.stringify({updates:[{id:'7',fields:{place:{value:'C206',quote:'改到 C206'}}}],questions:[]})};}};
 const {runtime}=fixture(t,model);let id=runtime.snapshot().activeId;
 await assert.rejects(()=>runtime.send(id,'2026年11月10日科创领导力改到 C206','teacher'));
 runtime.unlock(fs.readFileSync(runtime.teacherPasswordFile,'utf8').trim());
 id=runtime.snapshot().activeId;await runtime.send(id,'2026年11月10日科创领导力改到 C206','teacher');
 const reply=runtime.snapshot().conversations[0].messages.at(-1);assert.notEqual(runtime.core.publicService.getCourse('7').place,'C206');
 runtime.lock();assert.throws(()=>runtime.confirmAction(id,reply.id,reply.actions[0].id));
 runtime.unlock(fs.readFileSync(runtime.teacherPasswordFile,'utf8').trim());runtime.confirmAction(id,reply.id,reply.actions[0].id);assert.equal(runtime.core.publicService.getCourse('7').place,'C206');
});

test('模型只能准备记忆卡片，确认后才保存，删除后立即消失',async t=>{
 let round=0;const model={enabled:true,model:'mock',async complete(messages){
  if(round++===0)return {tool_calls:[{id:'m0',type:'function',function:{name:'prepare_memory',arguments:JSON.stringify({kind:'interest',value:'机器人'})}}]};
  return {content:'请确认记住这个方向。'};
 }};
 const {runtime}=fixture(t,model),id=runtime.snapshot().activeId;await runtime.send(id,'记住我关注机器人');const reply=runtime.snapshot().conversations[0].messages.at(-1);
 assert.equal(runtime.snapshot().learning.memories.length,0);assert.equal(reply.actions[0].type,'memory');
 runtime.confirmAction(id,reply.id,reply.actions[0].id);runtime.confirmAction(id,reply.id,reply.actions[0].id);
 assert.equal(runtime.snapshot().learning.memories.length,1);runtime.forget(runtime.snapshot().learning.memories[0].id);assert.equal(runtime.snapshot().learning.memories.length,0);
});

test('桌面地点答复生成确认卡片；确认前无答复，确认后通知且重启不重复',async t=>{
 const {runtime,userData,options}=fixture(t);const file=path.join(userData,'shared/data.json'),d=JSON.parse(fs.readFileSync(file));(d.courses||Object.values(d.weeks).flatMap(w=>w.sessions)).find(c=>c.id==='7').place='待定';fs.writeFileSync(file,JSON.stringify(d));
 const gap=runtime.registerGap('7');assert.throws(()=>runtime.answerGap(gap.id,'卫津路 · 25楼 C206'));
 runtime.unlock(fs.readFileSync(runtime.teacherPasswordFile,'utf8').trim());assert.equal(runtime.snapshot().pendingQuestions.length,1);
 assert.equal(runtime.snapshot().learning.results[0].status,'pending_delivery');
 runtime.receiveQuestions();assert.equal(runtime.snapshot().learning.results[0].status,'delivered');
 runtime.answerGap(gap.id,'卫津路 · 25楼 C206');const s=runtime.snapshot(),reply=s.conversations[0].messages.at(-1);
 assert.equal(s.learning.results[0].status,'pending_confirmation');runtime.confirmAction(s.activeId,reply.id,reply.actions[0].id);runtime.poll();
 assert.equal(runtime.snapshot().learning.inbox.filter(n=>n.type==='gap').length,1);
 const reopened=createRuntime(options);t.after(()=>reopened.dispose());reopened.poll();assert.equal(reopened.snapshot().learning.inbox.filter(n=>n.type==='gap').length,1);
 runtime.markRead();assert.ok(runtime.snapshot().learning.inbox.every(n=>n.read));
});

test('模型必须先查到课程才能登记地点缺口，公共队列不保存学生原话',async t=>{
 let round=0;const model={enabled:true,model:'mock',async complete(){
  if(round++===0)return {tool_calls:[{id:'guess',type:'function',function:{name:'register_gap',arguments:'{"id":"7"}'}}]};
  if(round===2)return {tool_calls:[{id:'lookup',type:'function',function:{name:'get_course',arguments:'{"id":"7"}'}},{id:'register',type:'function',function:{name:'register_gap',arguments:'{"id":"7"}'}}]};
  return {content:'已登记，等待本机教师处理。'};
 }};
 const {runtime,userData}=fixture(t,model),file=path.join(userData,'shared/data.json');const d=JSON.parse(fs.readFileSync(file));(d.courses||Object.values(d.weeks).flatMap(w=>w.sessions)).find(c=>c.id==='7').place='待定';fs.writeFileSync(file,JSON.stringify(d));
 await runtime.send(runtime.snapshot().activeId,'我有一段私事，但想知道科创领导力地点');const reply=runtime.snapshot().conversations[0].messages.at(-1);
 assert.equal(reply.steps[0].status,'failed');assert.equal(runtime.snapshot().learning.results.length,1);
 assert.ok(!fs.readFileSync(file,'utf8').includes('私事'));
});

test('通过公共工具领取的问题会刷新桌面进度，但不会提前发出答复通知',t=>{
 const {runtime,userData}=fixture(t);const file=path.join(userData,'shared/data.json'),d=JSON.parse(fs.readFileSync(file));
 (d.courses||Object.values(d.weeks).flatMap(w=>w.sessions)).find(c=>c.id==='7').place='待定';fs.writeFileSync(file,JSON.stringify(d));
 runtime.registerGap('7');runtime.poll();
 let events=0,observed;runtime.on('state',s=>{events++;observed=s;});
 runtime.core.tools.execute('list_pending_questions',{}, {id:'local-teacher',role:'teacher'});
 runtime.poll();assert.equal(events,1);assert.equal(observed.learning.results[0].status,'delivered');
 assert.equal(observed.learning.inbox.filter(n=>n.type==='gap').length,0);
 runtime.poll();assert.equal(events,1);
});

test('对话模型能准备第二版需求卡，只有老师核对并解锁确认后才发布',async t=>{
 let round=0;
 const payload={title:'电池材料找合伙人',summary:'可公开项目简介',lookingFor:'材料背景伙伴',offering:'研究基础',expectations:'每周沟通',audience:'members'};
 const model={enabled:true,model:'mock',async complete(){
   if(round++===0)return {tool_calls:[{id:'prepare',type:'function',function:{name:'prepare_cooperation',arguments:JSON.stringify({operation:'publish_need',payload})}}]};
   return {content:'请核对需求内容和可见范围，点击确认后发布。'};
 }};
 const {runtime}=fixture(t,model);runtime.unlock(fs.readFileSync(runtime.teacherPasswordFile,'utf8').trim());
 const id=runtime.snapshot().activeId;await runtime.send(id,'帮我发布电池材料项目需求，内容可向生态成员公开','cooperationTeacher');
 const reply=runtime.snapshot().conversations[0].messages.at(-1),action=reply.actions[0];
 assert.equal(action.type,'cooperation');assert.equal(action.asTeacher,true);assert.equal(runtime.cooperationBoard(false).needs.length,0);
 runtime.lock();assert.throws(()=>runtime.confirmAction(id,reply.id,action.id));
 runtime.unlock(fs.readFileSync(runtime.teacherPasswordFile,'utf8').trim());runtime.confirmAction(id,reply.id,action.id);
 assert.equal(runtime.cooperationBoard(false).needs[0].title,payload.title);
 runtime.confirmAction(id,reply.id,action.id);assert.equal(runtime.cooperationBoard(false).needs.length,1);
});

test('聊天模型不能调用第二版确认工具；合作草稿重启后可恢复',async t=>{
 let round=0;const model={enabled:true,model:'mock',async complete(){
   if(round++===0)return {tool_calls:[{id:'forged',type:'function',function:{name:'confirm_cooperation',arguments:'{"draftId":"forged"}'}}]};
   return {content:'需要本人确认。'};
 }};
 const {runtime,options}=fixture(t,model);await runtime.send(runtime.snapshot().activeId,'帮我看看项目');
 assert.equal(runtime.snapshot().conversations[0].messages.at(-1).steps[0].status,'failed');
 assert.throws(()=>runtime.prepareCooperation(true,'publish_need',{}));
 runtime.unlock(fs.readFileSync(runtime.teacherPasswordFile,'utf8').trim());
 const draft=runtime.prepareCooperation(true,'publish_need',{title:'导师交流',summary:'聊产业化',lookingFor:'想讨论的同学',offering:'每周五下午',expectations:'准备三个问题',kind:'availability'});
 const reopened=createRuntime(options);t.after(()=>reopened.dispose());
 assert.throws(()=>reopened.cooperationBoard(true));reopened.unlock(fs.readFileSync(reopened.teacherPasswordFile,'utf8').trim());
 assert.equal(reopened.cooperationBoard(true).drafts[0].id,draft.id);reopened.confirmCooperation(true,draft.id);
 assert.equal(reopened.cooperationBoard(false).needs[0].kind,'availability');
});

test('合作提醒持久去重，桌面弹窗不带个人内容；锁定时不读取教师通知',async t=>{
 const {runtime,options}=fixture(t);const c=runtime.core.cooperation,teacher={id:'local-teacher',role:'teacher'};
 const student=runtime.core.personalService.identify(runtime.personalToken);
 const commit=(a,op,p)=>{const draft=c.prepare(a,op,p);return c.confirm(a,draft.id).result.id;};
 const needId=commit(teacher,'publish_need',{title:'private-project-title',summary:'公开简介',lookingFor:'伙伴',offering:'研究基础',expectations:'每周沟通'});
 const id=commit(student,'send_interest',{needId,who:'private-person',experience:'private-experience',availability:'每周 10 小时'});
 const notices=[];runtime.on('notifications',xs=>notices.push(...xs.filter(n=>n.type==='cooperation')));runtime.poll();
 assert.equal(notices.length,0);assert.equal(runtime.snapshot().cooperation.teacher,null);
 assert.throws(()=>runtime.markCooperationRead(true,100));
 runtime.unlock(fs.readFileSync(runtime.teacherPasswordFile,'utf8').trim());runtime.poll();
 assert.equal(notices.length,1);assert.equal(notices[0].asTeacher,true);assert.equal(notices[0].interestId,id);
 assert.ok(!JSON.stringify(notices).includes('private-'));assert.equal(runtime.snapshot().cooperation.teacher.unread,1);
 runtime.poll();assert.equal(notices.length,1);
 const reopened=createRuntime(options);t.after(()=>reopened.dispose());let replay=0;reopened.on('notifications',xs=>{replay+=xs.filter(n=>n.type==='cooperation').length;});
 reopened.unlock(fs.readFileSync(reopened.teacherPasswordFile,'utf8').trim());reopened.poll();assert.equal(replay,0);
 reopened.markCooperationRead(true,reopened.snapshot().cooperation.teacher.latestSeq);assert.equal(reopened.snapshot().cooperation.teacher.unread,0);
 reopened.lock();assert.equal(reopened.snapshot().cooperation.teacher,null);
 commit(teacher,'decide_interest',{id,decision:'accepted'});reopened.poll();assert.equal(replay,1);assert.equal(reopened.snapshot().cooperation.student.unread,1);
});

test('合作进度被外部客户端读过后仍同步桌面角标，但不补弹已读通知',t=>{
 const {runtime}=fixture(t);runtime.poll();const c=runtime.core.cooperation,teacher={id:'local-teacher',role:'teacher'};
 const student=runtime.core.personalService.identify(runtime.personalToken);
 const commit=(a,op,p)=>{const d=c.prepare(a,op,p);return c.confirm(a,d.id).result.id;};
 const needId=commit(teacher,'publish_need',{title:'项目',summary:'简介',lookingFor:'伙伴',offering:'基础',expectations:'讨论'});
 const id=commit(student,'send_interest',{needId,who:'我',experience:'经历',availability:'时间'});
 commit(teacher,'decide_interest',{id,decision:'declined'});
 const updates=runtime.core.tools.execute('get_cooperation_updates',{},student);assert.equal(updates.unread,1);
 runtime.core.tools.execute('mark_cooperation_read',{through:updates.latestSeq},student);
 let notices=0,states=0;runtime.on('notifications',xs=>{notices+=xs.filter(n=>n.type==='cooperation').length;});runtime.on('state',()=>states++);runtime.poll();
 assert.equal(notices,0);assert.ok(states>0);assert.equal(runtime.snapshot().cooperation.student.unread,0);
});

test('独立教师隔离合作草稿、通知与会话，重置口令立即撤销旧登录',async t=>{
 const {runtime}=fixture(t);runtime.unlock(fs.readFileSync(runtime.teacherPasswordFile,'utf8').trim());
 const a=runtime.createTeacherAccount({username:'teacher_a',name:'甲老师',password:'password-a-123'});
 runtime.createTeacherAccount({username:'teacher_b',name:'乙老师',password:'password-b-123'});
 runtime.loginTeacher('teacher_a','password-a-123');
 const teacherId=runtime.snapshot().teacherIdentity.id,conversationId=runtime.snapshot().activeId;
 await runtime.send(conversationId,'甲老师的内部讨论','cooperationTeacher');
 const draft=runtime.prepareCooperation(true,'publish_need',{title:'项目',summary:'简介',lookingFor:'伙伴',offering:'基础',expectations:'讨论'});
 const need=runtime.confirmCooperation(true,draft.id).result;
 const interest=runtime.prepareCooperation(false,'send_interest',{needId:need.id,who:'学生',experience:'经历',availability:'时间'});runtime.confirmCooperation(false,interest.id);
 assert.equal(runtime.snapshot().cooperation.teacher.unread,1);
 runtime.loginTeacher('teacher_b','password-b-123');
 assert.equal(runtime.snapshot().cooperation.teacher.unread,0);
 assert.ok(!runtime.snapshot().conversations.some(c=>c.id===conversationId));
 assert.throws(()=>runtime.exportText(conversationId));assert.throws(()=>runtime.confirmCooperation(true,draft.id));assert.throws(()=>runtime.teacherAccounts());
 runtime.core.accounts.reset({id:'local-teacher',role:'teacher',isAdmin:true},teacherId,'new-password-123');
 runtime.loginTeacher('teacher_a','new-password-123');assert.equal(runtime.snapshot().cooperation.teacher.unread,1);
 runtime.core.accounts.reset({id:'local-teacher',role:'teacher',isAdmin:true},teacherId,'another-password-123');
 assert.throws(()=>runtime.cooperationBoard(true));assert.equal(runtime.snapshot().teacherIdentity,null);
 runtime.loginTeacher('teacher_a','another-password-123');assert.ok(runtime.snapshot().conversations.some(c=>c.id===conversationId));
});

test('创业目标通过桌面任务入口运行、保存报告，重开后可查看和导出',async t=>{
 const {runtime,options}=fixture(t,require('./fixtures/venture-model')());
 const owner={id:'venture-test-teacher',role:'teacher'};
 const draft=runtime.core.cooperation.prepare(owner,'publish_need',{kind:'project',title:'AI 硬件项目',summary:'验证养老需求',lookingFor:'有软件能力',offering:'硬件支持',expectations:'每周 8 小时',audience:'members'});
 runtime.core.cooperation.confirm(owner,draft.id);
 const id=runtime.snapshot().activeId;await runtime.send(id,'我想做 AI 硬件，有软件能力，每周 8 小时','venture');
 const reply=runtime.snapshot().conversations[0].messages.at(-1);
 assert.equal(reply.status,'done',reply.content);assert.equal(reply.venture.reviews.length,2);assert.ok(reply.steps.some(step=>step.tool==='venture_reflect'&&step.status==='done'));assert.equal(reply.venture.selfImprovement.pending,false);assert.equal(reply.actions.length,0);
 assert.equal(runtime.cooperationBoard(false).interests.length,0);
 const reopened=createRuntime(options);t.after(()=>reopened.dispose());
 assert.equal(reopened.snapshot().conversations[0].messages.at(-1).venture.reviews.length,2);assert.ok(reopened.exportText(id).includes('学生侧分析 Agent'));
});
