const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),codeRoot=process.env.XUANHUAI_VERIFY_PACKAGE||root;
const {createRuntime}=require(path.join(codeRoot,'runtime'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'xh-venture-ui-'));
app.setPath('userData',path.join(temp,'electron'));
let runtime,win;
app.whenReady().then(async()=>{
 const packaged=fs.existsSync(path.join(codeRoot,'core')),coreDir=packaged?path.join(codeRoot,'core'):path.resolve(root,'../信息层/xuanhuai-platform');
 runtime=createRuntime({coreDir,articleDir:packaged?path.join(codeRoot,'articles'):path.resolve(coreDir,'../天津大学宣怀学院公众号资料库/文章'),userData:path.join(temp,'runtime'),deepseekFactory:require('../test/fixtures/venture-learning-model')});
 for(const name of ['snapshot','send','stop','select','newConversation','cooperationBoard'])ipcMain.handle('agent:'+(name==='snapshot'?'state':name),async(_, ...args)=>{try{return {ok:true,value:await runtime[name](...args)};}catch(e){return {ok:false,error:e.message};}});
 const owner={id:'isolated-teacher',role:'teacher'};
 const draft=runtime.core.cooperation.prepare(owner,'publish_need',{kind:'project',title:'AI 硬件项目（隔离测试）',summary:'验证养老需求',lookingFor:'有软件能力',offering:'硬件支持',expectations:'每周 8 小时',audience:'members'});
 runtime.core.cooperation.confirm(owner,draft.id);
 win=new BrowserWindow({width:1280,height:940,show:true,webPreferences:{preload:path.join(codeRoot,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
 runtime.on('state',s=>win.webContents.send('agent:state',s));
 const js=code=>win.webContents.executeJavaScript(code);
 async function until(code){for(let i=0;i<150;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,40));}throw Error('UI timeout: '+code);}
 await win.loadFile(path.join(codeRoot,'ui/index.html'));await until('Boolean(state)');
 await js("document.querySelector('[data-action=ventureMode]').click()");assert.equal(await js('kind'),'venture');
 await js("send('我想做面向老年人的 AI 硬件，有软件能力，每周 8 小时')");await until("document.querySelectorAll('.venture-reviews>article').length===2");
 assert.ok(await js("document.querySelector('.venture-heading').innerText.includes('不代表老师意见')"));assert.equal(runtime.cooperationBoard(false).interests.length,0);
 assert.ok(runtime.snapshot().conversations[0].messages.at(-1).venture.selfImprovement.proposal);
 const dir=path.join(root,'test-artifacts');fs.mkdirSync(dir,{recursive:true});
 async function shot(name){await new Promise(r=>setTimeout(r,200));fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());}
 await js("document.querySelector('.venture-unknown').scrollIntoView({block:'center'})");await shot('task-learning-proposal');
 await js("send('我想做面向老年人的 AI 硬件，有软件能力，每周 6 小时，希望先验证需求')");await until("current().messages.at(-1).status==='done'");
 const reply=runtime.snapshot().conversations[0].messages.at(-1);
 assert.equal(reply.venture.selfImprovement.status,'activated');assert.equal(reply.venture.selfImprovement.versionAfter,1);assert.equal(reply.venture.selfImprovement.judges.length,2);
 await js("document.querySelectorAll('.venture-unknown')[2].scrollIntoView({block:'center'})");await shot('task-learning-activated');
 assert.ok(await js("document.querySelector('.message-column').innerText.includes('候选通过本次验证，已启用')"));
 assert.equal(runtime.cooperationBoard(false).interests.length,0);
 assert.deepEqual(errors,[]);console.log('Task learning UI passed: automatic proposal, next-task blind evaluation, actual report replacement, version persistence, no sends. Isolated model fixture only.');
}).catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(win)win.destroy();if(runtime)await runtime.dispose();fs.rmSync(temp,{recursive:true,force:true});app.quit();});
