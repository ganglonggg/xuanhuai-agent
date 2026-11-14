const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { store, fail, str } = require('./lib/storage');
const { createKnowledge } = require('./lib/knowledge');
const { createPublicService } = require('./lib/public-service');
const { createPersonalService } = require('./lib/personal-service');
const { createTools } = require('./lib/tools');
const { createDeepSeek } = require('./lib/deepseek');
const { createAgent } = require('./lib/agent');

function createApp(options={}) {
  const root=options.root||process.env.XUANHUAI_DATA_DIR||__dirname;
  const seed=JSON.parse(fs.readFileSync(path.join(__dirname,'seed.json'),'utf8'));
  const db=store(path.join(root,'data.json'),seed);
  const original=db.read();
  if(original.schemaVersion!==2){const dir=path.join(root,'backups');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(path.join(root,'data.json'),path.join(dir,`data.before-weeks.${Date.now()}.json`));db.write(require('./lib/schedule').migrate(original));}
  const personalDb=store(path.join(options.personalRoot||root,'personal.json'),{users:{}});
  const knowledge=createKnowledge(options.articleDir||path.join(__dirname,'../天津大学宣怀学院公众号资料库/文章'));
  const publicService=createPublicService(db,knowledge);
  const personalService=createPersonalService(personalDb,publicService);
  const oldPersonal=personalDb.read();
  if(Object.keys(oldPersonal.users).length){const file=path.join(options.personalRoot||root,'personal.json');const dir=path.join(root,'backups');fs.mkdirSync(dir,{recursive:true});let dirty=false;for(const u of Object.values(oldPersonal.users)){const grouped=new Map();for(const sub of u.subscriptions){const id=publicService.stableId(sub.courseId),prev=grouped.get(id);grouped.set(id,{...sub,courseId:id,afterSeq:Math.min(prev?.afterSeq??Infinity,sub.afterSeq)});}const subs=[...grouped.values()];if(JSON.stringify(subs)!==JSON.stringify(u.subscriptions)){dirty=true;u.subscriptions=subs;}}if(dirty){fs.copyFileSync(file,path.join(dir,`personal.before-weeks.${Date.now()}.json`));personalDb.write(oldPersonal);}}
  const cooperation=require('./lib/cooperation').createCooperation(store(path.join(root,'cooperation.json'),{needs:[],interests:[],drafts:[]}));
  
  const deepseek=options.deepseek||createDeepSeek({apiKey:process.env.SILICONFLOW_API_KEY||process.env.DEEPSEEK_API_KEY||''});
  let password=options.password;
  if(!password){
    const file=path.join(root,'.local-admin');
    if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(12).toString('base64url'),{mode:0o600});
    password=fs.readFileSync(file,'utf8').trim();
  }
  const accounts=require('./lib/accounts').createAccounts(store(path.join(root,'accounts.json'),{teachers:[]}),password,publicService);
  const tools=createTools(publicService,personalService,cooperation,accounts);
  const agent=createAgent(deepseek,tools,publicService,personalService,{ventureDb:store(path.join(options.personalRoot||root,'venture-learning.json'),{users:{}})});
  const busy=new Set();
  let loginFailures=0,loginReset=0;
  function identify(req){
    const token=(req.headers.authorization||'').replace(/^Bearer /,'');
    return accounts.identify(token)||personalService.identify(token);
  }
  function teacher(actor){if(actor?.role!=='teacher')fail('请先登录教师工作台',401);}
  function student(actor){if(actor?.role!=='student')fail('需要个人会话，请刷新页面',401);}
  async function withAI(actor,fn){
    if(busy.has(actor.id))fail('上一条请求仍在处理中，请稍候',429);
    if(busy.size>=6)fail('当前请求较多，请稍后重试',429);
    busy.add(actor.id);try{return await fn()}finally{busy.delete(actor.id);}
  }
  function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
  async function body(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>100000)fail('请求内容过大',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{fail('请求必须是有效 JSON');}}
  const server=http.createServer(async(req,res)=>{
    try{
      const host=req.headers.host||'';
      if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))fail('仅允许本机访问',403);
      const url=new URL(req.url,`http://${host}`);
      if(req.headers.origin&&req.headers.origin!==url.origin)fail('不允许跨站请求',403);
      const actor=identify(req),route=url.pathname;
      if(req.method==='GET'){
        if(route==='/api/config')return send(res,200,{ai:deepseek.enabled,model:deepseek.model,provider:deepseek.provider,articles:knowledge.count,teacher:true,localOnly:true});
        if(route==='/api/courses')return send(res,200,publicService.listCourses(url.searchParams.get('query')||'',actor,{start:url.searchParams.get('start')||undefined}));
        if(route==='/api/knowledge')return send(res,200,{results:knowledge.search(url.searchParams.get('q'))});
        if(route==='/api/personal'){student(actor);return send(res,200,personalService.state(actor));}
        if(route==='/api/me')return send(res,200,{actor});
        if(route==='/api/week-summary')return send(res,200,publicService.summary(actor));
        if(route==='/api/teacher/catalog')return send(res,200,publicService.catalog(actor));
        if(route==='/api/teacher/draft')return send(res,200,publicService.getDraft(url.searchParams.get('start'),actor));
        if(route==='/api/admin/teachers')return send(res,200,accounts.list(actor));
        if(route==='/api/tools')return send(res,200,{tools:tools.list(actor)});
        if(route==='/api/public')return send(res,200,{...publicService.listCourses('',actor),articles:knowledge.cards(),changes:publicService.changes(0,actor)});
        if(route==='/agent-guide'){
          res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'AGENT-GUIDE.md'),'utf8'));
        }
        const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
        if(files[route]&&options.serveUI!==false){
          res.writeHead(200,{'Content-Type':route.endsWith('.js')?'text/javascript; charset=utf-8':route.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
          return res.end(fs.readFileSync(path.join(__dirname,'public',files[route])));
        }
      }
      if(req.method==='POST'){
        const b=await body(req);
        if(route==='/api/session')return send(res,200,{token:personalService.createSession()});
        if(route==='/api/login'){
          if(Date.now()>loginReset){loginFailures=0;loginReset=Date.now()+60000;}
          if(loginFailures>=10)fail('登录尝试过多，请一分钟后重试',429);
          try{return send(res,200,accounts.login(b.username||'admin',b.password));}catch(e){loginFailures++;throw e;}
        }
        if(route==='/api/logout')return send(res,200,accounts.logout((req.headers.authorization||'').replace(/^Bearer /,'')));
        if(route==='/api/admin/teachers')return send(res,200,accounts.create(actor,b));
        if(route==='/api/admin/reset')return send(res,200,accounts.reset(actor,b.id,b.password));
        if(route==='/api/admin/assign')return send(res,200,accounts.assign(actor,b.courseId,b.teacherId));
        if(route==='/api/tools/call')return send(res,200,{result:tools.execute(str(b.name,'工具名',100),b.arguments||{},actor)});
        if(route==='/api/ask'){student(actor);return send(res,200,await withAI(actor,()=>agent.ask(b.question,b.history,actor)));}
        if(route==='/api/personal/profile'){student(actor);return send(res,200,personalService.profile(actor,b.profile));}
        if(route==='/api/personal/read'){student(actor);return send(res,200,personalService.markRead(actor,b.seq));}
        if(route==='/api/personal/follow'){student(actor);return send(res,200,personalService.follow(actor,b.id));}
        if(route==='/api/personal/unfollow'){student(actor);return send(res,200,personalService.unfollow(actor,b.id));}
        if(route==='/api/config/key'){teacher(actor);return send(res,200,deepseek.configure(b.key));}
        if(route==='/api/config/test'){teacher(actor);const m=await withAI(actor,()=>deepseek.complete([{role:'user',content:'只回复：连接成功'}],{max_tokens:20}));return send(res,200,{ok:true,model:deepseek.model,message:m.content});}
        if(route==='/api/ai'){teacher(actor);return send(res,200,await withAI(actor,()=>agent.proposeFromText(b.context,actor)));}
        if(route==='/api/proposals'){teacher(actor);return send(res,200,{proposal:publicService.propose(b.updates,actor)});}
        if(route==='/api/proposals/confirm'){teacher(actor);return send(res,200,publicService.confirm(b.id,actor));}
      }
      fail('接口不存在',404);
    }catch(e){send(res,e.status||500,{error:e.status?e.message:'服务出错，请稍后重试'});}
  });
  return {accounts,server,publicService,personalService,cooperation,tools,agent,deepseek};
}
if(require.main===module){const port=Number(process.env.PORT||3210);createApp().server.listen(port,'127.0.0.1',()=>{console.log(`宣怀 agent：http://127.0.0.1:${port}`);console.log('管理员口令保存在数据目录 .local-admin；教师使用管理员创建的独立账号。');});}
module.exports={createApp};
