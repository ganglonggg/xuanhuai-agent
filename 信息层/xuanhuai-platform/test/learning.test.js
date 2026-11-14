const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server');
const teacher={id:'local-teacher',role:'teacher'},now=new Date('2026-11-15T01:00:00Z');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'xh-learning-'));const app=createApp({root,password:'test'});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const make=()=>app.personalService.identify(app.personalService.createSession());return {...app,root,a:make(),b:make(),l:app.personalService.learning};}
function course(id,more={}){return {id,title:'机器人实践 '+id,date:'2026-11-16',time:'13:30–15:00',place:'北洋园 · 三问园 208',status:'confirmed',...more};}
function seed(app,courses,historicalSample=false){fs.writeFileSync(path.join(app.root,'data.json'),JSON.stringify({week:'2026-11-16 至 2026-11-22',historicalSample,courses}));}

test('不同校区方向的用户得到不同推荐；时间冲突和跨校区缓冲参与过滤',t=>{
 const app=fixture(t);seed(app,[course('1'),course('2',{title:'融资方法',place:'卫津路 · 23教206'}),course('3',{date:'2026-11-17'})]);
 app.l.remember(app.a,{kind:'campus',value:'北洋园'},now);app.l.remember(app.a,{kind:'interest',value:'机器人'},now);
 app.l.remember(app.b,{kind:'campus',value:'卫津路'},now);app.l.remember(app.b,{kind:'preference',value:'no_cross_campus'},now);
 assert.equal(app.l.recommend(app.b,{now}).items[0].id,'2');assert.equal(app.l.recommend(app.b,{now}).items.length,1);
 const ra=app.l.recommend(app.a,{now});assert.ok(ra.items.find(x=>x.id==='1').reasons.some(r=>r.includes('机器人')));
 app.l.remember(app.a,{kind:'busy',value:{day:1,start:'15:30',end:'17:00'}},now);
 const ids=app.l.recommend(app.a,{now}).items.map(c=>c.id);assert.ok(ids.includes('1'));assert.ok(!ids.includes('2'));
});
test('没有当期核对事实时不制造推荐；历史样例只在显式预览返回',t=>{
 const app=fixture(t);seed(app,[course('1')],true);assert.equal(app.l.recommend(app.a,{now}).items.length,0);assert.equal(app.l.recommend(app.a,{now,preview:true}).items.length,1);
 seed(app,[course('1',{status:'unconfirmed'}),course('2',{place:'群内通知'}),course('3',{date:'2026-11-01'}),course('4',{status:'cancelled'}),course('5',{registrationDeadline:'2026-11-14T12:00:00+08:00'}),course('6',{time:'未知'}),course('7',{place:'教室 101'})]);
 assert.equal(app.l.recommend(app.a,{now}).items.length,0);
});
test('这次没空不改变方向偏好；减少仅影响同一课程，反馈可以撤销',t=>{
 const app=fixture(t);seed(app,[course('1',{title:'机器人课'}),course('2',{title:'机器人课',date:'2026-11-17'}),course('3',{title:'机器人项目'})]);
 app.l.remember(app.a,{kind:'interest',value:'机器人'},now);app.l.feedback(app.a,'1','busy',now);
 assert.deepEqual(app.l.recommend(app.a,{now}).items.map(c=>c.id).sort(),['2','3']);
 app.l.feedback(app.a,'1','less',now);assert.deepEqual(app.l.recommend(app.a,{now}).items.map(c=>c.id),['3']);
 app.l.feedback(app.a,'1','clear',now);assert.equal(app.l.recommend(app.a,{now}).items.length,3);
 assert.equal(app.l.state(app.a,now).memories.length,1);
 app.l.feedback(app.a,'3','want',now);assert.equal(app.personalService.state(app.a).subscriptions.length,1);
});
test('临时目标到期失效、可删除、重启保留；个人记忆不进入公共数据',t=>{
 const app=fixture(t);seed(app,[course('1')]);const memory=app.l.remember(app.a,{kind:'goal',value:'机器人实践',expiresAt:'2026-11-15'},now);
 assert.ok(app.l.recommend(app.a,{now}).items[0].reasons.some(r=>r.includes('近期目标')));
 const next=new Date('2026-11-16T01:00:00Z');assert.ok(app.l.state(app.a,next).memories[0].expired);
 assert.ok(!app.l.recommend(app.a,{start:'2026-11-16',now:next}).items[0].reasons.some(r=>r.includes('近期目标')));
 const restarted=createApp({root:app.root,password:'test'});assert.equal(restarted.personalService.learning.state(app.a,now).memories.length,1);
 assert.ok(!fs.readFileSync(path.join(app.root,'data.json'),'utf8').includes('expiresAt'));
 assert.equal(app.l.state(app.b,now).memories.length,0);app.l.forget(app.a,memory.id);assert.equal(app.l.state(app.a,now).memories.length,0);
 assert.throws(()=>app.l.remember(app.a,{kind:'goal',value:'找队友'},now));
 assert.throws(()=>app.l.remember(app.a,{kind:'busy',value:{day:1,start:'25:00',end:'26:00'}},now));
});
test('周日北京时间 9 点生成一次，重启不重复，漏过周日可补本周；旧课表不推送',t=>{
 const app=fixture(t);seed(app,[course('1')]);
 assert.equal(app.l.poll(app.a,new Date('2026-11-15T00:59:00Z')).length,0);
 assert.equal(app.l.poll(app.a,now).length,1);assert.equal(app.l.poll(app.a,now).length,0);
 const restarted=createApp({root:app.root,password:'test'});assert.equal(restarted.personalService.learning.poll(app.a,now).length,0);
 assert.equal(app.l.state(app.a,now).digests[0].items.length,1);
 app.l.poll(app.b,new Date('2026-11-17T01:00:00Z'));assert.equal(app.l.state(app.b,now).digests[0].items.length,0); // Monday's course is past.
 assert.equal(app.l.state(app.b,now).digests[0].start,'2026-11-16');
 app.l.markRead(app.a);assert.ok(app.l.state(app.a,now).inbox.every(n=>n.read));
});
test('地点缺口去重、权限隔离、确认后通知所有等待者且不通知其他人',t=>{
 const app=fixture(t);seed(app,[course('1',{place:'待定'})]);const c=app.personalService.identify(app.personalService.createSession());
 const ga=app.l.registerGap(app.a,'1',now),gb=app.l.registerGap(app.b,'1',now);assert.equal(ga.id,gb.id);
 assert.equal(app.publicService.pendingGaps(teacher).length,1);assert.throws(()=>app.publicService.pendingGaps(app.a));
 const publicText=fs.readFileSync(path.join(app.root,'data.json'),'utf8');assert.ok(!publicText.includes(app.a.id));assert.ok(!publicText.includes(app.b.id));
 assert.throws(()=>app.publicService.answerGap(ga.id,'教室',{id:'another',role:'teacher'}));
 assert.throws(()=>app.publicService.answerGap(ga.id,'待通知',teacher));
 const proposal=app.publicService.answerGap(ga.id,'北洋园 · 三问园 208',teacher);
 assert.equal(app.l.results(app.a)[0].status,'pending_confirmation');assert.equal(app.publicService.getCourse('1').place,'待定');
 app.publicService.confirm(proposal.id,teacher);app.publicService.confirm(proposal.id,teacher);
 assert.equal(app.l.results(app.a)[0].answer,'北洋园 · 三问园 208');assert.equal(app.publicService.pendingGaps(teacher).length,0);
 for(const actor of [app.a,app.b,c])app.l.poll(actor,now);
 assert.equal(app.l.state(app.a,now).inbox.filter(n=>n.type==='gap').length,1);
 assert.equal(app.l.state(app.b,now).inbox.filter(n=>n.type==='gap').length,1);
 assert.equal(app.l.state(c,now).inbox.filter(n=>n.type==='gap').length,0);
 app.l.poll(app.a,now);assert.equal(app.l.state(app.a,now).inbox.filter(n=>n.type==='gap').length,1);
 assert.throws(()=>app.l.registerGap(app.a,'1',now));assert.throws(()=>app.tools.execute('register_gap',{id:'1'},null));
});

