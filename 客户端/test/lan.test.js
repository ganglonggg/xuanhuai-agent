const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLanServer,provision}=require('../lan/server');
const users=[{username:'student_test',name:'测试学生',role:'student',password:'student-test-password'},{username:'teacher_test',name:'测试教师',role:'teacher',password:'teacher-test-password'},{username:'student_other',name:'另一学生',role:'student',password:'other-test-password'}];
async function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xh-lan-test-'));provision(root,users);
 const service=createLanServer({root});await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${service.server.address().port}`;
 t.after(async()=>{await service.close();fs.rmSync(root,{recursive:true,force:true});});
 async function request(route,body,cookie='',headers={}){const res=await fetch(base+route,{redirect:'manual',method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Xuanhuai-Request':'1',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,cookie:res.headers.get('set-cookie')?.split(';')[0],body:res.headers.get('content-type')?.includes('json')?await res.json():await res.text()};}
 async function login(user){const result=await request('/api/login',user);assert.equal(result.status,200);return result.cookie;}
 async function rpc(cookie,method,...args){const result=await request('/api/rpc',{method,args},cookie);assert.equal(result.status,200,JSON.stringify(result.body));return result.body.value;}
 return {root,service,request,login,rpc};
}
test('LAN authentication, role isolation and stable personal identity',async t=>{
 const f=await fixture(t);
 assert.equal((await f.request('/api/state')).status,401);assert.equal((await f.request('/')).status,302);
 assert.equal((await f.request('/api/login',{username:'student_test',password:'wrong'})).status,401);
 assert.equal((await f.request('/api/login',users[0],'',{Origin:'http://evil.example'})).status,403);
 assert.equal((await f.request('/api/login',users[0],'',{'X-Xuanhuai-Request':''})).status,403);
 const student=await f.login(users[0]),teacher=await f.login(users[1]),other=await f.login(users[2]);
 const studentState=await f.rpc(student,'state'),teacherState=await f.rpc(teacher,'state');
 assert.equal(studentState.webSession.role,'student');assert.equal(teacherState.teacherIdentity.isAdmin,false);
 for(const [method,args] of [['loginTeacher',['admin','whatever']],['teacherAccounts',[]],['receiveQuestions',[]],['cooperationBoard',[true]],['send',[studentState.activeId,'pretend teacher','teacher']]])assert.equal((await f.request('/api/rpc',{method,args},student)).status,403);
 assert.equal((await f.request('/api/rpc',{method:'cooperationBoard',args:[false]},teacher)).status,403);
 assert.equal((await f.request('/api/rpc',{method:'select',args:[studentState.activeId]},other)).status,404);
 await f.rpc(student,'profile','只属于学生的偏好');assert.equal((await f.rpc(other,'state')).personal.profile,'');
 const again=await f.login(users[0]);assert.equal((await f.rpc(again,'state')).personal.profile,'只属于学生的偏好');
 await f.request('/api/logout',{},student);assert.equal((await f.request('/api/state',undefined,student)).status,401);assert.equal((await f.request('/api/state',undefined,again)).status,200);
 assert.ok(!fs.readFileSync(path.join(f.root,'logins.json'),'utf8').includes(users[0].password));
 const html=(await f.request('/',undefined,again)).body;assert.ok(html.includes('web-bridge.js'));assert.ok(html.includes("connect-src 'self'"));
});
test('two accounts share confirmed cooperation, notifications and bilateral contact consent',async t=>{
 const f=await fixture(t),student=await f.login(users[0]),teacher=await f.login(users[1]);
 const draft=await f.rpc(teacher,'prepareCooperation',true,'publish_need',{title:'双机联调项目',summary:'公开测试简介',lookingFor:'感兴趣的同学',offering:'每周讨论',expectations:'每周两小时'});
 assert.equal((await f.rpc(student,'cooperationBoard',false)).needs.length,0);await f.rpc(teacher,'confirmCooperation',true,draft.id);
 let board=await f.rpc(student,'cooperationBoard',false);assert.equal(board.needs.length,1);
 const interest=await f.rpc(student,'prepareCooperation',false,'send_interest',{needId:board.needs[0].id,who:'测试学生',experience:'做过小项目',availability:'每周两小时'});await f.rpc(student,'confirmCooperation',false,interest.id);
 const received=await f.rpc(teacher,'cooperationBoard',true);assert.equal(received.interests.length,1);assert.equal(received.updates.unread,1);
 const id=received.interests[0].id;
 const accept=await f.rpc(teacher,'prepareCooperation',true,'decide_interest',{id,decision:'accepted'});await f.rpc(teacher,'confirmCooperation',true,accept.id);
 board=await f.rpc(student,'cooperationBoard',false);assert.equal(board.interests[0].status,'accepted');assert.ok(board.updates.unread>0);
 const consent=await f.rpc(teacher,'prepareCooperation',true,'consent_contact',{id,contact:'teacher-test-contact'});await f.rpc(teacher,'confirmCooperation',true,consent.id);
 assert.equal((await f.rpc(student,'cooperationBoard',false)).interests[0].otherContact,undefined);
 const studentConsent=await f.rpc(student,'prepareCooperation',false,'consent_contact',{id,contact:'student-test-contact'});await f.rpc(student,'confirmCooperation',false,studentConsent.id);
 assert.equal((await f.rpc(student,'cooperationBoard',false)).interests[0].otherContact,'teacher-test-contact');assert.equal((await f.rpc(teacher,'cooperationBoard',true)).interests[0].otherContact,'student-test-contact');
 await f.rpc(teacher,'markCooperationRead',true,(await f.rpc(teacher,'cooperationBoard',true)).updates.latestSeq);assert.equal((await f.rpc(teacher,'state')).cooperation.teacher.unread,0);
});
test('service restart retains student identity, preferences and teacher ownership',async t=>{
 const f=await fixture(t),student=await f.login(users[0]),teacher=await f.login(users[1]);
 const before=await f.rpc(student,'cooperationBoard',false),teacherBefore=await f.rpc(teacher,'state');
 await f.rpc(student,'profile','跨设备保留');await f.service.close();
 const restarted=createLanServer({root:f.root});await new Promise(r=>restarted.server.listen(0,'127.0.0.1',r));t.after(()=>restarted.close());
 const base=`http://127.0.0.1:${restarted.server.address().port}`;
 async function state(user){const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Xuanhuai-Request':'1'},body:JSON.stringify(user)});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];const response=await fetch(base+'/api/state',{headers:{Cookie:cookie}});return {cookie,state:(await response.json()).state};}
 const after=await state(users[0]);assert.equal(after.state.personal.profile,'跨设备保留');
 const response=await fetch(base+'/api/rpc',{method:'POST',headers:{Cookie:after.cookie,'Content-Type':'application/json','X-Xuanhuai-Request':'1'},body:JSON.stringify({method:'cooperationBoard',args:[false]})});assert.equal((await response.json()).value.memberId,before.memberId);
 assert.equal((await state(users[1])).state.teacherIdentity.id,teacherBefore.teacherIdentity.id);
});
