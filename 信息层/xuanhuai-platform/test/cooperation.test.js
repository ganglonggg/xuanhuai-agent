const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createApp}=require('../server');
const {store}=require('../lib/storage');
const {createCooperation}=require('../lib/cooperation');
const teacher={id:'local-teacher',role:'teacher'},otherTeacher={id:'another-teacher',role:'teacher'};
const card={title:'电池材料产业化合伙人',summary:'公开的项目简介',lookingFor:'有材料背景的产业化伙伴',offering:'项目研究基础',expectations:'每周沟通，共同确认投入',kind:'project',audience:'members'};
const intro={who:'材料专业学生',experience:'做过渠道调研',availability:'每周 10 小时'};
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'xh-cooperation-'));const app=createApp({root,password:'test'});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const make=()=>app.personalService.identify(app.personalService.createSession());return {...app,root,a:make(),b:make(),c:app.cooperation};}
function execute(c,actor,op,payload){const p=c.prepare(actor,op,payload);return c.confirm(actor,p.id).result.id;}
function match(app){const needId=execute(app.c,teacher,'publish_need',card);const id=execute(app.c,app.a,'send_interest',{needId,...intro});execute(app.c,teacher,'decide_interest',{id,decision:'accepted'});return {needId,id};}

test('需求须确认发布；草稿与指定成员可见范围、发布权限隔离',t=>{
 const app=fixture(t),{c,a,b}=app;
 assert.throws(()=>c.board(null));assert.throws(()=>c.prepare(a,'publish_need',card));
 const draft=c.prepare(teacher,'publish_need',{...card,audience:'selected',memberIds:[a.id],rawSecret:'未授权原文'});
 assert.equal(c.board(a).needs.length,0);assert.equal(c.board(a).drafts.length,0);
 assert.throws(()=>c.confirm(otherTeacher,draft.id));
 c.confirm(teacher,draft.id);assert.equal(c.board(a).needs.length,1);assert.equal(c.board(b).needs.length,0);
 assert.equal(c.board(a).needs[0].memberIds,undefined);assert.equal(c.board(a).needs[0].ownerId,undefined);
 assert.throws(()=>c.prepare(b,'send_interest',{needId:draft.id,...intro}),/无权查看/);
 assert.throws(()=>c.prepare(otherTeacher,'close_need',{id:draft.id}));
 assert.ok(!fs.readFileSync(path.join(app.root,'data.json'),'utf8').includes(card.title));
 assert.ok(!fs.readFileSync(path.join(app.root,'cooperation.json'),'utf8').includes('未授权原文'));
});

test('意向只发送给需求方，草稿不提前出现；重复发送和越权决定被拒绝',t=>{
 const app=fixture(t),{c,a,b}=app;const needId=execute(c,teacher,'publish_need',card);
 const d=c.prepare(a,'send_interest',{needId,...intro});assert.equal(c.board(teacher).interests.length,0);
 c.confirm(a,d.id);c.confirm(a,d.id);assert.equal(c.board(teacher).interests.length,1);assert.equal(c.board(b).interests.length,0);
 assert.throws(()=>c.prepare(a,'send_interest',{needId,...intro}));
 assert.throws(()=>c.prepare(a,'decide_interest',{id:d.id,decision:'accepted'}));
 assert.throws(()=>c.prepare(b,'consent_contact',{id:d.id,contact:'hidden'}));
 assert.throws(()=>c.prepare(a,'consent_contact',{id:d.id,contact:'hidden'}),/决定继续/);
});

test('双方分别确认后才交换联系方式；草稿、单方许可和其他成员均不泄露',t=>{
 const app=fixture(t),{c,a,b}=app,{id}=match(app);
 const student=c.prepare(a,'consent_contact',{id,contact:'student-secret-contact'});
 assert.ok(!JSON.stringify(c.board(teacher)).includes('student-secret-contact'));
 c.confirm(a,student.id);assert.equal(c.board(a).interests[0].myConsent,true);
 assert.equal(c.board(teacher).interests[0].otherConsent,true);
 assert.ok(!JSON.stringify(c.board(teacher)).includes('student-secret-contact'));
 const owner=c.prepare(teacher,'consent_contact',{id,contact:'teacher-secret-contact'});
 assert.ok(!JSON.stringify(c.board(a)).includes('teacher-secret-contact'));
 c.confirm(teacher,owner.id);
 assert.equal(c.board(a).interests[0].otherContact,'teacher-secret-contact');
 assert.equal(c.board(teacher).interests[0].otherContact,'student-secret-contact');
 assert.ok(!JSON.stringify(c.board(b)).includes('secret-contact'));
 const reopened=createApp({root:app.root,password:'test'});assert.equal(reopened.cooperation.board(a).interests[0].status,'exchanged');
 assert.throws(()=>c.prepare(a,'withdraw_interest',{id}),/不能撤回/);
});

