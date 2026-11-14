// Isolated release: keep the parallel schedule/account work out of the notification preview.
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const base=process.env.XUANHUAI_RELEASE_BASE||'/Users/charles/Applications/宣怀 Agent 0.5.app/Contents/Resources/app';
 const stage=path.join(root,'.releases/notifications-0.5.1');
 await fs.rm(stage,{recursive:true,force:true});await fs.mkdir(path.dirname(stage),{recursive:true});await fs.cp(base,stage,{recursive:true});
 for(const file of ['runtime.js','main.js','preload.js','ui/index.html','ui/renderer.js','ui/cooperation.js','ui/style.css'])await fs.copyFile(path.join(root,file),path.join(stage,file));
 const core=path.resolve(root,'../信息层/xuanhuai-platform');
 await fs.copyFile(path.join(core,'lib/cooperation.js'),path.join(stage,'core/lib/cooperation.js'));
 let tools=await fs.readFile(path.join(stage,'core/lib/tools.js'),'utf8');
 const current=await fs.readFile(path.join(core,'lib/tools.js'),'utf8');
 const definitions=current.split('\n').filter(l=>/^\s*\{name:'(?:get_cooperation_updates|mark_cooperation_read)'/.test(l));
 const cases=current.split('\n').filter(l=>/^\s*case '(?:get_cooperation_updates|mark_cooperation_read)'/.test(l));
 if(definitions.length!==2||cases.length!==2)throw Error('缺少通知工具定义');
 tools=tools.replace('  const definitions=[','  const definitions=[\n'+definitions.join('\n')).replace('    switch(name){','    switch(name){\n'+cases.join('\n'));
 await fs.writeFile(path.join(stage,'core/lib/tools.js'),tools);
 const agentFile=path.join(stage,'core/lib/agent.js');
 let agent=await fs.readFile(agentFile,'utf8');agent=agent.replace("['get_cooperation_board','prepare_cooperation'].includes(t.name)","['get_cooperation_board','get_cooperation_updates','prepare_cooperation'].includes(t.name)");await fs.writeFile(agentFile,agent);
 const mainFile=path.join(stage,'main.js');let main=await fs.readFile(mainFile,'utf8');
 main=main.replace("app.setName('宣怀 Agent');","app.setName('宣怀 Agent 通知验证');").replace("path.join(app.getPath('appData'),'XuanhuaiAgent')","path.join(app.getPath('appData'),'XuanhuaiAgentNotifications')");await fs.writeFile(mainFile,main);
 const pkg=JSON.parse(await fs.readFile(path.join(stage,'package.json'),'utf8'));pkg.version='0.5.1';pkg.productName='宣怀 Agent 通知验证';await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(pkg,null,2));
 const guide=await fs.readFile(path.join(root,'通知实现.md'),'utf8');await fs.appendFile(path.join(stage,'core/AGENT-GUIDE.md'),'\n\n'+guide);
 await fs.writeFile(path.join(stage,'NOTIFICATION-RELEASE.json'),JSON.stringify({base,version:'0.5.1',isolatedDataDirectory:'XuanhuaiAgentNotifications',scope:'第二版通知；不含并行开发中的课表与账号变更'},null,2));
 if(process.argv.includes('--stage-only')){console.log(stage);return;}
 const {packager}=await import('@electron/packager');
 const sourcePackage=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const paths=await packager({dir:stage,name:'宣怀 Agent 通知验证',appBundleId:'local.xuanhuai.agent.notifications',platform:'darwin',arch:'arm64',electronVersion:sourcePackage.devDependencies.electron,out:path.join(root,'dist/notifications-0.5.1'),overwrite:true,asar:false,appCategoryType:'public.app-category.productivity'});
 console.log('Built:',paths.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;});
