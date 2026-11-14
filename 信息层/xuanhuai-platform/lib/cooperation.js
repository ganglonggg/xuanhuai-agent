const adaptation=require('./cooperation-learning');
const {negotiate}=require('./preflight');
const crypto = require('node:crypto');
const {fail, str} = require('./storage');
const labels = {
  authorize_preflight:'确认授权合作预检', revoke_preflight:'撤销预检授权', publish_need:'确认发布需求', close_need:'确认关闭需求', send_interest:'确认发送意向',
  withdraw_interest:'确认撤回意向', decide_interest:'确认是否继续', consent_contact:'确认交换联系方式', revoke_consent:'确认撤销交换许可',
  propose_meeting:'确认提出约见', confirm_meeting:'确认约见安排', cancel_meeting:'确认取消约见'
};
const statusLabels={submitted:'等待需求方处理',accepted:'愿意继续，等待双方许可',declined:'对方暂不继续',withdrawn:'已撤回',closed:'需求已关闭',changed:'需求已更新，请重新表达意向',exchanged:'双方已许可，联系方式已交换'};
const terminal=new Set(['declined','withdrawn','closed','changed']);
function createCooperation(db,clock=()=>new Date()) {
  const now=()=>clock().toISOString();
  function auth(a){if(!a?.id||!['student','teacher','mentor'].includes(a.role))fail('需要登录后使用项目合作',401);}
  function publisher(a){auth(a);if(!['teacher','mentor'].includes(a.role))fail('需要老师或导师身份',403);}
  const read=()=>{const d=db.read();d.needs||=[];d.interests||=[];d.drafts||=[];d.events||=[];d.readThrough||={};return d;};
  const recipientKey=a=>`${a.role}:${a.id}`;
  function updatesView(d,a,after=0){
    const key=recipientKey(a),events=d.events.filter(e=>e.recipient===key);
    const readThrough=d.readThrough[key]||0;
    return {items:events.filter(e=>e.seq>after).map(({recipient,...e})=>({...e,read:e.seq<=readThrough})),
      latestSeq:events.at(-1)?.seq||0,readThrough,unread:events.filter(e=>e.seq>readThrough).length};
  }
  function updates(a,after=0){auth(a);if(!Number.isSafeInteger(after)||after<0)fail('通知游标无效');return updatesView(read(),a,after);}
  function markRead(a,through){
    auth(a);if(!Number.isSafeInteger(through)||through<0)fail('通知游标无效');
    const d=read(),s=updatesView(d,a),key=recipientKey(a);d.readThrough[key]=Math.max(s.readThrough,Math.min(through,s.latestSeq));
    db.write(d);return updatesView(d,a);
  }
  function notify(d,i,side,type,title,body){
    const role=side==='student'?'student':i.ownerRole||'teacher';
    const recipient=`${role}:${side==='student'?i.studentId:i.ownerId}`;
    d.events.push({id:crypto.randomUUID(),seq:(d.events.at(-1)?.seq||0)+1,recipient,interestId:i.id,needId:i.needId,
      needTitle:i.needTitle,type,title,body,created:now()});
  }
  function recordEvents(d,p,result){
    const i=d.interests.find(i=>i.id===result.id),side=p.actorId===i.studentId?'student':'owner',other=side==='student'?'owner':'student';
    switch(p.operation){
      case 'authorize_preflight':case 'revoke_preflight':notify(d,i,other,'preflight','合作预检授权已更新','请查看双方授权与预检结果，仍需本人决定是否继续。');break;
      case 'send_interest':notify(d,i,'owner','interest','收到新的合作意向','有人向你的需求发送了意向卡，请查看并决定是否继续。');break;
      case 'decide_interest':notify(d,i,'student',i.status,i.status==='accepted'?'需求方愿意继续':'对方暂不继续',i.status==='accepted'?'双方还需分别许可，才能交换联系方式。':'本次意向已结束。');break;
      case 'withdraw_interest':notify(d,i,'owner','withdrawn','对方暂不继续','本次意向已结束。');break;
      case 'revoke_consent':notify(d,i,other,'consent_revoked','对方撤销了交换许可','合作意向仍保留。双方重新许可前不会交换联系方式。');break;
      case 'consent_contact':
        if(i.status==='exchanged')for(const s of ['student','owner'])notify(d,i,s,'exchanged','双方已许可建立联系','联系方式已可在这条意向中查看。');
        else notify(d,i,other,'consent','对方已许可交换联系方式','请核对并提交你自己的许可；双方都同意后才交换。');
        break;
      case 'propose_meeting':notify(d,i,other,'meeting_proposed','收到新的约见安排','请查看时间、地点和议题。你确认后才算约定。');break;
      case 'confirm_meeting':for(const s of ['student','owner'])notify(d,i,s,'meeting_confirmed','双方已确认约见','请打开这条意向查看已确认的约见安排。');break;
      case 'cancel_meeting':notify(d,i,other,'meeting_cancelled','约见已取消','原约见不再有效，请查看最新进度。');break;
    }
  }
  function need(d,id){const n=d.needs.find(n=>n.id===id);if(!n)fail('需求不存在或无权查看',404);return n;}
  const visible=(n,a)=>n.ownerId===a.id||n.audience==='members'||n.memberIds.includes(a.id);
  function accessible(d,id,a){const n=need(d,id);if(!visible(n,a))fail('需求不存在或无权查看',404);return n;}
  function owned(d,id,a){const n=need(d,id);if(n.ownerId!==a.id)fail('只能管理自己发布的需求',403);return n;}
  function interest(d,id,a){const i=d.interests.find(i=>i.id===id);if(!i||![i.studentId,i.ownerId].includes(a.id))fail('意向不存在或无权查看',404);return i;}
  function open(n){if(n.status!=='published')fail('需求已经关闭，不能继续操作',409);}
  function revision(entity,expected){if(entity.revision!==expected)fail('内容已有变化，请重新核对后提交',409);}
  function needView(n,a){
    const {ownerId,memberIds,...card}=n;
    return {...card,owned:ownerId===a.id,...(ownerId===a.id?{memberIds}:{} )};
  }
  function interestView(i,a){
    const mine=a.id===i.studentId,side=mine?'student':'owner',other=mine?'owner':'student';
    const out={id:i.id,needId:i.needId,needTitle:i.needTitle,needRevision:i.needRevision,revision:i.revision,card:i.card,side,
      status:i.status,statusLabel:i.status==='withdrawn'&&!mine?'对方暂不继续':i.status==='declined'&&!mine?'已选择暂不继续':statusLabels[i.status],created:i.created,updated:i.updated,
      preflight:terminal.has(i.status)?null:(i.preflight||null),myPreflight:i.preflightGrants?.[side]||null,otherPreflightAuthorized:Boolean(i.preflightGrants?.[other]),myConsent:Boolean(i.consents[side]),otherConsent:Boolean(i.consents[other]),meeting:i.meeting||null};
    if(i.consents[side])out.myContact=i.consents[side].contact;
    if(i.status==='exchanged')out.otherContact=i.consents[other].contact;
    return out;
  }
  function board(a){
    auth(a);const d=read();return {adaptation:adaptation.view(d,a),needs:d.needs.filter(n=>visible(n,a)&&(n.status==='published'||n.ownerId===a.id)).map(n=>needView(n,a)),
      interests:d.interests.filter(i=>[i.studentId,i.ownerId].includes(a.id)).map(i=>interestView(i,a)),
      drafts:d.drafts.filter(p=>p.actorId===a.id&&p.role===a.role&&p.state==='pending'&&p.expiresAt>now()).map(draftView),
      updates:updatesView(d,a),memberId:a.id,role:a.role,notice:'本机验证版。发布范围仅作用于这个服务中的账号，未连接跨设备成员。'};
  }
  function normalize(op,input){
    if(!input||typeof input!=='object'||Array.isArray(input))fail('请提供有效内容');
    const p={};
    if(op==='publish_need'){
      for(const [k,label,max] of [['title','标题',120],['summary','可公开简介',1000],['lookingFor','希望找到的人或讨论的问题',600],['offering','能提供什么或可约时间',600],['expectations','投入与合作预期',600]])p[k]=str(input[k],label,max);
      p.kind=input.kind||'project';if(!['project','availability'].includes(p.kind))fail('需求类型无效');
      p.audience=input.audience||'members';if(!['members','selected'].includes(p.audience))fail('可见范围无效');
      p.memberIds=p.audience==='selected'?[...new Set((Array.isArray(input.memberIds)?input.memberIds:[]).map(x=>str(x,'成员标识',150)))]:[];
      if(p.audience==='selected'&&(!p.memberIds.length||p.memberIds.length>50))fail('指定 1 至 50 位成员');
      if(input.id)p.id=str(input.id,'需求标识',100);
    }else if(op==='send_interest'){
      p.needId=str(input.needId,'需求标识',100);
      for(const [k,label] of [['who','我是谁'],['experience','我做过什么'],['availability','我能投入多少']])p[k]=str(input[k],label,600);
    }else{
      p.id=str(input.id,'记录标识',100);
      if(op==='authorize_preflight'){p.skills=str(input.skills,'可授权核对的技能标签',300);p.hours=Number(input.hours);if(!Number.isFinite(p.hours)||p.hours<=0||p.hours>168)fail('每周时数应在 0 到 168 之间');p.mode=input.mode;if(!['online','onsite','flexible'].includes(p.mode))fail('请选择参与方式');}
      if(op==='decide_interest'){p.decision=input.decision;if(!['accepted','declined'].includes(p.decision))fail('请选择继续或暂不继续');}
      if(op==='consent_contact')p.contact=str(input.contact,'愿意向对方提供的联系方式',200);
      if(op==='propose_meeting'){
        p.time=str(input.time,'约见时间',40);p.place=str(input.place,'约见地点或线上方式',300);p.agenda=str(input.agenda,'约见议题',500);
        if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(p.time)||!Number.isFinite(Date.parse(p.time+':00+08:00'))||new Date(Date.parse(p.time+':00+08:00')+8*3600000).toISOString().slice(0,16)!==p.time)fail('约见时间格式无效');
        p.duration=Number(input.duration);if(!Number.isInteger(p.duration)||p.duration<10||p.duration>240)fail('时长应为 10 至 240 分钟');
      }
    }
    return p;
  }
  function target(d,op,p,a){
    if(op==='publish_need'){publisher(a);return p.id?owned(d,p.id,a):null;}
    if(op==='close_need'){publisher(a);return owned(d,p.id,a);}
    if(op==='send_interest'){
      auth(a);if(a.role!=='student')fail('请使用个人学生身份表达意向',403);return accessible(d,p.needId,a);
    }
    return interest(d,p.id,a);
  }
  function invalidate(d,n,status){
    for(const i of d.interests)if(i.needId===n.id&&!terminal.has(i.status)&&i.status!=='exchanged'){
      i.status=status;i.consents={};i.revision++;i.updated=now();
    }
  }
  // All writes run first against a disposable copy for validation, then again on confirmation.
  function apply(d,op,p,a,expected,id){
    const t=target(d,op,p,a);if(t)revision(t,expected);
    const stamp=now();
    if(op==='publish_need'){
      if(t)open(t);
      const n={...p,id:t?.id||id,ownerId:a.id,ownerRole:a.role,status:'published',revision:(t?.revision||0)+1,created:t?.created||stamp,updated:stamp,reviewedAt:stamp};
      if(t){invalidate(d,t,'changed');d.needs[d.needs.indexOf(t)]=n;}else d.needs.push(n);
      return {kind:'need',id:n.id};
    }
    if(op==='close_need'){open(t);t.status='closed';t.revision++;t.updated=stamp;invalidate(d,t,'closed');return {kind:'need',id:t.id};}
    if(op==='send_interest'){
      open(t);if(t.ownerId===a.id)fail('不能向自己的需求发送意向');
      if(d.interests.some(i=>i.needId===t.id&&i.studentId===a.id&&!terminal.has(i.status)))fail('已发送意向，请查看进度',409);
      const i={id,needId:t.id,needTitle:t.title,needRevision:t.revision,studentId:a.id,ownerId:t.ownerId,ownerRole:t.ownerRole||'teacher',
        card:{who:p.who,experience:p.experience,availability:p.availability},status:'submitted',consents:{},revision:1,created:stamp,updated:stamp};
      d.interests.push(i);return {kind:'interest',id};
    }
    const i=t,side=a.id===i.studentId?'student':'owner';
    if(terminal.has(i.status))fail('这条意向已结束',409);
    if(op==='authorize_preflight'){
      if(!['submitted','accepted'].includes(i.status))fail('当前意向不能再授权预检',409);const n=accessible(d,i.needId,a);open(n);if(n.revision!==i.needRevision)fail('需求已经更新',409);
      i.preflightGrants||={};i.preflightGrants[side]={skills:p.skills,hours:p.hours,mode:p.mode,confirmedAt:stamp};
      i.preflight=i.preflightGrants.student&&i.preflightGrants.owner?negotiate(i.preflightGrants.student,i.preflightGrants.owner):null;
    }else if(op==='revoke_preflight'){if(i.preflightGrants)delete i.preflightGrants[side];i.preflight=null;
    }else if(op==='withdraw_interest'){
      if(side!=='student')fail('只有意向发送者可以撤回',403);
      if(i.status==='exchanged')fail('联系方式已交换，不能撤回已经披露的信息',409);
      i.status='withdrawn';i.consents={};
    }else if(op==='decide_interest'){
      if(side!=='owner')fail('只有需求方可以决定是否继续',403);
      if(i.status==='exchanged')fail('双方已经建立联系',409);
      if(i.status==='accepted'&&p.decision==='accepted')fail('已经决定继续',409);
      open(need(d,i.needId));i.status=p.decision;
      if(p.decision==='declined')i.consents={};
    }else if(op==='revoke_consent'){
      if(i.status!=='accepted')fail('仅能在联系方式交换前撤销许可',409);
      if(!i.consents[side])fail('你还没有提交交换许可',409);
      delete i.consents[side];
    }else if(op==='consent_contact'){
      if(i.status!=='accepted')fail('需求方决定继续后，双方才能许可交换联系方式',409);
      const n=accessible(d,i.needId,a);open(n);
      if(n.revision!==i.needRevision)fail('需求已经更新，请重新表达意向',409);
      i.consents[side]={contact:p.contact,confirmedAt:stamp};
      if(i.consents.student&&i.consents.owner)i.status='exchanged';
    }else if(['propose_meeting','confirm_meeting','cancel_meeting'].includes(op)){
      if(i.status!=='exchanged')fail('双方许可建立联系后才能约见',409);
      if(op==='propose_meeting'){
        if(Date.parse(p.time+':00+08:00')<=+clock())fail('请选择未来的约见时间');
        i.meeting={time:p.time,timeZone:'Asia/Shanghai',duration:p.duration,place:p.place,agenda:p.agenda,proposedBy:side,status:'proposed',updated:stamp};
      }else{
        if(!i.meeting||i.meeting.status==='cancelled')fail('没有待处理的约见安排',409);
        if(op==='confirm_meeting'){
          if(i.meeting.proposedBy===side)fail('需要对方确认约见',403);
          if(i.meeting.status==='confirmed')fail('约见已经确认',409);
          if(Date.parse(i.meeting.time+':00+08:00')<=+clock())fail('约见时间已过，请重新提出安排',409);
          i.meeting.status='confirmed';
        }else i.meeting.status='cancelled';
        i.meeting.updated=stamp;
      }
    }else fail('不支持的合作操作');
    i.revision++;i.updated=stamp;return {kind:'interest',id:i.id};
  }
  function draftView(p){return {id:p.id,operation:p.operation,label:labels[p.operation],payload:p.payload,before:p.before,context:p.context,state:p.state,expiresAt:p.expiresAt};}
  function prepare(a,operation,input){
    auth(a);if(!Object.hasOwn(labels,operation))fail('不支持的合作操作');
    const payload=normalize(operation,input),d=read(),t=target(d,operation,payload,a),id=crypto.randomUUID();
    const expected=t?.revision||0;
    apply(structuredClone(d),operation,payload,a,expected,id);
    const before=t?(operation==='publish_need'||operation==='close_need'||operation==='send_interest'?needView(t,a):interestView(t,a)):null;
    const context=operation==='send_interest'?`意向仅发送给「${t.title}」的发布者`:t?.needTitle||t?.title||'发布前请核对内容与可见范围';
    const p={id,actorId:a.id,role:a.role,operation,payload,expected,before,context,state:'pending',created:now(),expiresAt:new Date(+clock()+24*3600000).toISOString()};
    d.drafts=d.drafts.filter(x=>x.state==='confirmed'||(x.state==='pending'&&x.expiresAt>now())).concat(p);db.write(d);return draftView(p);
  }
  function confirm(a,id){
    auth(a);const d=read(),p=d.drafts.find(p=>p.id===id&&p.actorId===a.id&&p.role===a.role);if(!p)fail('待确认操作不存在',404);
    if(p.state==='confirmed')return {confirmed:true,result:p.result};
    if(p.state!=='pending'||p.expiresAt<=now())fail('这项操作已经取消或过期，请重新准备',409);
    const beforeRevisions=new Map(d.interests.map(i=>[i.id,i.revision]));
    const result=apply(d,p.operation,p.payload,a,p.expected,p.id);
    p.state='confirmed';p.result=result;p.confirmedAt=now();
    if(result.kind==='need'){
      for(const i of d.interests)if(i.needId===result.id&&beforeRevisions.get(i.id)!==i.revision&&['changed','closed'].includes(i.status)){
        notify(d,i,'student',i.status,i.status==='changed'?'需求已更新':'需求已关闭',i.status==='changed'?'原意向已结束。请查看当前可见的需求，按新条件重新表达意向。':'原意向已结束，不再接受新意向。');
      }
    }else recordEvents(d,p,result);
    adaptation.refresh(d,now());
    db.write(d);return {confirmed:true,result};
  }
  function discard(a,id){auth(a);const d=read(),p=d.drafts.find(p=>p.id===id&&p.actorId===a.id&&p.role===a.role);if(!p)fail('待确认操作不存在',404);if(p.state!=='pending')fail('操作已结束',409);d.drafts=d.drafts.filter(x=>x.id!==id);db.write(d);return {discarded:true};}
  function learningControl(a,paused){auth(a);if(typeof paused!=='boolean')fail('暂停状态无效');const d=read();d.adaptation||={};const s=d.adaptation[a.id]||={version:0,activeFields:[],events:[]};s.paused=paused;if(paused){s.activeFields=[];delete s.candidate;delete s.acceptedEvidence;s.version++;}s.events.push({type:paused?'paused':'resumed',at:now(),reason:paused?'本人暂停自主改进并恢复基础流程':'本人恢复自主改进'});if(!paused)adaptation.refresh(d,now());db.write(d);return adaptation.view(d,a);}
  return {learningControl,board,prepare,confirm,discard,updates,markRead};
}
module.exports={createCooperation};
