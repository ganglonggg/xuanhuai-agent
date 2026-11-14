const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createApp}=require('../server');
const {store,hash}=require('../lib/storage');
const {migrate}=require('../lib/schedule');
const draft=JSON.parse(fs.readFileSync(path.join(__dirname,'../../knowledge-base/课表/下周课表草稿.json'),'utf8'));
const admin={id:'local-teacher',role:'teacher',name:'管理员',isAdmin:true},now=new Date('2026-11-15T01:00:00Z');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'xh-weekly-'));const app=createApp({root,password:'admin-test-password'});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const student=app.personalService.identify(app.personalService.createSession());return {...app,root,student,p:app.publicService,call:(name,args={},a=admin)=>app.tools.execute(name,args,a)};}
function teacher(a,name='老师甲'){const t=a.accounts.create(admin,{username:name,name,password:'teacher-password'});return a.accounts.login(name,'teacher-password').actor;}
function imported(t){const a=fixture(t);a.p.importDraft(draft,admin);return a;}
function confirm(a,p,actor=admin){return a.p.confirm(p.id,actor);}

test('迁移备份原文件；同课多场次合并稳定 ID，订阅与游标跨重启保留',t=>{
 const a=fixture(t),file=path.join(a.root,'data.json'),d=JSON.parse(fs.readFileSync(file));assert.equal(d.schemaVersion,2);assert.equal(d.weeks['2026-11-09'].sessions.length,17);assert.equal(d.catalog.length,14);assert.equal(d.aliases['9'],'1');assert.ok(fs.readdirSync(path.join(a.root,'backups')).some(f=>f.startsWith('data.before-weeks')));
 const personal=JSON.parse(fs.readFileSync(path.join(a.root,'personal.json')));personal.users[a.student.id].subscriptions=[{courseId:'1',afterSeq:4},{courseId:'9',afterSeq:2}];fs.writeFileSync(path.join(a.root,'personal.json'),JSON.stringify(personal));const restarted=createApp({root:a.root,password:'admin-test-password'});assert.deepEqual(restarted.personalService.state(a.student).subscriptions,[{courseId:'1',afterSeq:2}]);assert.deepEqual(migrate(d),d);
});

test('导入四组规则及负责人姓名；幂等且不自动创建账号或重复场次',t=>{
 const a=imported(t),first=a.p.getDraft(draft.week_start,admin);assert.equal(first.sessions.length,5);assert.equal(a.p.importDraft(draft,admin).alreadyImported,true);assert.equal(a.accounts.list(admin).length,0);const catalog=a.p.catalog(admin);assert.ok(catalog.some(c=>c.ownerName==='刘毅'&&!c.ownerId));for(const group of ['rows','not_this_week','ended','unknown'])assert.ok(catalog.some(c=>c.importGroup===group));assert.equal(a.p.getDraft(draft.week_start,admin).sessions.length,5);const changed=structuredClone(draft);changed.rows[0].classroom='另一教室';assert.throws(()=>a.p.importDraft(changed,admin),{status:409});
});

test('第13周仅生成四门有依据的单周课；四门已结课课程不出现',t=>{
 const a=imported(t),w=a.p.generateWeek('2026-11-23',admin);assert.equal(w.number,13);assert.equal(w.sessions.length,4);for(const title of ['寻找第一个客户','硬科技企业资本力提升之路','在玩耍中学习','AI驱动的一人公司'])assert.ok(w.sessions.some(s=>s.title.includes(title)));for(const title of ['科创领导力','以人为本','技术创新与产品研发管理实践','AI-driven'])assert.ok(!JSON.stringify(w).includes(title));assert.ok(w.uncertain.some(c=>c.title.includes('AI×产业')));assert.equal(a.p.generateWeek('2026-11-23',admin).alreadyGenerated,true);
});