test('拒绝或撤回结束流程，许可随之清除，私人拒绝理由不保存',t=>{
 const app=fixture(t),{c,a}=app,{id}=match(app);
 execute(c,a,'consent_contact',{id,contact:'尚未交换的联系方式'});
 execute(c,teacher,'decide_interest',{id,decision:'declined',reason:'私人拒绝理由'});
 assert.equal(c.board(a).interests[0].statusLabel,'对方暂不继续');
 assert.equal(c.board(a).interests[0].myConsent,false);
 assert.ok(!fs.readFileSync(path.join(app.root,'cooperation.json'),'utf8').includes('私人拒绝理由'));
 assert.throws(()=>c.prepare(teacher,'consent_contact',{id,contact:'other'}));
 const another=execute(c,a,'send_interest',{needId:c.board(a).needs[0].id,...intro});
 execute(c,a,'withdraw_interest',{id:another});assert.equal(c.board(teacher).interests.find(i=>i.id===another).statusLabel,'对方暂不继续');
});

test('需求修改与关闭使旧卡片失效，确认时重新检查版本与可见范围',t=>{
 const app=fixture(t),{c,a,b}=app,{id,needId}=match(app);
 const oldConsent=c.prepare(a,'consent_contact',{id,contact:'old'});
 const pending=c.prepare(b,'send_interest',{needId,...intro});
 execute(c,teacher,'publish_need',{...card,id:needId,expectations:'新预期',audience:'selected',memberIds:[a.id]});
 assert.equal(c.board(a).interests[0].status,'changed');assert.equal(c.board(b).needs.length,0);
 assert.throws(()=>c.confirm(a,oldConsent.id));assert.throws(()=>c.confirm(b,pending.id));
 const latest=execute(c,a,'send_interest',{needId,...intro});
 execute(c,teacher,'close_need',{id:needId});assert.equal(c.board(a).needs.length,0);
 assert.equal(c.board(a).interests.find(i=>i.id===latest).status,'closed');
 assert.throws(()=>c.prepare(a,'send_interest',{needId,...intro}));
});

test('并发旧草稿不能覆盖新许可；确认重试不会重复创建',t=>{
 const app=fixture(t),{c,a}=app,{id}=match(app);
 const student=c.prepare(a,'consent_contact',{id,contact:'s'}),owner=c.prepare(teacher,'consent_contact',{id,contact:'t'});
 c.confirm(a,student.id);assert.throws(()=>c.confirm(teacher,owner.id),/已有变化/);
 const fresh=c.prepare(teacher,'consent_contact',{id,contact:'t'});c.confirm(teacher,fresh.id);
 c.prepare(teacher,'publish_need',{...card,title:'另一个需求'});
 assert.equal(c.confirm(teacher,fresh.id).confirmed,true);assert.equal(c.board(teacher).interests.length,1);
});

