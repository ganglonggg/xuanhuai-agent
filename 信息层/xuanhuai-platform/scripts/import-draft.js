const fs=require('node:fs');
const path=require('node:path');
const {createApp}=require('../server');
function main(){
 const file=process.argv[2];if(!file)throw Error('用法：XUANHUAI_DATA_DIR=<独立数据目录> node scripts/import-draft.js <草稿文件>');
 const root=path.resolve(process.env.XUANHUAI_DATA_DIR||path.join(__dirname,'..'));
 const app=createApp({root});
 const result=app.publicService.importDraft(JSON.parse(fs.readFileSync(file,'utf8')),{id:'local-teacher',role:'teacher',name:'管理员'});
 console.log(JSON.stringify({start:result.start,sessions:result.sessions.length,uncertain:result.uncertain.length,alreadyImported:!!result.alreadyImported},null,2));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
