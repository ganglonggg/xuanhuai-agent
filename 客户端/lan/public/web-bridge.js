(()=>{
  const listeners=new Set();let lastState='',currentState=null,polling=false;
  function publish(state){if(!state)return;const serialized=JSON.stringify(state);if(serialized===lastState)return;lastState=serialized;currentState=state;for(const callback of listeners)callback(state);}
  async function request(url,body){
    const response=await fetch(url,{cache:'no-store',headers:{'Content-Type':'application/json','X-Xuanhuai-Request':'1'},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
    const result=await response.json();
    if(!response.ok){if(response.status===401)location.replace('/login');throw Error(result.error||'连接失败');}
    return result;
  }
  async function rpc(method,...args){const result=await request('/api/rpc',{method,args});publish(result.state);return result.value;}
  const agent={};
  for(const method of ['ventureLearningControl','cooperationLearningControl','evolve','rollback','newConversation','select','send','stop','confirmAction','configure','profile','markRead','unfollow','remember','forget','feedback','recommendations','registerGap','cooperationBoard','prepareCooperation','confirmCooperation','discardCooperation','markCooperationRead','receiveQuestions','answerGap'])agent[method]=(...args)=>rpc(method,...args);
  agent.state=async()=>{const result=await request('/api/state');publish(result.state);return result.state;};
  agent.onState=callback=>{listeners.add(callback);if(currentState)queueMicrotask(()=>{if(listeners.has(callback))callback(currentState);});return()=>listeners.delete(callback);};
  agent.onCommand=()=>()=>{};
  agent.openSource=async value=>{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error('链接无效');window.open(url.href,'_blank','noopener,noreferrer');};
  agent.export=async id=>{const text=await rpc('exportText',id),url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='宣怀对话.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return {saved:true};};
  agent.logout=async()=>{await request('/api/logout',{});location.replace('/login');};
  agent.lock=agent.logout;
  for(const name of ['ventureLearningControl','cooperationLearningControl','evolve','rollback','loginTeacher','unlock','teacherAccounts','createTeacherAccount','resetTeacherPassword','showTeacherPassword','copyConnection'])agent[name]=async()=>{throw Error('请使用当前测试账号；切换账号请先退出登录。');};
  window.agent=agent;
  setInterval(async()=>{if(polling||document.hidden)return;polling=true;try{await agent.state();document.querySelector('#networkStatus')?.remove();}catch(error){if(!document.querySelector('#networkStatus')){const notice=document.createElement('div');notice.id='networkStatus';notice.textContent='连接中断，正在重试。请检查服务电脑是否在线。';document.body.append(notice);}}finally{polling=false;}},2000);
})();
