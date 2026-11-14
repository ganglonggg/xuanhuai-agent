// 为 PPT 第 6 页生成「演示 A」两次运行的真实客户端截屏。
// 只使用临时个人数据，不调用模型、不改正式数据。
// 运行：cd 客户端 && ./node_modules/.bin/electron scripts/verify-demo-a.js
const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const here = __dirname;                    // 客户端/scripts/
const clientRoot = path.resolve(here, '..');
const outDir = path.resolve(clientRoot, '..', '演示准备', '截图');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'xh-demo-shots-'));
app.setPath('userData', path.join(userData, 'electron'));

const {createRuntime} = require(path.join(clientRoot, 'runtime'));
const coreDir = path.resolve(clientRoot, '..', '信息层/xuanhuai-platform');
const articleDir = path.resolve(coreDir, '..', '天津大学宣怀学院公众号资料库/文章');

let runtime, win;
const errors = [];

async function js(code) {
  let timer;
  try {
    return await Promise.race([
      win.webContents.executeJavaScript(code),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('UI timeout: ' + code.slice(0, 120))), 10000); }),
    ]);
  } finally { clearTimeout(timer); }
}
async function until(code) {
  for (let i = 0; i < 120; i++) { if (await js(code)) return; await new Promise(r => setTimeout(r, 60)); }
  throw Error('UI condition failed: ' + code);
}
async function shot(name) {
  await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await new Promise(r => setTimeout(r, 300));
  fs.mkdirSync(outDir, {recursive: true});
  fs.writeFileSync(path.join(outDir, name + '.png'), (await win.webContents.capturePage()).toPNG());
  console.log('shot', name);
}

// 只截弹窗区域，用于 PPT 附录
async function shotDialog(name) {
  const rect = await js(`(()=>{const el=document.querySelector('.dialog');const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()`);
  await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await new Promise(r => setTimeout(r, 250));
  fs.mkdirSync(outDir, {recursive: true});
  const img = await win.webContents.capturePage(rect);
  fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
  console.log('shot dialog', name, img.getSize());
}
function wire(r) {
  for (const name of ['evolve', 'rollback', 'loginTeacher', 'teacherAccounts', 'createTeacherAccount',
    'resetTeacherPassword', 'cooperationBoard', 'markCooperationRead', 'prepareCooperation',
    'confirmCooperation', 'discardCooperation', 'snapshot', 'remember', 'forget', 'feedback',
    'recommendations', 'registerGap', 'receiveQuestions', 'answerGap', 'newConversation', 'select',
    'send', 'stop', 'confirmAction', 'configure', 'unlock', 'lock', 'profile', 'markRead', 'unfollow']) {
    const channel = 'agent:' + (name === 'snapshot' ? 'state' : name);
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_e, ...args) => {
      try { return {ok: true, value: await r[name](...args)}; } catch (e) { return {ok: false, error: e.message}; }
    });
  }
  r.on('state', s => win.webContents.send('agent:state', s));
}

async function openPreview() {
  await js("document.querySelector('#weeklyButton').click()");
  await until("modalType==='weekly'");
  await js("document.querySelector('[data-action=preview]').click()");
  await until("document.querySelector('.dialog h2').textContent.includes('历史样例')");
  await new Promise(r => setTimeout(r, 400));
}

async function main() {
  runtime = createRuntime({coreDir, articleDir, userData: path.join(userData, 'runtime')});
  wire(runtime);
  win = new BrowserWindow({
    width: 1160, height: 1420, show: false, backgroundColor: '#faf6ed',
    webPreferences: {preload: path.join(clientRoot, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, backgroundThrottling: false},
  });
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
  await win.loadFile(path.join(clientRoot, 'ui/index.html'));
  await until('Boolean(state)');

  // 设定：常去校区北洋园、关注 AI（与 两次运行实测结果.json 的 input 一致）
  await js("window.agent.remember({kind:'campus',value:'北洋园'})");
  await js("window.agent.remember({kind:'interest',value:'AI'})");
  await new Promise(r => setTimeout(r, 500));

  // 第一次运行：滚动到 11-13 / 11-15 两场 AI×产业
  await openPreview();
  await js(`(()=>{const d=document.querySelector('.dialog');const cards=[...document.querySelectorAll('article.recommendation')];const card=cards.find(c=>c.innerText.includes('AI×产业')&&c.innerText.includes('11-13'));d.scrollTop=card.offsetTop-28;return d.scrollTop;})()`);
  await new Promise(r => setTimeout(r, 400));
  await shotDialog('demo-a-first');

  // 在 11-13 那场点「减少这门课程」
  await js(`(()=>{
    const cards=[...document.querySelectorAll('article.recommendation')];
    const card=cards.find(c=>c.innerText.includes('AI×产业')&&c.innerText.includes('11-13'));
    if(!card)throw Error('找不到 11-13 的 AI×产业');
    card.querySelector('[data-choice=less]').click();
    return true;
  })()`);
  await until("state.learning.feedback.length>=1");
  await new Promise(r => setTimeout(r, 400));
  await shot('demo-a-feedback');

  // 退出重开：销毁运行时，用同一份个人数据重建，再开新对话
  await js('closeModal()');
  await runtime.dispose();
  runtime = createRuntime({coreDir, articleDir, userData: path.join(userData, 'runtime')});
  wire(runtime);
  win.webContents.send('agent:state', runtime.snapshot());
  await new Promise(r => setTimeout(r, 600));
  await runtime.newConversation();
  await new Promise(r => setTimeout(r, 600));

  // 第二次运行：滚动到补进的两门新课 + 仍保留的 AI 课
  await openPreview();
  await js(`(()=>{const d=document.querySelector('.dialog');const cards=[...document.querySelectorAll('article.recommendation')];const card=cards.find(c=>c.innerText.includes('以人为本'));d.scrollTop=card.offsetTop-28;return d.scrollTop;})()`);
  await new Promise(r => setTimeout(r, 400));
  await shotDialog('demo-a-second');
  await new Promise(r => setTimeout(r, 200));

  // 输出一下两次运行的结果，便于核对
  const before = runtime.recommendations(true);
  console.log('second run titles:', before.items.map(i => i.title + ' ' + (i.date || '')).join(' | '));
  if (errors.length) console.log('console errors:', errors.slice(0, 5));
  await runtime.dispose();
  win.destroy();
  fs.rmSync(userData, {recursive: true, force: true});
  app.quit();
}

app.whenReady().then(main).catch(async (e) => {
  console.error('FAILED', e.message);
  try { await runtime?.dispose(); } catch (_) {}
  try { fs.rmSync(userData, {recursive: true, force: true}); } catch (_) {}
  app.exit(1);
});