test('北京时间本周/下周与往期查询；沿用项可见且未知地点嘉宾为空',t=>{
 const a=imported(t),q=a.p.listCourses('',a.student,{now});assert.equal(q.start,'2026-11-09');assert.equal(q.end,'2026-11-22');assert.equal(q.courses.length,22);assert.equal('historicalSample'in q,false);const lecture=q.courses.find(c=>c.weekStart==='2026-11-16'&&c.title.includes('大讲堂'));assert.equal(lecture.place,'');assert.equal(lecture.teacher,'');assert.equal(lecture.statusLabel,'沿用本学期安排，本周待确认');assert.ok(lecture.source.includes('2026-10-12'));assert.equal(a.p.listCourses('',a.student,{now:new Date('2026-11-15T16:00:00Z')}).start,'2026-11-16');assert.ok(a.p.listCourses('',a.student,{start:'2026-11-09',now:new Date('2026-11-25')}).courses.every(c=>c.past));assert.deepEqual(a.p.listCourses('',null,{now}).courses,[]);
});

test('草稿暂存不会向学生泄露；明确确认后逐项升级，未处理项继续待确认',t=>{
 const a=imported(t),owner=teacher(a),s=a.p.getDraft(draft.week_start,admin).sessions.find(s=>s.title.includes('大讲堂'));a.accounts.assign(admin,s.courseId,owner.id);a.personalService.follow(a.student,s.id);
 a.p.editDraft(draft.week_start,s.id,{place:'23教206',teacher:'本周嘉宾张老师',visibility:'members'},['place','teacher'],owner);
 assert.equal(a.p.getCourse(s.id,a.student).place,'');assert.ok(!JSON.stringify(a.p.getCourse(s.id,a.student)).includes('张老师'));
 const p=a.p.prepareWeek(draft.week_start,owner);assert.equal(p.items.length,1);assert.ok(p.items[0].review.unresolved.includes('topic'));assert.equal(a.personalService.state(a.student).notifications.length,0);
 confirm(a,p,owner);const c=a.p.getCourse(s.id,a.student);assert.equal(c.place,'23教206');assert.equal(c.fieldStatus.place,'confirmed');assert.equal(c.fieldStatus.topic,'pending');assert.equal(c.status,'unconfirmed');assert.equal(c.evidence.place.provider,owner.name);assert.ok(c.evidence.place.confirmedAt);assert.equal(a.personalService.state(a.student).notifications.length,1);confirm(a,p,owner);assert.equal(a.personalService.state(a.student).notifications.length,1);
 assert.throws(()=>a.p.editDraft(draft.week_start,s.id,{place:'偷改'},[],owner),{status:409});
});

test('发布提案包含可见范围；受限课程不出现在详情、列表、变更、通知、推荐或追问结果',t=>{
 const a=imported(t),owner=teacher(a),other=teacher(a,'老师乙'),s=a.p.getDraft(draft.week_start,admin).sessions[0];a.accounts.assign(admin,s.courseId,owner.id);a.personalService.follow(a.student,s.id);const gap=a.personalService.learning.registerGap(a.student,{id:s.id,field:'registration'});a.p.editDraft(draft.week_start,s.id,{visibility:'staff'},[],owner);const p=a.p.prepareWeek(draft.week_start,owner);assert.equal(p.items[0].review.visibility,'staff');confirm(a,p,owner);
 for(const actor of [a.student,other,null]){assert.throws(()=>a.p.getCourse(s.id,actor),{status:404});assert.ok(!a.p.listCourses('',actor,{now}).courses.some(c=>c.id===s.id));assert.ok(!a.p.changes(0,actor).some(c=>c.sessionId===s.id));}
 assert.ok(a.p.getCourse(s.id,owner));assert.ok(a.p.getCourse(s.id,admin));assert.equal(a.personalService.state(a.student).notifications.length,0);assert.ok(!a.personalService.learning.recommend(a.student,{now}).items.some(c=>c.id===s.id));assert.throws(()=>a.p.gapResult(gap.id,a.student),{status:404});
});

