const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {createRuntime} = require('../runtime');
const appRoot = path.resolve(__dirname, '..');
const coreDir = path.resolve(appRoot, '../信息层/xuanhuai-platform');
const {store, fail, str, hash} = require(path.join(coreDir, 'lib/storage'));
const {createApp} = require(path.join(coreDir, 'server'));
const articleDir = path.resolve(coreDir, '../天津大学宣怀学院公众号资料库/文章');
const defaultRoot = path.join(os.homedir(), 'Library/Application Support/XuanhuaiAgent-LAN-Test');
const publicDir = path.join(__dirname, 'public');
const commonMethods = new Set(['ventureLearningControl','cooperationLearningControl','evolve','rollback','state','newConversation','select','send','stop','confirmAction','configure','profile','markRead','unfollow','remember','forget','feedback','recommendations','registerGap','cooperationBoard','prepareCooperation','confirmCooperation','discardCooperation','markCooperationRead','exportText']);
const teacherMethods = new Set(['receiveQuestions','answerGap']);
const cooperationMethods = new Set(['cooperationBoard','prepareCooperation','confirmCooperation','discardCooperation','markCooperationRead']);
const lifetime = 8 * 3600000;

function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return {salt, hash:crypto.scryptSync(password,salt,64).toString('hex')};
}
function passwordMatches(password, record) {
  return typeof password === 'string' && password.length <= 300 && crypto.timingSafeEqual(crypto.scryptSync(password,record.salt,64),Buffer.from(record.hash,'hex'));
}
function provision(root=defaultRoot, inputs) {
  const db = store(path.join(root,'logins.json'),{users:[]});
  if(db.read().users.length) return {created:false};
  const credentials = inputs || [
    {username:'student_test',name:'测试学生',role:'student',password:'Stu-'+crypto.randomBytes(9).toString('base64url')},
    {username:'teacher_test',name:'测试教师',role:'teacher',password:'Tea-'+crypto.randomBytes(9).toString('base64url')},
  ];
  const core = createApp({root:path.join(root,'shared'),personalRoot:path.join(root,'provisioning'),articleDir});
  const users = credentials.map(input => {
    if(!['student','teacher'].includes(input.role)) throw Error('无效身份');
    if(input.role==='teacher') core.accounts.create({id:'local-teacher',role:'teacher',isAdmin:true},input);
    return {id:crypto.randomUUID(),username:input.username,name:input.name,role:input.role,password:passwordRecord(input.password)};
  });
  db.write({users});
  const credentialFile=path.join(root,'测试账号.json');
  fs.writeFileSync(credentialFile,JSON.stringify(credentials,null,2),{mode:0o600});
  return {created:true,credentialFile};
}

