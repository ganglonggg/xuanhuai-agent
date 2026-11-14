const {app,BrowserWindow,ipcMain,Menu,Notification,dialog,shell,clipboard}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {createRuntime}=require('./runtime');

app.setName('宣怀 Agent');
app.setPath('userData',process.env.XUANHUAI_TEST_DATA||path.join(app.getPath('appData'),'XuanhuaiAgent'));
if(!app.requestSingleInstanceLock())app.quit();
let window,runtime,timer;
const uiFile=path.join(__dirname,'ui/index.html');
function showWindow(){if(!window||window.isDestroyed())createWindow();window.show();window.focus();}
function createWindow(){
  window=new BrowserWindow({width:1120,height:800,minWidth:760,minHeight:600,title:'宣怀 Agent',show:false,titleBarStyle:'hiddenInset',trafficLightPosition:{x:20,y:20},backgroundColor:'#f8f7f4',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(uiFile).href)event.preventDefault();});
  window.loadFile(uiFile);window.once('ready-to-show',()=>window.show());
}
function register(name,handler){ipcMain.handle('agent:'+name,async(event,...args)=>{try{if(event.senderFrame.url!==pathToFileURL(uiFile).href)throw Error('拒绝未知页面请求');return {ok:true,value:await handler(...args)};}catch(e){return {ok:false,error:e.message};}});}
function command(name){showWindow();window.webContents.send('agent:command',name);}
app.on('second-instance',()=>{if(runtime)showWindow();});
app.whenReady().then(async()=>{
  const packaged=fs.existsSync(path.join(__dirname,'core'));
  const coreDir=packaged?path.join(__dirname,'core'):path.resolve(__dirname,'../信息层/xuanhuai-platform');
  const articleDir=packaged?path.join(__dirname,'articles'):path.resolve(coreDir,'../天津大学宣怀学院公众号资料库/文章');
  runtime=createRuntime({coreDir,articleDir,userData:app.getPath('userData'),apiKey:process.env.SILICONFLOW_API_KEY||''});
  delete process.env.SILICONFLOW_API_KEY;
  runtime.on('state',state=>{if(window&&!window.isDestroyed())window.webContents.send('agent:state',state);});
  runtime.on('notifications',items=>{if(Notification.isSupported())for(const n of items.slice(-3)){const notification=new Notification({title:'宣怀 · '+n.title,body:Object.entries(n.after).map(([k,v])=>`${({place:'地点',time:'时间',teacher:'主讲人'})[k]||k}：${v}`).join('；')});notification.on('click',()=>command(n.type==='cooperation'?{type:'cooperation',asTeacher:n.asTeacher,teacherId:n.teacherId,interestId:n.interestId}:'following'));notification.show();}});
  for(const name of ['ventureLearningControl','cooperationLearningControl','evolve','rollback','loginTeacher','teacherAccounts','createTeacherAccount','resetTeacherPassword','cooperationBoard','markCooperationRead','prepareCooperation','confirmCooperation','discardCooperation','remember','forget','feedback','recommendations','registerGap','receiveQuestions','answerGap'])register(name,(...args)=>runtime[name](...args));
  register('state',()=>runtime.snapshot());register('newConversation',()=>runtime.newConversation());register('select',id=>runtime.select(id));
  register('send',(id,q,kind)=>runtime.send(id,q,kind));register('stop',()=>runtime.stop());register('confirmAction',(...args)=>runtime.confirmAction(...args));
  register('configure',args=>runtime.configure(args));register('unlock',password=>runtime.unlock(password));register('lock',()=>runtime.lock());register('profile',value=>runtime.profile(value));
  register('markRead',()=>runtime.markRead());register('unfollow',id=>runtime.unfollow(id));
  register('showTeacherPassword',()=>shell.showItemInFolder(runtime.teacherPasswordFile));
  register('openSource',async url=>{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw Error('不支持的链接');await shell.openExternal(u.href);});
  register('copyConnection',()=>{const config={mcpServers:{xuanhuai:{command:process.execPath,args:[path.join(__dirname,'core/mcp.js')],env:{ELECTRON_RUN_AS_NODE:'1',XUANHUAI_URL:`http://127.0.0.1:${runtime.snapshot().gateway.port}`,XUANHUAI_TOKEN:runtime.personalToken}}}};if(!packaged){config.mcpServers.xuanhuai.args=[path.join(coreDir,'mcp.js')];}clipboard.writeText(JSON.stringify(config,null,2));return {copied:true};});
  register('export',async id=>{const text=runtime.exportText(id);const result=await dialog.showSaveDialog(window,{title:'导出这段对话',defaultPath:'宣怀对话.md',filters:[{name:'Markdown',extensions:['md']}]});if(result.canceled)return {canceled:true};fs.writeFileSync(result.filePath,text,{mode:0o600});return {saved:true};});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'宣怀 Agent',submenu:[{role:'about'},{label:'设置…',accelerator:'CmdOrCtrl+,',click:()=>command('settings')},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
    {label:'对话',submenu:[{label:'新对话',accelerator:'CmdOrCtrl+N',click:()=>runtime.newConversation()},{label:'导出对话…',accelerator:'CmdOrCtrl+Shift+E',click:()=>command('export')}]},
    {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'窗口',submenu:[{role:'minimize'},{role:'zoom'},{label:'打开宣怀 Agent',click:showWindow},{role:'close'}]}
  ]));
  await runtime.startGateway(Number(process.env.XUANHUAI_PORT||3210));
  timer=setInterval(()=>runtime.poll(),5000);createWindow();
  app.on('activate',showWindow);
}).catch(error=>{dialog.showErrorBox('宣怀 Agent 无法启动',error.message);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{clearInterval(timer);runtime?.stop();});
