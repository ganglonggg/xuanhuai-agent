const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {createApp}=require('../server');
const {createDeepSeek}=require('../lib/deepseek');
const {createKnowledge}=require('../lib/knowledge');
const teacher={id:'local-teacher',role:'teacher'};
function fixture(t,extra={}){const root=fs.mkdtempSync(path.join(os.tmpdir(),'xuanhuai-test-'));const app=createApp({root,password:'test-local-password',...extra});t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {...app,root};}
function change(app,id='7',place='卫津路 · 25 楼 C206'){return app.publicService.propose([{id,fields:{place}}],teacher);}
function person(app){const token=app.personalService.createSession();return {token,actor:app.personalService.identify(token)};}
async function listen(t,app){app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>new Promise(resolve=>app.server.close(resolve)));return `http://127.0.0.1:${app.server.address().port}`;}
async function request(base,route,body,token){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};}

test('归档检索能定位真实案例，并提供发布日期和原文',()=>{
 const k=createKnowledge(path.join(__dirname,'../../天津大学宣怀学院公众号资料库/文章'));
 assert.ok(k.count>=61);const results=k.search('商业计划书 200');
 assert.ok(results.slice(0,3).some(a=>a.title.includes('200多遍')));
 assert.ok(results.every(a=>a.date&&a.url.startsWith('http')&&a.excerpts.length));
 assert.equal(k.search('zzzz-nonexistent-9381').length,0);
 assert.ok(k.search('熊德意')[0].title.includes('熊德意'));
});
test('提案不发布；确认后只通知已关注该课程的人，重复确认不重复通知',t=>{
 const app=fixture(t),a=person(app),b=person(app);app.personalService.follow(a.actor,'7');app.personalService.follow(b.actor,'6');
 const old=app.publicService.getCourse('7').place,p=change(app);
 assert.equal(app.publicService.getCourse('7').place,old);assert.equal(app.personalService.state(a.actor).notifications.length,0);
 app.publicService.confirm(p.id,teacher);app.publicService.confirm(p.id,teacher);
 assert.equal(app.publicService.getCourse('7').place,'卫津路 · 25 楼 C206');
 assert.equal(app.personalService.state(a.actor).notifications.length,1);assert.equal(app.personalService.state(b.actor).notifications.length,0);
 assert.equal(app.publicService.changes().length,1);
});
test('旧提案不能覆盖新记录，多课程提案冲突时全部不写入',t=>{
 const app=fixture(t),old=app.publicService.propose([{id:'6',fields:{place:'旧的教室'}},{id:'7',fields:{place:'第二教室'}}],teacher);
 app.publicService.confirm(change(app,'7','最新教室').id,teacher);
 const before=app.publicService.getCourse('6').place;
 assert.throws(()=>app.publicService.confirm(old.id,teacher),{status:409});
 assert.equal(app.publicService.getCourse('6').place,before);assert.equal(app.publicService.getCourse('7').place,'最新教室');
});
test('订阅与通知游标重启后保留，后来关注不回放旧通知，取消后不再收到',t=>{
 const app=fixture(t),a=person(app);app.publicService.confirm(change(app).id,teacher);app.personalService.follow(a.actor,'7');
 assert.equal(app.personalService.state(a.actor).notifications.length,0);
 app.publicService.confirm(change(app,'7','第三教室').id,teacher);
 const restarted=createApp({root:app.root,password:'test'});const actor=restarted.personalService.identify(a.token);
 assert.equal(restarted.personalService.state(actor).unread,1);restarted.personalService.markRead(actor,2);assert.equal(restarted.personalService.state(actor).unread,0);
 restarted.personalService.unfollow(actor,'7');restarted.publicService.confirm(change(restarted,'7','第四教室').id,teacher);assert.equal(restarted.personalService.state(actor).notifications.length,0);
});
test('权限隔离：公共结果不包含老师原始材料、提案或个人偏好',async t=>{
 const app=fixture(t),base=await listen(t,app),a=person(app),b=person(app);app.personalService.profile(a.actor,'个人秘密偏好');change(app);
 const publicResult=await request(base,'/api/public');assert.equal(publicResult.status,200);const serialized=JSON.stringify(publicResult.body);
 for(const forbidden of ['个人秘密偏好','proposals','contexts'])assert.ok(!serialized.includes(forbidden));
 assert.equal((await request(base,'/api/proposals/confirm',{id:'x'},a.token)).status,401);
 assert.equal((await request(base,'/api/personal')).status,401);
 assert.equal((await request(base,'/api/personal',undefined,b.token)).body.profile,'');
 const badOrigin=await fetch(base+'/api/session',{method:'POST',headers:{Origin:'https://untrusted.example'}});assert.equal(badOrigin.status,403);
 const badHost=await new Promise((resolve,reject)=>{require('node:http').get(base+'/api/public',{headers:{Host:'untrusted.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(badHost,403);
});
test('DeepSeek agent 执行检索并返回待确认操作，不擅自写入订阅',async t=>{
 let round=0;
 const deepseek={enabled:true,model:'mock',async complete(messages,extra){
  assert.ok(!extra.tools.some(t=>t.function.name==='confirm_course_change'));
  if(round++===0)return {tool_calls:[{id:'c0',type:'function',function:{name:'list_courses',arguments:'{"query":"科创领导力"}'}},{id:'c1',type:'function',function:{name:'search_knowledge',arguments:JSON.stringify({query:'科创领导力'})}},{id:'c2',type:'function',function:{name:'prepare_follow_course',arguments:JSON.stringify({id:'7',follow:true})}}]};
  assert.equal(messages.filter(m=>m.role==='tool').length,3);return {content:'找到了课程资料。请点击按钮确认关注。'};
 }};
 const app=fixture(t,{deepseek}),a=person(app);const result=await app.agent.ask('了解并关注科创领导力',[],a.actor);
 assert.ok(result.sources.length);assert.equal(result.actions[0].type,'follow');assert.equal(result.trace.length,3);assert.equal(app.personalService.state(a.actor).subscriptions.length,0);
 app.tools.execute('follow_course',{id:result.actions[0].id},a.actor);assert.equal(app.personalService.state(a.actor).subscriptions.length,1);
});
test('即使模型请求写工具，也不能绕过聊天权限发布修改',async t=>{
 let round=0;const deepseek={enabled:true,model:'mock',async complete(){return round++===0?{tool_calls:[{id:'attack',type:'function',function:{name:'confirm_course_change',arguments:'{"proposalId":"anything"}'}}]}:{content:'无法执行。'};}};
 const app=fixture(t,{deepseek}),a=person(app);const r=await app.agent.ask('查询课程',[],a.actor);assert.equal(r.trace[0].ok,false);assert.equal(app.publicService.changes().length,0);
});
test('AI 修改必须有逐字原文证据，合法提案仍需教师确认',async t=>{
 const context='2026 年 11 月 10 日科创领导力的地点改到 C206';
 let quote='凭空捏造';const deepseek={enabled:true,model:'mock',async complete(){return {content:JSON.stringify({updates:[{id:'7',fields:{place:{value:'C206',quote}}}],questions:[]})};}};
 const app=fixture(t,{deepseek});await assert.rejects(()=>app.agent.proposeFromText(context,teacher),{status:400});
 quote='地点改到 C206';const result=await app.agent.proposeFromText(context,teacher);assert.equal(result.proposal.state,'pending');assert.notEqual(app.publicService.getCourse('7').place,'C206');
 app.publicService.confirm(result.proposal.id,teacher);assert.equal(app.publicService.getCourse('7').place,'C206');
});
test('DeepSeek 请求使用官方工具调用格式，未配置 Key 时明确报错',async()=>{
 await assert.rejects(()=>createDeepSeek().complete([]),{status:503});let payload;
 const ds=createDeepSeek({apiKey:'sk-test',provider:'deepseek',model:'deepseek-flash',fetchImpl:async(url,options)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'成功'}}]})};}});
 await ds.complete([{role:'user',content:'你好'}],{tools:[]});assert.equal(payload.model,'deepseek-flash');assert.deepEqual(payload.thinking,{type:'disabled'});
});
test('HTTP 两个入口复用工具：外部订阅可收到网页教师发布的变化',async t=>{
 const app=fixture(t),base=await listen(t,app),a=person(app);
 const login=await request(base,'/api/login',{password:'test-local-password'});const teacherToken=login.body.token;
 assert.equal((await request(base,'/api/tools/call',{name:'follow_course',arguments:{id:'7'}},a.token)).status,200);
 const p=await request(base,'/api/proposals',{updates:[{id:'7',fields:{place:'联调教室'}}]},teacherToken);
 assert.equal((await request(base,'/api/tools/call',{name:'get_my_updates'},a.token)).body.result.notifications.length,0);
 await request(base,'/api/proposals/confirm',{id:p.body.proposal.id},teacherToken);
 assert.equal((await request(base,'/api/tools/call',{name:'get_my_updates'},a.token)).body.result.notifications[0].after.place,'联调教室');
});
test('SiliconFlow 使用自己的端点和关闭推理参数',async()=>{
 let payload;const ds=createDeepSeek({apiKey:'sk-test',provider:'siliconflow',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.siliconflow.cn/v1/chat/completions');payload=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'成功'}}]})};
 }});await ds.complete([{role:'user',content:'你好'}]);assert.equal(payload.model,'deepseek-ai/DeepSeek-V4-Flash');assert.equal(payload.enable_thinking,false);assert.equal(payload.thinking,undefined);
});
test('模型只口头承诺关注时补全真实确认动作',async t=>{
 let round=0;const deepseek={enabled:true,model:'mock',async complete(messages,extra){
  round++;
  if(round===1)return {tool_calls:[{id:'find',type:'function',function:{name:'list_courses',arguments:'{"query":"科创领导力"}'}}]};
  if(round===2)return {content:'请点击下方按钮确认关注。'};
  if(round===3){assert.equal(extra.tool_choice.function.name,'prepare_follow_course');return {tool_calls:[{id:'prepare',type:'function',function:{name:'prepare_follow_course',arguments:'{"id":"7","follow":true}'}}]};}
  return {content:'已准备好，点击确认。'};
 }};const app=fixture(t,{deepseek}),a=person(app);const result=await app.agent.ask('帮我关注科创领导力',[],a.actor);assert.equal(result.actions.length,1);assert.equal(app.personalService.state(a.actor).subscriptions.length,0);
});
test('MCP stdio 客户端握手、列工具、搜索真实资料与错误处理',async t=>{
 const app=fixture(t),base=await listen(t,app);
 const child=spawn(process.execPath,[path.join(__dirname,'../mcp.js')],{env:{...process.env,XUANHUAI_URL:base,XUANHUAI_TOKEN:''},stdio:['pipe','pipe','pipe']});
 t.after(()=>child.kill());let output='';child.stdout.on('data',d=>output+=d);
 const requests=[{id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{id:2,method:'tools/list'},{id:3,method:'tools/call',params:{name:'search_knowledge',arguments:{query:'熊德意'}}},{id:4,method:'tools/call',params:{name:'follow_course',arguments:{id:'7'}}}];
 for(const r of requests)child.stdin.write(JSON.stringify({jsonrpc:'2.0',...r})+'\n');
 child.stdin.end();await once(child,'exit');const responses=output.trim().split('\n').map(JSON.parse);
 assert.equal(responses.length,4);assert.equal(responses.find(r=>r.id===1).result.protocolVersion,'2024-11-05');
 assert.ok(responses.find(r=>r.id===2).result.tools.some(t=>t.name==='search_knowledge'));
 assert.ok(responses.find(r=>r.id===3).result.content[0].text.includes('熊德意'));assert.equal(responses.find(r=>r.id===4).result.isError,true);
});
