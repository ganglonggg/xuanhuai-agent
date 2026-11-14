const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');

function createRuntime({coreDir,articleDir,userData,sharedDataRoot,apiKey='',deepseekFactory}={}) {
  const {store,fail,str}=require(path.join(coreDir,'lib/storage'));
  const {createDeepSeek}=require(path.join(coreDir,'lib/deepseek'));
  const {createApp}=require(path.join(coreDir,'server'));
  const emitter=new EventEmitter();
  const privateRoot=path.join(userData,'private'), sharedRoot=sharedDataRoot||path.join(userData,'shared');
  fs.mkdirSync(privateRoot,{recursive:true,mode:0o700});fs.mkdirSync(sharedRoot,{recursive:true,mode:0o700});
  const disk=store(path.join(privateRoot,'client.json'),{version:1,conversations:[],activeId:null,model:'deepseek-ai/DeepSeek-V4-Flash',deliveredSeq:0});
  const state=disk.read();let currentKey=apiKey,teacherEnabled=false,work=null,port=null,gatewayError='',lastGapProgress=null,lastCooperationProgress=null;
  const makeModel=deepseekFactory||createDeepSeek;
  let model=makeModel({apiKey:currentKey,provider:'siliconflow',model:state.model});
  const facade={complete:(...args)=>model.complete(...args),configure:key=>model.configure(key),get enabled(){return model.enabled},get model(){return model.model},get provider(){return 'siliconflow'}};
  const core=createApp({root:sharedRoot,personalRoot:privateRoot,articleDir,deepseek:facade,serveUI:false});
  if(!state.token||!core.personalService.identify(state.token))state.token=core.personalService.createSession();
  const actor=core.personalService.identify(state.token);
  let teacher=null,teacherToken=null;
  function refreshTeacher(){
    if(teacherToken){const current=core.accounts.identify(teacherToken);if(!current){teacherToken=null;teacher=null;teacherEnabled=false;if(work?.teacherId)work.controller.abort();}else teacher=current;}
    return teacher;
  }
  function requireTeacher(){if(!refreshTeacher())fail('请先登录教师账号，或重新登录已失效的会话',401);return teacher;}
  function scope(){return refreshTeacher()?`teacher:${teacher.id}`:'personal';}
  for(const c of state.conversations)if(!c.ownerScope)c.ownerScope=c.messages.some(m=>['teacher','cooperationTeacher'].includes(m.kind)||(m.actions||[]).some(a=>a.asTeacher||a.type==='publish'))?'teacher:local-teacher':'personal';
  function ensureActive(){const ownerScope=scope();if(state.conversations.some(c=>c.id===state.activeId&&c.ownerScope===ownerScope))return;let c=state.conversations.find(c=>c.ownerScope===ownerScope);if(!c){c={id:crypto.randomUUID(),ownerScope,title:'新的对话',created:new Date().toISOString(),messages:[]};state.conversations.unshift(c);}state.activeId=c.id;}
  function chatActor(){
    if(!refreshTeacher())return actor;
    state.teacherPersonalTokens||={};let token=state.teacherPersonalTokens[teacher.id];
    if(!token||!core.personalService.identify(token)){token=core.personalService.createSession();state.teacherPersonalTokens[teacher.id]=token;save();}
    return core.personalService.identify(token);
  }
  for(const c of state.conversations)for(const m of c.messages)if(m.status==='running'){m.status='stopped';m.content='上次任务因客户端退出而中断，可以重新发送。';}
  function save(){disk.write(state);}
  function snapshot(){ensureActive();const personal=core.personalService.state(actor);personal.subscriptions=personal.subscriptions.map(s=>({...s,title:core.publicService.getCourse(s.courseId).title}));return {
    conversations:state.conversations.filter(c=>c.ownerScope===scope()),activeId:state.activeId,busyId:work?.conversationId||null,
    model:facade.model,configured:facade.enabled,teacherEnabled,teacherIdentity:teacher?{id:teacher.id,name:teacher.name,isAdmin:!!teacher.isAdmin}:null,articles:core.publicService.knowledge.count,
    cooperation:{student:core.cooperation.updates(actor),teacher:teacherEnabled?core.cooperation.updates(teacher):null},
    ventureLearning:core.agent.ventureLearning?.state(actor),personal,learning:core.personalService.learning.state(actor),pendingQuestions:teacherEnabled?core.publicService.pendingGaps(teacher):[],gateway:{port,error:gatewayError},
  };}
  function emit(){save();emitter.emit('state',snapshot());}
  function find(id){const c=state.conversations.find(c=>c.id===id&&c.ownerScope===scope());if(!c)fail('对话不存在或不属于当前身份',404);return c;}
  function newConversation(){const c={id:crypto.randomUUID(),ownerScope:scope(),title:'新的对话',created:new Date().toISOString(),messages:[]};state.conversations.unshift(c);state.activeId=c.id;emit();return c.id;}
  if(!state.conversations.length)newConversation();else save();
  function select(id){find(id);state.activeId=id;emit();}
  async function send(id,question,kind='chat'){
    if(work)fail('当前任务还在进行，请先停止或等待完成');
    str(question,'任务',kind==='teacher'?12000:2000);if(!['chat','teacher','cooperationTeacher','venture'].includes(kind))fail('未知任务类型');
    if(['teacher','cooperationTeacher'].includes(kind))requireTeacher();
    if(kind==='chat'&&/我(?:想|要|打算|计划)(?:做|开发|创办|创业|打造)|帮我(?:推进|规划).{0,12}(?:创业|项目)/.test(question))kind='venture';
    const c=find(id),history=c.messages.filter(m=>m.status==='done'&&['user','assistant'].includes(m.role)).map(m=>({role:m.role,content:m.content}));
    if(!c.messages.length)c.title=question.slice(0,24);
    const user={id:crypto.randomUUID(),role:'user',content:question,status:'done',kind};
    const reply={id:crypto.randomUUID(),role:'assistant',content:'',status:'running',steps:[],actions:[],sources:[]};
    c.messages.push(user,reply);state.activeId=id;
    const controller=new AbortController();const initiatingTeacher=refreshTeacher();work={conversationId:id,controller,teacherId:initiatingTeacher?.id};emit();
    try{
      const execution={cooperationActor:kind==='cooperationTeacher'?requireTeacher():actor,client:'desktop',signal:controller.signal,onEvent:event=>{if(event.type==='tool')reply.steps.push({tool:event.tool,status:'running'});if(event.type==='tool-done'){const step=reply.steps.findLast(s=>s.tool===event.tool&&s.status==='running');if(step)step.status=event.ok?'done':'failed';}if(event.type==='thinking')reply.phase=event.round?'整理查到的内容':'理解任务';emit();}};
      if(kind==='venture'){
        const result=await core.agent.venture(question,initiatingTeacher?chatActor():actor,execution);
        reply.content=result.answer;reply.sources=result.sources;reply.venture=result.report;
      }else if(kind==='teacher'){
        reply.phase='整理课程变化';emit();const result=await core.agent.proposeFromText(question,teacher,execution);
        reply.content=result.proposal?'已整理好修改内容。请核对下方差异，确认后才会发布。':'需要补充信息：'+result.questions.join('；');
        if(result.questions?.length&&result.proposal)reply.content+='\n需要补充：'+result.questions.join('；');
        if(result.proposal)reply.actions=[{id:crypto.randomUUID(),type:'publish',proposalId:result.proposal.id,proposal:result.proposal,status:'pending'}];
      }else{
        const result=await core.agent.ask(question,history,initiatingTeacher?chatActor():actor,execution);reply.content=result.answer;reply.sources=result.sources;
        reply.actions=result.actions.map(a=>({...a,teacherId:initiatingTeacher?.id,courseId:a.id,id:crypto.randomUUID(),status:'pending'}));
      }
      reply.status='done';
    }catch(error){reply.status=controller.signal.aborted?'stopped':'failed';reply.content=controller.signal.aborted?'已停止本次任务。':error.message;for(const s of reply.steps)if(s.status==='running')s.status=reply.status;}
    finally{work=null;emit();}
    return snapshot();
  }
  function stop(){work?.controller.abort();return {stopping:Boolean(work)};}
  function confirmAction(conversationId,messageId,actionId){
    const c=find(conversationId),message=c.messages.find(m=>m.id===messageId),action=message?.actions.find(a=>a.id===actionId);
    if(!action)fail('操作不存在');if(action.status==='done')return snapshot();
    if(message.status!=='done')fail('请等待本次任务结束后再确认');
    if(action.teacherId&&requireTeacher().id!==action.teacherId)fail('这张卡片属于另一位老师',403);
    if(action.type==='cooperation')core.cooperation.confirm(cooperationActor(action.asTeacher),action.draft.id);
    else if(action.type==='memory')core.personalService.learning.remember(chatActor(),action.memory);
    else if(action.type==='follow')core.personalService.follow(actor,action.courseId);
    else if(action.type==='unfollow')core.personalService.unfollow(actor,action.courseId);
    else if(action.type==='publish'){requireTeacher();core.publicService.confirm(action.proposalId,teacher);}
    else fail('不支持的操作');
    action.status='done';action.completed=new Date().toISOString();emit();return snapshot();
  }
  async function configure({key,model:chosenModel}){
    if(work)fail('请先停止当前任务再修改连接');
    const name=str(chosenModel||state.model,'模型',150);
    if(!/^(?:Pro\/)?deepseek-ai\/DeepSeek-[A-Za-z0-9.\-]+$/.test(name))fail('请选择受支持的 DeepSeek 模型');
    const nextKey=key?str(key,'API Key',300):currentKey;if(!nextKey)fail('请填写 SiliconFlow API Key');
    const candidate=makeModel({apiKey:nextKey,provider:'siliconflow',model:name});
    await candidate.complete([{role:'user',content:'只回复：连接成功'}],{max_tokens:20});
    currentKey=nextKey;model=candidate;state.model=name;emit();return {connected:true};
  }
  function loginTeacher(username,password){
    if(work)fail('请先停止当前任务再切换身份');
    const session=core.accounts.login(username,password);
    if(teacherToken)core.accounts.logout(teacherToken);
    teacherToken=session.token;teacher=session.actor;teacherEnabled=true;ensureActive();emit();return snapshot();
  }
  function unlock(password){return loginTeacher('admin',password);}
  function lock(){if(work?.teacherId)work.controller.abort();if(teacherToken)core.accounts.logout(teacherToken);teacherToken=null;teacher=null;teacherEnabled=false;ensureActive();emit();}
  function teacherAccounts(){return core.accounts.list(requireTeacher());}
  function createTeacherAccount(input){const result=core.accounts.create(requireTeacher(),input);emit();return result;}
  function resetTeacherPassword(id,password){const result=core.accounts.reset(requireTeacher(),id,password);emit();return result;}

  function profile(value){core.personalService.profile(actor,value);emit();}
  function markRead(){const personal=core.personalService.state(actor);core.personalService.markRead(actor,Math.max(0,...personal.notifications.map(x=>x.seq)));core.personalService.learning.markRead(actor);emit();}
  function unfollow(id){core.personalService.unfollow(actor,id);emit();}
  function remember(input){const result=core.personalService.learning.remember(actor,input);emit();return result;}
  function forget(id){core.personalService.learning.forget(actor,id);emit();}
  function feedback(id,choice){core.personalService.learning.feedback(actor,id,choice);emit();}
  function recommendations(preview=false,start){
    if(typeof preview!=='boolean')fail('预览参数无效');
    const options={preview,start};if(preview)options.start=core.publicService.listCourses().week.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    return core.personalService.learning.recommend(actor,options);
  }
  function cooperationActor(asTeacher=false){
    if(typeof asTeacher!=='boolean')fail('身份参数无效');
    return asTeacher?requireTeacher():actor;
  }
  function markCooperationRead(asTeacher,through){const result=core.cooperation.markRead(cooperationActor(asTeacher),through);emit();return result;}
  function cooperationBoard(asTeacher=false){return core.cooperation.board(cooperationActor(asTeacher));}
  function prepareCooperation(asTeacher,operation,payload){return core.cooperation.prepare(cooperationActor(asTeacher),operation,payload);}
  function confirmCooperation(asTeacher,id){const result=core.cooperation.confirm(cooperationActor(asTeacher),id);emit();return result;}
  function discardCooperation(asTeacher,id){return core.cooperation.discard(cooperationActor(asTeacher),id);}
  function registerGap(id){const result=core.personalService.learning.registerGap(actor,id);emit();return result;}
  function receiveQuestions(){
    requireTeacher();
    const result=core.publicService.receiveQuestions(teacher);emit();return result;
  }
  function answerGap(id,answer){
    requireTeacher();
    const proposal=core.publicService.answerGap(id,answer,teacher),c=find(state.activeId);
    c.messages.push({id:crypto.randomUUID(),role:'assistant',content:'地点答复已整理为提案。请核对差异，确认后入库并通知等待这条信息的人。',status:'done',sources:[],steps:[],actions:[{id:crypto.randomUUID(),type:'publish',proposalId:proposal.id,proposal,status:'pending'}]});emit();return snapshot();
  }
  function poll(){
    const priorTeacherId=teacher?.id;refreshTeacher();if(priorTeacherId!==teacher?.id)emit();
    const progressBefore=lastCooperationProgress;
    const cooperationProgress=[];
    const cooperationNotices=[];
    state.cooperationDelivered||={};
    for(const [asTeacher,identity] of [[false,actor],...(teacherEnabled?[[true,teacher]]:[])]){
      const key=`${identity.role}:${identity.id}`,legacyKey=asTeacher?'teacher':'student',updates=core.cooperation.updates(identity),after=state.cooperationDelivered[key]??(identity.id===actor.id||identity.id==='local-teacher'?state.cooperationDelivered[legacyKey]||0:0);
      cooperationProgress.push([key,updates.latestSeq,updates.readThrough]);
      const fresh=updates.items.filter(n=>n.seq>after&&!n.read);
      if(updates.latestSeq>after){state.cooperationDelivered[key]=updates.latestSeq;save();}
      for(const n of fresh)cooperationNotices.push({type:'cooperation',asTeacher,teacherId:asTeacher?identity.id:null,interestId:n.interestId,title:'合作进度有更新',after:{通知:'打开“项目与合作”查看。'}});
    }
    lastCooperationProgress=JSON.stringify(cooperationProgress);
    if(progressBefore!==null&&progressBefore!==lastCooperationProgress)emit();
    if(cooperationNotices.length){emit();emitter.emit('notifications',cooperationNotices);}
    const progress=JSON.stringify(core.personalService.learning.results(actor));
    if(progress!==lastGapProgress){lastGapProgress=progress;emit();}
    const learned=core.personalService.learning.poll(actor);if(learned.length){emit();emitter.emit('notifications',learned.map(n=>({...n,after:{通知:n.body}})));}
const notifications=core.personalService.state(actor).notifications;const fresh=notifications.filter(n=>n.seq>(state.deliveredSeq||0));if(fresh.length){state.deliveredSeq=Math.max(...fresh.map(n=>n.seq));emit();emitter.emit('notifications',fresh);}}
  async function startGateway(preferredPort=3210){
    const listen=p=>new Promise((resolve,reject)=>{const onError=e=>{core.server.off('listening',onListen);reject(e);};const onListen=()=>{core.server.off('error',onError);resolve();};core.server.once('error',onError);core.server.once('listening',onListen);core.server.listen(p,'127.0.0.1');});
    try{await listen(preferredPort);}catch(e){if(e.code==='EADDRINUSE'){await listen(0);gatewayError='默认端口被占用，已使用可用本地端口。';}else throw e;}
    port=core.server.address().port;emit();return port;
  }
  function exportText(id){const c=find(id);return '# '+c.title+'\n\n'+c.messages.filter(m=>m.status!=='running').map(m=>`## ${m.role==='user'?'我':'宣怀 agent'}\n\n${m.content}\n\n${(m.sources||[]).map(s=>`- [${s.title}](${s.url}) · ${s.date}`).join('\n')}`).join('\n\n');}
  async function dispose(){stop();core.server.closeAllConnections();if(core.server.listening)await new Promise(r=>core.server.close(r));}
  return {ventureLearningControl:action=>{const r=core.agent.ventureLearning.control(actor,action);emit();return r;},cooperationLearningControl:paused=>{const r=core.cooperation.learningControl(actor,paused);emit();return r;},evolve:()=>{const r=core.personalService.learning.evolve(actor);emit();return r;},rollback:()=>{const r=core.personalService.learning.rollback(actor);emit();return r;},on:emitter.on.bind(emitter),loginTeacher,teacherAccounts,createTeacherAccount,resetTeacherPassword,cooperationBoard,prepareCooperation,confirmCooperation,discardCooperation,markCooperationRead,snapshot,remember,forget,feedback,recommendations,registerGap,receiveQuestions,answerGap,newConversation,select,send,stop,confirmAction,configure,unlock,lock,profile,markRead,unfollow,poll,startGateway,exportText,dispose,
    get personalToken(){return state.token},get teacherPasswordFile(){return path.join(sharedRoot,'.local-admin')},core};
}
module.exports={createRuntime};