test('约见提出后仍需对方确认，修改、取消与过期安排均受版本保护',t=>{
 const app=fixture(t),{c,a}=app,{id}=match(app);
 const time=new Date(Date.now()+7*86400000).toISOString().slice(0,16);
 assert.throws(()=>c.prepare(a,'propose_meeting',{id,time:'2099-02-31T12:00',duration:30,place:'线上',agenda:'交流'}),/时间格式无效/);
 assert.throws(()=>c.prepare(a,'propose_meeting',{id,time,duration:30,place:'线上',agenda:'交流'}));
 execute(c,a,'consent_contact',{id,contact:'s'});execute(c,teacher,'consent_contact',{id,contact:'t'});
 execute(c,a,'propose_meeting',{id,time,duration:30,place:'线上',agenda:'交流'});
 assert.equal(c.board(teacher).interests[0].meeting.status,'proposed');
 assert.throws(()=>c.prepare(a,'confirm_meeting',{id}));
 const old=c.prepare(teacher,'confirm_meeting',{id});
 execute(c,a,'propose_meeting',{id,time,duration:60,place:'新的地点',agenda:'具体讨论'});
 assert.throws(()=>c.confirm(teacher,old.id));execute(c,teacher,'confirm_meeting',{id});
 assert.equal(c.board(a).interests[0].meeting.status,'confirmed');
 execute(c,a,'cancel_meeting',{id});assert.equal(c.board(teacher).interests[0].meeting.status,'cancelled');
 assert.throws(()=>c.prepare(teacher,'confirm_meeting',{id}));
 assert.throws(()=>c.prepare(a,'propose_meeting',{id,time:'2020-01-01T12:00',duration:30,place:'线上',agenda:'交流'}));
});

test('草稿可取消、会过期；导师可发布可约时间',t=>{
 const app=fixture(t);let date=new Date('2026-11-15T01:00:00Z');
 const c=createCooperation(store(path.join(app.root,'clock.json'),{}),()=>date),mentor={id:'mentor',role:'mentor'};
 const p=c.prepare(mentor,'publish_need',{...card,kind:'availability',offering:'每周五下午可约'});c.discard(mentor,p.id);
 assert.throws(()=>c.confirm(mentor,p.id));
 const expired=c.prepare(mentor,'publish_need',card);date=new Date(+date+25*3600000);assert.throws(()=>c.confirm(mentor,expired.id),/过期/);
 execute(c,mentor,'publish_need',{...card,kind:'availability',offering:'每周五下午可约'});
 assert.equal(c.board(app.a).needs[0].kind,'availability');
});

test('HTTP 工具复用合作权限，匿名公共接口不包含需求或联系方式',async t=>{
 const app=fixture(t);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.server.closeAllConnections();app.server.close();});
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const call=async(name,args,token)=>{const res=await fetch(base+'/api/tools/call',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({name,arguments:args})});return {status:res.status,data:await res.json()};};
 assert.equal((await call('get_cooperation_board',{})).status,401);
 const login=await(await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'test'})})).json();
 const draft=await call('prepare_cooperation',{operation:'publish_need',payload:card},login.token);
 assert.equal(draft.status,200);await call('confirm_cooperation',{draftId:draft.data.result.id},login.token);
 const token=app.personalService.createSession();const board=await call('get_cooperation_board',{},token);assert.equal(board.data.result.needs.length,1);
 assert.ok(!JSON.stringify(await(await fetch(base+'/api/public')).json()).includes(card.title));
 assert.equal((await call('confirm_cooperation',{draftId:draft.data.result.id},token)).status,404);
});

test('交换前可撤销本人许可，保留意向并拒绝旧确认卡；交换后不可撤销',t=>{
 const app=fixture(t),{c,a,b}=app,{id}=match(app);
 execute(c,teacher,'consent_contact',{id,contact:'teacher-private'});
 const old=c.prepare(a,'consent_contact',{id,contact:'student-private'});
 assert.throws(()=>c.prepare(b,'revoke_consent',{id}));assert.throws(()=>c.prepare(a,'revoke_consent',{id}));
 const revoke=c.prepare(teacher,'revoke_consent',{id});assert.equal(c.board(teacher).interests[0].myConsent,true);
 c.confirm(teacher,revoke.id);c.confirm(teacher,revoke.id);
 assert.equal(c.board(teacher).interests[0].myConsent,false);assert.equal(c.board(teacher).interests[0].myContact,undefined);
 assert.equal(c.board(a).interests[0].status,'accepted');assert.throws(()=>c.confirm(a,old.id),/变化/);
 const events=c.updates(a).items.filter(e=>e.type==='consent_revoked');assert.equal(events.length,1);assert.ok(!JSON.stringify(events).includes('private'));
 execute(c,a,'consent_contact',{id,contact:'student-new'});assert.equal(c.board(a).interests[0].otherContact,undefined);
 execute(c,teacher,'consent_contact',{id,contact:'teacher-new'});assert.equal(c.board(a).interests[0].otherContact,'teacher-new');
 assert.throws(()=>c.prepare(teacher,'revoke_consent',{id}),/交换前/);
});
