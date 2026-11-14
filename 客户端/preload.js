const {contextBridge,ipcRenderer}=require('electron');
const channels=['ventureLearningControl','cooperationLearningControl','evolve','rollback','loginTeacher','teacherAccounts','createTeacherAccount','resetTeacherPassword','cooperationBoard','markCooperationRead','prepareCooperation','confirmCooperation','discardCooperation','remember','forget','feedback','recommendations','registerGap','receiveQuestions','answerGap','state','newConversation','select','send','stop','confirmAction','configure','unlock','lock','profile','markRead','unfollow','openSource','export','showTeacherPassword','copyConnection'];
const api={};
for(const name of channels)api[name]=(...args)=>ipcRenderer.invoke('agent:'+name,...args).then(result=>{if(!result.ok)throw Error(result.error);return result.value;});
api.onState=callback=>{const handler=(_,value)=>callback(value);ipcRenderer.on('agent:state',handler);return ()=>ipcRenderer.removeListener('agent:state',handler);};
api.onCommand=callback=>{const handler=(_,value)=>callback(value);ipcRenderer.on('agent:command',handler);return ()=>ipcRenderer.removeListener('agent:command',handler);};
contextBridge.exposeInMainWorld('agent',api);