test('账号只存 scrypt 加盐哈希；重置撤销令牌；管理员能力不能被普通老师调用',t=>{
 const a=fixture(t),t1=a.accounts.create(admin,{username:'t1',name:'甲',password:'same-password'}),t2=a.accounts.create(admin,{username:'t2',name:'乙',password:'same-password'});const raw=JSON.parse(fs.readFileSync(path.join(a.root,'accounts.json')));assert.ok(!JSON.stringify(raw).includes('same-password'));assert.notEqual(raw.teachers[0].password.salt,raw.teachers[1].password.salt);assert.notEqual(raw.teachers[0].password.hash,raw.teachers[1].password.hash);
 const login=a.accounts.login('t1','same-password'),actor=login.actor;assert.equal(a.accounts.identify(login.token).id,t1.id);assert.throws(()=>a.accounts.create(actor,{username:'x',name:'x',password:'long-password'}),{status:403});assert.throws(()=>a.accounts.reset(actor,t2.id,'new-password'),{status:403});assert.throws(()=>a.accounts.assign(actor,'7',t1.id),{status:403});a.accounts.reset(admin,t1.id,'new-password');assert.equal(a.accounts.identify(login.token),null);assert.throws(()=>a.accounts.login('t1','same-password'),{status:401});assert.ok(a.accounts.login('t1','new-password').token);assert.throws(()=>a.accounts.login('teacher','admin-test-password'));assert.ok(a.accounts.login('admin','admin-test-password').actor.isAdmin);
});

test('老师只改负责课程；更正建议进入负责老师列表且审核后仍需确认',t=>{
 const a=imported(t),owner=teacher(a),other=teacher(a,'老师乙'),s=a.p.getDraft(draft.week_start,admin).sessions[0];a.accounts.assign(admin,s.courseId,owner.id);assert.throws(()=>a.p.propose([{id:s.id,fields:{place:'越权'}}],other),{status:403});assert.throws(()=>a.p.editDraft(draft.week_start,s.id,{place:'越权'},[],other),{status:403});const suggestion=a.p.suggest(s.id,{place:'建议地点'},other);assert.equal(a.p.suggestions(owner).length,1);assert.equal(a.p.suggestions(other).length,0);const p=a.p.acceptSuggestion(suggestion.id,owner);assert.notEqual(a.p.getCourse(s.id,a.student).place,'建议地点');assert.throws(()=>confirm(a,p,other),{status:404});confirm(a,p,owner);assert.equal(a.p.getCourse(s.id,a.student).place,'建议地点');assert.equal(a.p.suggestions(owner).length,0);
});

test('负责人重分配和场次版本变化使旧提案失效，不能部分写入',t=>{
 const a=imported(t),owner=teacher(a),other=teacher(a,'老师乙'),s=a.p.getDraft(draft.week_start,admin).sessions[0];a.accounts.assign(admin,s.courseId,owner.id);const p=a.p.prepareWeek(draft.week_start,owner);a.accounts.assign(admin,s.courseId,other.id);assert.throws(()=>confirm(a,p,owner),{status:403});assert.equal(a.p.getCourse(s.id,a.student).status,'unconfirmed');const fresh=a.p.prepareWeek(draft.week_start,other);a.p.editDraft(draft.week_start,s.id,{place:'新地点'},[],other);assert.throws(()=>confirm(a,fresh,other),{status:409});
});

test('跨周自动延续关注；取消保留场次并通知关注者；结课影响后续生成',t=>{
 const a=imported(t);a.personalService.follow(a.student,'3');const w=a.p.generateWeek('2026-11-23',admin),s=w.sessions.find(s=>s.courseId==='3');confirm(a,a.p.prepareWeek(w.start,admin));assert.ok(a.personalService.state(a.student).notifications.some(e=>e.sessionId===s.id));const p=a.p.proposeOperation('cancel_session',{id:s.id},admin);assert.notEqual(a.p.getCourse(s.id,a.student).status,'cancelled');confirm(a,p);assert.equal(a.p.getCourse(s.id,a.student).statusLabel,'已取消');assert.ok(a.p.listCourses('',a.student,{start:w.start}).courses.some(c=>c.id===s.id));confirm(a,a.p.proposeOperation('end_course',{courseId:'3'},admin));assert.ok(a.personalService.state(a.student).notifications.some(e=>e.after.ended));assert.ok(!a.p.generateWeek('2026-12-07',admin).sessions.some(c=>c.courseId==='3'));
});

