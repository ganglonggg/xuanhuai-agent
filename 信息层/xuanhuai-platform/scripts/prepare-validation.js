// Copy the live data before migrating. Never start another writer against the live root.
const fs=require('node:fs');
const path=require('node:path');
const {createApp}=require('../server');
function prepare(){
 const source=path.resolve(__dirname,'..'),target=path.join(source,'validation-data');
 if(fs.existsSync(target))throw Error('validation-data 已存在；为保护验证记录，不覆盖。请直接使用该目录。');
 const backup=path.join(source,'backups',`before-weekly-${new Date().toISOString().replace(/[:.]/g,'-')}`);
 fs.mkdirSync(backup,{recursive:true});fs.mkdirSync(target,{recursive:true,mode:0o700});
 for(const file of ['data.json','personal.json','.local-admin','cooperation.json'])if(fs.existsSync(path.join(source,file))){fs.copyFileSync(path.join(source,file),path.join(backup,file));fs.copyFileSync(path.join(backup,file),path.join(target,file));fs.chmodSync(path.join(target,file),0o600);fs.chmodSync(path.join(backup,file),0o600);}
 const app=createApp({root:target});
 const draftFile=path.join(source,'../knowledge-base/课表/下周课表草稿.json');
 const result=app.publicService.importDraft(JSON.parse(fs.readFileSync(draftFile,'utf8')),{id:'local-teacher',role:'teacher',name:'管理员'});
 console.log(JSON.stringify({backup,target,week:result.start,sessions:result.sessions.length,teacherAccounts:app.accounts.list({id:'local-teacher',role:'teacher'}).length,liveDataUnchanged:true},null,2));
}
if(require.main===module)try{prepare();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={prepare};
