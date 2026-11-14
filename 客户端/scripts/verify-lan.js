const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {createLanServer,provision}=require('../lan/server');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'xh-lan-ui-'));app.setPath('userData',path.join(root,'electron'));
const credentials=[{username:'student_ui',name:'学生界面测试',role:'student',password:'student-ui-only-password'},{username:'teacher_ui',name:'教师界面测试',role:'teacher',password:'teacher-ui-only-password'}];
let service;const windows=[],errors=[];
const js=async(win,code)=>{try{return await win.webContents.executeJavaScript(code);}catch(error){throw Error('UI script failed: '+code+'; console: '+JSON.stringify(errors),{cause:error});}};
async function until(win,code){for(let i=0;i<100;i++){if(await js(win,code))return;await new Promise(r=>setTimeout(r,50));}throw Error('UI wait failed: '+code);}
async function fill(win,values){await js(win,`(()=>{const form=document.querySelector('#cooperationForm');for(const [key,value] of Object.entries(${JSON.stringify(values)}))form.elements[key].value=value;form.requestSubmit();})()`);await until(win,"modalType==='cooperationDraft'");}
async function confirm(win){await js(win,"document.querySelector('#cooperationConfirm').click()");await until(win,"modalType==='cooperation'");}
app.whenReady().then(async()=>{
 provision(root,credentials);service=createLanServer({root,deepseekFactory:({apiKey,model})=>({enabled:Boolean(apiKey),model,complete:async()=>({content:'连接成功'})})});await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${service.server.address().port}`;
 for(const user of credentials){
  const win=new BrowserWindow({width:1120,height:800,show:false,webPreferences:{partition:'test-'+user.role,nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});windows.push(win);
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
  await win.loadURL(base);await until(win,"Boolean(document.querySelector('#loginForm'))");
  await js(win,`document.querySelector('#username').value=${JSON.stringify(user.username)};document.querySelector('#password').value=${JSON.stringify(user.password)};document.querySelector('#loginForm').requestSubmit()`);
  await until(win,"typeof state!=='undefined' && Boolean(state?.webSession) && Boolean(document.querySelector('#webIdentity'))");
  assert.ok((await js(win,"document.querySelector('#webIdentity').textContent")).includes(user.name));
 }
 const [student,teacher]=windows;
 await js(teacher,"document.querySelector('#cooperationButton').click()");await until(teacher,"modalType==='cooperation'");
 assert.ok(await js(teacher,"Boolean(document.querySelector('[data-coop=new]'))"));
 assert.ok(await js(teacher,"!document.querySelector('[data-coop=student]')"));
 await js(teacher,"document.querySelector('[data-coop=new]').click()");
 await fill(teacher,{title:'局域网双机界面测试',summary:'测试公开介绍',lookingFor:'AI 产品同学',offering:'每周讨论',expectations:'每周两小时'});await confirm(teacher);
 await js(student,"document.querySelector('#cooperationButton').click()");await until(student,"modalType==='cooperation'");
 assert.ok(await js(student,"Boolean(document.querySelector('[data-coop=interest]')) && !document.querySelector('[data-coop=unlock]')"));
 await js(student,"document.querySelector('[data-coop=interest]').click()");await fill(student,{who:'测试学生',experience:'课程项目',availability:'每周两小时'});await confirm(student);
 await until(teacher,"Boolean(document.querySelector('[data-coop=accept]'))");
 await js(teacher,"document.querySelector('[data-coop=accept]').click()");await until(teacher,"modalType==='cooperationDraft'");await confirm(teacher);
 await until(student,"Boolean(document.querySelector('[data-coop=contact]'))");
 await js(student,"closeModal();settings();document.querySelector('#key').value='test-ui-key';document.querySelector('#connectionForm').requestSubmit()");
 await until(student,"state.configured && !document.querySelector('#connectionSettings') && !settingBusy");
 await js(student,'closeModal();settings()');assert.ok(await js(student,"!document.querySelector('#connectionForm')"));
 await js(student,'closeModal();openCooperation()');await until(student,"modalType==='cooperation'");
 const artifacts=path.resolve(__dirname,'../test-artifacts');fs.mkdirSync(artifacts,{recursive:true});
 for(const [i,win] of windows.entries())fs.writeFileSync(path.join(artifacts,`lan-${credentials[i].role}.png`),(await win.webContents.capturePage()).toPNG());
 await js(student,"closeModal();document.querySelector('#logoutButton').click()");await until(student,"Boolean(document.querySelector('#loginForm'))");
 assert.deepEqual(errors,[]);console.log('LAN UI PASS: independent logins, teacher publish, student interest, live notification/acceptance, configured form hidden, logout.');
}).then(async()=>{for(const win of windows)win.destroy();await service?.close();fs.rmSync(root,{recursive:true,force:true});app.quit();}).catch(async error=>{console.error(error);for(const win of windows)win.destroy();await service?.close();fs.rmSync(root,{recursive:true,force:true});app.exit(1);});