test('新增课程与同周多场次须逐步确认，学生不能新增；取消权限也受归属约束',t=>{
 const a=fixture(t),owner=teacher(a),other=teacher(a,'老师乙');assert.throws(()=>a.p.proposeOperation('add_course',{title:'新课程'},a.student),{status:403});const p=a.p.proposeOperation('add_course',{title:'新课程'},owner);assert.ok(!a.p.catalog(admin).some(c=>c.title==='新课程'));confirm(a,p,owner);const id=p.items[0].id;assert.equal(a.p.catalog(admin).find(c=>c.id===id).ownerId,owner.id);
 for(const date of ['2026-11-16','2026-11-18'])confirm(a,a.p.proposeOperation('add_session',{courseId:id,date,time:'13:30–17:00',place:'208',campus:'北洋园',teacher:'甲'},owner),owner);
 const rows=a.p.listCourses('新课程',a.student,{start:'2026-11-16'}).courses;assert.equal(rows.length,2);assert.ok(rows.every(c=>c.courseId===id));assert.throws(()=>a.p.proposeOperation('cancel_session',{id:rows[0].id},other),{status:403});assert.throws(()=>a.p.proposeOperation('add_session',{courseId:id,date:'2026-02-30',time:'13:00'},owner));
});

test('周次规则修正影响后续草稿，多场次时段保留；锚点可配置且拒绝错误周一',t=>{
 const a=imported(t),c=a.p.catalog(admin).find(c=>c.id==='3');const r={...c.rule,frequency:'weekly',days:[1,3],slots:[{day:1,time:'13:30–17:00'},{day:3,time:'18:30–21:45'}],basis:['老师确认每周两次'],inferred:false};const p=a.p.proposeOperation('update_rule',{courseId:c.id,rule:r},admin);assert.equal(a.p.catalog(admin).find(c=>c.id==='3').rule.frequency,'odd');confirm(a,p);const rows=a.p.generateWeek('2026-11-30',admin).sessions.filter(s=>s.courseId==='3');assert.equal(rows.length,2);assert.deepEqual(rows.map(s=>s.day),[1,3]);assert.throws(()=>a.p.generateWeek('2026-11-24',admin));assert.throws(()=>a.p.configureAnchor({start:'2026-11-09',number:0},admin));assert.deepEqual(a.p.configureAnchor({start:'2026-11-02',number:10},admin),{start:'2026-11-02',number:10});
});

test('草稿问题与学生追问合并；只由负责人领取；答复确认前不泄露',t=>{
 const a=imported(t),owner=teacher(a),other=teacher(a,'老师乙'),s=a.p.getDraft(draft.week_start,admin).sessions.find(s=>s.title.includes('大讲堂'));a.accounts.assign(admin,s.courseId,owner.id);
 const before=a.p.pendingGaps(owner),g=a.personalService.learning.registerGap(a.student,{id:s.id,field:'teacher'});assert.equal(before.find(g=>g.field==='teacher').id,g.id);assert.equal(g.statusLabel,'已登记待转交');assert.equal(a.p.receiveQuestions(other).length,0);assert.equal(a.p.gapResult(g.id,a.student).status,'pending_delivery');a.p.receiveQuestions(owner);assert.equal(a.p.gapResult(g.id,a.student).statusLabel,'已向负责老师询问');const p=a.p.answerGap(g.id,'嘉宾甲',owner);assert.equal(a.p.gapResult(g.id,a.student).statusLabel,'已答复待确认');assert.equal(a.p.gapResult(g.id,a.student).answer,undefined);confirm(a,p,owner);assert.equal(a.p.gapResult(g.id,a.student).statusLabel,'已确认');assert.equal(a.p.getCourse(s.id,a.student).teacher,'嘉宾甲');
});