test('四级进度由真实领取与确认推进；学生查询和教师快照不会冒充送达',t=>{
 const app=fixture(t);seed(app,[course('1',{place:'待定'})]);
 const gap=app.l.registerGap(app.a,'1',now);
 assert.equal(gap.status,'pending_delivery');assert.match(gap.notice,/未发送邮件/);
 app.publicService.pendingGaps(teacher);app.l.results(app.a);
 assert.equal(app.publicService.gapResult(gap.id).status,'pending_delivery');
 assert.throws(()=>app.publicService.receiveQuestions(app.a));
 assert.deepEqual(app.publicService.receiveQuestions({id:'other',role:'teacher'}),[]);
 assert.equal(app.publicService.gapResult(gap.id).status,'pending_delivery');
 const [received]=app.tools.execute('list_pending_questions',{},teacher);
 assert.equal(received.status,'delivered');assert.ok(received.deliveredAt);
 assert.equal(app.publicService.receiveQuestions(teacher)[0].deliveredAt,received.deliveredAt);
 assert.equal(app.l.registerGap(app.b,'1',now).status,'delivered');
 const proposal=app.tools.execute('answer_question',{gapId:gap.id,answer:'北洋园 · 尚未发布的地点 305'},teacher);
 const result=app.tools.execute('get_gap_results',{},app.a)[0];
 assert.equal(result.status,'pending_confirmation');
 assert.ok(!JSON.stringify(result).includes('305'));assert.equal(result.proposalId,undefined);assert.equal(result.assignedTo,undefined);
 app.l.poll(app.a,now);assert.equal(app.l.state(app.a,now).inbox.filter(n=>n.type==='gap').length,0);
 const reopened=createApp({root:app.root,password:'test'});
 assert.equal(reopened.personalService.learning.results(app.a)[0].status,'pending_confirmation');
 reopened.publicService.confirm(proposal.id,teacher);
 assert.equal(reopened.personalService.learning.results(app.a)[0].status,'answered');
 // A different student's next lookup uses the published answer without another question.
 assert.equal(reopened.tools.execute('get_course',{id:'1'},app.b).place,'北洋园 · 尚未发布的地点 305');
 assert.throws(()=>reopened.personalService.learning.registerGap(app.b,'1',now));
});