function createLanServer({root=defaultRoot,host='127.0.0.1',deepseekFactory,apiKey=''}={}) {
  const accounts=store(path.join(root,'logins.json'),{users:[]});
  const runtimes=new Map(),sessions=new Map(),attempts=new Map();
  const dummy=passwordRecord(crypto.randomBytes(24).toString('hex'));
  const allowedHosts=new Set(host==='127.0.0.1'?['127.0.0.1','localhost']:[host]);
  function runtimeFor(user,password) {
    let runtime=runtimes.get(user.id);
    if(!runtime) {
      runtime=createRuntime({coreDir,articleDir,userData:path.join(root,'members',user.id),sharedDataRoot:path.join(root,'shared'),deepseekFactory,apiKey});
      runtimes.set(user.id,runtime);
    }
    if(user.role==='teacher')runtime.loginTeacher(user.username,password);
    return runtime;
  }
  function snapshot(session) {
    const state=session.runtime.snapshot();
    if(session.user.role==='teacher'&&!state.teacherEnabled)fail('教师会话已过期，请重新登录',401);
    return {...state,webSession:{username:session.user.username,name:session.user.name,role:session.user.role},gateway:{port:null,error:''}};
  }
  function getSession(req) {
    const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('xh_lan='))?.slice(7)||'';
    const key=hash(token),session=sessions.get(key);
    if(!session||session.expires<=Date.now()){sessions.delete(key);fail('请先登录测试账号',401);}
    return {...session,key};
  }
  function json(res,status,value,headers={}) {
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));
  }
  async function body(req) {
    if(!req.headers['content-type']?.startsWith('application/json')||req.headers['x-xuanhuai-request']!=='1')fail('请求格式不正确',403);
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>100000)fail('请求内容过大',413);chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail('无效 JSON');}
  }
  function file(res,file,type) {
    const policy="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':policy,'Referrer-Policy':'no-referrer'});
    res.end(fs.readFileSync(file));
  }
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(!allowedHosts.has(url.hostname)||url.port!==String(server.address().port))fail('访问地址不正确',403);
      if(req.headers.origin&&req.headers.origin!==url.origin)fail('不允许跨站请求',403);
      const route=url.pathname;
      if(req.method==='GET') {
        const publicFiles={'/login':['login.html','text/html'],'/login.js':['login.js','text/javascript'],'/web.css':['web.css','text/css'],'/style.css':[path.join(appRoot,'ui/style.css'),'text/css']};
        if(publicFiles[route]){const [name,type]=publicFiles[route];return file(res,path.isAbsolute(name)?name:path.join(publicDir,name),type+'; charset=utf-8');}
        let session;
        try{session=getSession(req);}catch(error){if(route==='/'){res.writeHead(302,{Location:'/login'});return res.end();}throw error;}
        if(route==='/api/state')return json(res,200,{state:snapshot(session)});
        const assets={'/renderer.js':'renderer.js','/cooperation.js':'cooperation.js','/accounts.js':'accounts.js'};
        if(assets[route])return file(res,path.join(appRoot,'ui',assets[route]),'text/javascript; charset=utf-8');
        if(route==='/web-bridge.js'||route==='/web-ui.js')return file(res,path.join(publicDir,route.slice(1)),'text/javascript; charset=utf-8');
        if(route==='/') {
          const html=fs.readFileSync(path.join(appRoot,'ui/index.html'),'utf8')
            .replace("connect-src 'none'","connect-src 'self'")
            .replace('</head>','<link rel="stylesheet" href="web.css"></head>')
            .replace('<script src="renderer.js">','<script src="web-bridge.js"></script><script src="renderer.js">')
            .replace('</body>','<script src="web-ui.js"></script></body>')
            .replace('会话保存在这台 Mac','局域网测试 · 数据保存在服务电脑');
          res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});return res.end(html);
        }
      }
      if(req.method==='POST') {
        const input=await body(req);
        if(route==='/api/login') {
          const ip=req.socket.remoteAddress,now=Date.now();
          let attempt=attempts.get(ip);if(!attempt||attempt.until<now){attempt={count:0,until:now+60000};attempts.set(ip,attempt);}
          if(attempt.count>=10)fail('尝试次数过多，请一分钟后重试',429);
          attempt.count++;
          const user=accounts.read().users.find(u=>u.username===input.username);
          const valid=passwordMatches(input.password,user?.password||dummy);
          if(!user||!valid)fail('账号或密码不正确',401);
          const runtime=runtimeFor(user,input.password),token=crypto.randomBytes(32).toString('hex');
          const {password,...identity}=user;
          sessions.set(hash(token),{user:identity,runtime,expires:now+lifetime});
          attempt.count=0;
          return json(res,200,{ok:true,user:identity},{'Set-Cookie':`xh_lan=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime/1000}`});
        }
        const session=getSession(req);
        if(route==='/api/logout') {sessions.delete(session.key);return json(res,200,{ok:true},{'Set-Cookie':'xh_lan=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
        if(route==='/api/rpc') {
          snapshot(session);
          const method=str(input.method,'操作',60),args=input.args||[];
          if(!Array.isArray(args)||args.length>8)fail('参数无效');
          if(!commonMethods.has(method)&&!(session.user.role==='teacher'&&teacherMethods.has(method)))fail('当前账号没有该权限',403);
          if(cooperationMethods.has(method)&&args[0]!== (session.user.role==='teacher'))fail('不能切换为其他身份',403);
          if(method==='send'&&session.user.role==='student'&&args[2]&&!['chat','venture'].includes(args[2]))fail('学生不能执行教师任务',403);
          const value=method==='state'?snapshot(session):await session.runtime[method](...args);
          if(method==='cooperationBoard')value.notice='局域网测试版 · 本服务内的学生与教师共享项目和合作进度。';
          return json(res,200,{value,state:snapshot(session)});
        }
      }
      fail('页面不存在',404);
    }catch(error){json(res,error.status||500,{error:error.status?error.message:'服务处理失败，请重试'});}
  });
  const timer=setInterval(()=>{
    for(const [key,session] of sessions)if(session.expires<=Date.now())sessions.delete(key);
    for(const [ip,attempt] of attempts)if(attempt.until<Date.now())attempts.delete(ip);
    for(const runtime of runtimes.values())try{runtime.poll();}catch(error){console.error('轮询失败：',error.message);}
  },2000);timer.unref();
  return {server,runtimes,async close(){clearInterval(timer);server.closeAllConnections();if(server.listening)await new Promise(r=>server.close(r));for(const runtime of runtimes.values())await runtime.dispose();}};
}
if(require.main===module) {
  const root=process.env.XUANHUAI_LAN_DATA||defaultRoot,host=process.env.XUANHUAI_LAN_HOST||'127.0.0.1',port=Number(process.env.XUANHUAI_LAN_PORT||3218);
  provision(root);
  const service=createLanServer({root,host,apiKey:process.env.SILICONFLOW_API_KEY||''});
  delete process.env.SILICONFLOW_API_KEY;
  service.server.listen(port,host,()=>console.log(`局域网测试服务：http://${host}:${port}\n数据目录：${root}`));
  service.server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>service.close().then(()=>process.exit()));
}
module.exports={createLanServer,provision,defaultRoot};