test('无课程ID按名登记合并，管理员分配后老师领取并确认答复',t=>{
 const a=fixture(t),owner=teacher(a);const g=a.personalService.learning.registerGap(a.student,{title:'未录入的创业课',field:'is_running'});assert.equal(g.courseId,null);assert.equal(g.status,'pending_delivery');assert.equal(a.p.pendingGaps(owner).length,0);assert.ok(a.p.pendingGaps(admin).some(x=>x.id===g.id));const other=a.personalService.identify(a.personalService.createSession());assert.equal(a.personalService.learning.registerGap(other,{title:'未录入的创业课',field:'is_running'}).id,g.id);a.call('assign_question',{gapId:g.id,teacherId:owner.id});assert.equal(a.p.receiveQuestions(owner)[0].status,'delivered');const p=a.p.answerGap(g.id,'本周开课，具体安排稍后公布',owner);assert.equal(a.p.gapResult(g.id,a.student).answer,undefined);confirm(a,p,owner);assert.equal(a.personalService.learning.results(other)[0].answer,'本周开课，具体安排稍后公布');
});

test('时间/是否开课/报名/主题/嘉宾追问均走提案确认，取消答复产生通知',t=>{
 const a=imported(t),owner=teacher(a),s=a.p.getDraft(draft.week_start,admin).sessions[0];a.accounts.assign(admin,s.courseId,owner.id);a.personalService.follow(a.student,s.id);
 for(const [field,answer] of [['time','19:00–21:00'],['registration','现场旁听'],['topic','创业案例'],['guest','王老师'],['is_running','no']]){const g=a.personalService.learning.registerGap(a.student,{id:s.id,field});confirm(a,a.p.answerGap(g.id,answer,owner),owner);assert.equal(a.p.gapResult(g.id,a.student).answer,answer);}
 assert.equal(a.p.getCourse(s.id,a.student).status,'cancelled');assert.equal(a.personalService.state(a.student).notifications.length,5);
});

test('汇总按日期排序且标出真实冲突，受限场次不能泄露为冲突对象',t=>{
 const a=imported(t),q=a.p.summary(a.student,{now}),thursday=q.courses.filter(c=>c.date==='2026-11-19'&&c.time==='18:30–21:45');assert.equal(thursday.length,2);assert.ok(thursday.every(c=>c.conflicts.length));for(const c of thursday)for(const k of ['time','place','campus','teacher','source','statusLabel'])assert.ok(k in c);confirm(a,a.p.propose([{id:thursday[0].id,fields:{visibility:'staff'}}],admin));const filtered=a.p.summary(a.student,{now});assert.ok(filtered.courses.every(c=>!c.conflicts.includes(thursday[0].id)));assert.deepEqual(filtered.courses.map(c=>c.date),filtered.courses.map(c=>c.date).sort());
});

// Exercise actual HTTP routing without opening sockets (sandbox can disallow listen()).
async function request(app,route,body,token){const {Readable}=require('node:stream');const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.url=route;req.method=body===undefined?'GET':'POST';req.headers={host:'127.0.0.1',...(token?{authorization:'Bearer '+token}:{})};return new Promise(resolve=>{let status;const res={writeHead(s){status=s;},end(data){resolve({status,body:JSON.parse(data)});}};app.server.emit('request',req,res);});}

test('HTTP 账号、角色与课程工具路由在同一服务执行，匿名看不到课表',async t=>{
 const a=imported(t);const login=await request(a,'/api/login',{username:'admin',password:'admin-test-password'});assert.equal(login.status,200);const token=login.body.token;
 const t1=await request(a,'/api/admin/teachers',{username:'teacher-http',name:'HTTP老师',password:'teacher-pass'},token);assert.equal(t1.status,200);const teacherLogin=await request(a,'/api/login',{username:'teacher-http',password:'teacher-pass'});assert.equal((await request(a,'/api/admin/teachers',undefined,teacherLogin.body.token)).status,403);
 const anon=await request(a,'/api/courses');assert.deepEqual(anon.body.courses,[]);const student=await request(a,'/api/session',{});assert.ok((await request(a,'/api/courses',undefined,student.body.token)).body.courses.length);
 const call=await request(a,'/api/tools/call',{name:'get_week_summary'},student.body.token);assert.equal(call.status,200);assert.equal(call.body.result.timeZone,'Asia/Shanghai');assert.equal((await request(a,'/api/tools/call',{name:'generate_week_draft',arguments:{start:'2026-11-23'}},teacherLogin.body.token)).status,403);
 const proposal=await request(a,'/api/proposals',{updates:[{id:'7',fields:{place:'联调新教室'}}]},token);assert.equal(proposal.status,200);assert.equal((await request(a,'/api/proposals/confirm',{id:proposal.body.proposal.id},token)).status,200);
 await request(a,'/api/admin/reset',{id:t1.body.id,password:'reset-password'},token);assert.equal((await request(a,'/api/me',undefined,teacherLogin.body.token)).body.actor,null);
});