test('重新答复替代旧提案，旧确认按钮不能覆盖最新答复',t=>{
 const app=fixture(t);seed(app,[course('1',{place:'待定'})]);const gap=app.l.registerGap(app.a,'1',now);
 const old=app.publicService.answerGap(gap.id,'北洋园 · 101',teacher);
 const latest=app.publicService.answerGap(gap.id,'北洋园 · 202',teacher);
 assert.throws(()=>app.publicService.confirm(old.id,teacher),/替代/);
 assert.equal(app.publicService.getCourse('1').place,'待定');
 app.publicService.confirm(latest.id,teacher);
 assert.equal(app.publicService.gapResult(gap.id).answer,'北洋园 · 202');
 assert.throws(()=>app.publicService.confirm(old.id,teacher));
 assert.equal(app.publicService.confirm(latest.id,teacher).alreadyConfirmed,true);
});

test('其他已确认修改可解决缺口；未确认提案或冲突不会提前产生答案',t=>{
 const app=fixture(t);seed(app,[course('1',{place:'待定'})]);const gap=app.l.registerGap(app.a,'1',now);
 const draft=app.publicService.answerGap(gap.id,'北洋园 · 101',teacher);
 const note=app.publicService.propose([{id:'1',fields:{note:'安排有变'}}],teacher);
 app.publicService.confirm(note.id,teacher);
 assert.throws(()=>app.publicService.confirm(draft.id,teacher),/已有变化/);
 assert.equal(app.publicService.gapResult(gap.id).status,'pending_confirmation');
 assert.equal(app.publicService.gapResult(gap.id).answer,undefined);
 const direct=app.publicService.propose([{id:'1',fields:{place:'北洋园 · 303'}}],teacher);
 app.publicService.confirm(direct.id,teacher);
 assert.equal(app.publicService.gapResult(gap.id).answer,'北洋园 · 303');
 assert.throws(()=>app.publicService.confirm(draft.id,teacher));
});

test('旧 pending 数据保守迁移；未知负责人不会误送给本机共享教师',t=>{
 const app=fixture(t);seed(app,[course('1',{place:'待定',ownerId:'teacher-b'})]);const gap=app.l.registerGap(app.a,'1',now);
 const file=path.join(app.root,'data.json'),data=JSON.parse(fs.readFileSync(file));data.gaps[0].status='pending';fs.writeFileSync(file,JSON.stringify(data));
 const reopened=createApp({root:app.root,password:'test'});
 assert.equal(reopened.publicService.gapResult(gap.id).status,'pending_delivery');
 assert.deepEqual(reopened.publicService.receiveQuestions(teacher),[]);
 assert.throws(()=>reopened.publicService.answerGap(gap.id,'北洋园 · 101',teacher));
 const assigned={id:'teacher-b',role:'teacher'};
 assert.equal(reopened.publicService.receiveQuestions(assigned)[0].status,'delivered');
 assert.equal(JSON.parse(fs.readFileSync(file)).gaps[0].status,'delivered');
});