test('没有负责人的新草稿与无ID问题，即使管理员查列表也保持待转交',t=>{
 const a=imported(t),s=a.p.getDraft(draft.week_start,admin).sessions.find(s=>s.title.includes('大讲堂'));const g=a.personalService.learning.registerGap(a.student,{id:s.id,field:'teacher'});const unknown=a.personalService.learning.registerGap(a.student,{title:'管理员还没分配的新课程',field:'time'});a.p.receiveQuestions(admin);assert.equal(a.p.gapResult(g.id,a.student).status,'pending_delivery');assert.equal(a.p.gapResult(unknown.id,a.student).status,'pending_delivery');
});

test('私有课程的公开场次不能绕过课程范围；学生的受限追问结果被过滤',t=>{
 const a=fixture(t),owner=teacher(a);const newCourse=a.p.proposeOperation('add_course',{title:'内部课程',visibility:'staff'},owner);confirm(a,newCourse,owner);const id=newCourse.items[0].id;const newSession=a.p.proposeOperation('add_session',{courseId:id,date:'2026-11-16',time:'18:30–20:00',place:'内部地点',teacher:'老师',visibility:'members'},owner);confirm(a,newSession,owner);assert.throws(()=>a.p.getCourse(newSession.items[0].id,a.student),{status:404});
 const g=a.personalService.learning.registerGap(a.student,{id:'7',field:'registration'});confirm(a,a.p.propose([{id:'7',fields:{visibility:'staff'}}],admin));assert.ok(!a.personalService.learning.results(a.student).some(x=>x.id===g.id));
});

test('学生直接问下周有什么课：本地回答含沿用标签与来源，不调用模型或联网',async t=>{
 const a=imported(t);let called=false;a.deepseek.complete=async()=>{called=true;throw Error('不应调用模型');};const result=await a.agent.ask('下周有什么课？',[],a.student);assert.equal(called,false);assert.match(result.answer,/沿用本学期安排，本周待确认/);assert.match(result.answer,/来源/);assert.match(result.answer,/地点待确认/);assert.equal(result.trace[0].tool,'get_week_summary');
});

test('MCP适配器完整转发新增工具与教师身份，确认前不会发布（内存HTTP传输）',async t=>{
 const a=imported(t),login=a.accounts.login('admin','admin-test-password');const previousFetch=global.fetch;
 global.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):undefined;const token=(options.headers?.Authorization||'').replace(/^Bearer /,'')||login.token;const result=await request(a,new URL(url).pathname,body,token);return {ok:result.status<400,status:result.status,json:async()=>result.body};};
 try{const {handle}=require('../mcp');const list=await handle({jsonrpc:'2.0',id:1,method:'tools/list'});assert.ok(list.result.tools.some(t=>t.name==='prepare_week_publish'));const p=await handle({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'prepare_week_publish',arguments:{start:'2026-11-16'}}});const proposal=JSON.parse(p.result.content[0].text);assert.equal(a.p.getDraft('2026-11-16',admin).state,'draft');const result=await handle({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'confirm_course_change',arguments:{proposalId:proposal.id}}});assert.ok(!result.result.isError);assert.equal(a.p.getDraft('2026-11-16',admin).state,'published');}finally{global.fetch=previousFetch;}
});
