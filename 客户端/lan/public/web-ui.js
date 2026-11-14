const desktopSettings=settings;
settings=function(){
  desktopSettings();
  const connection=document.querySelector('#connectionSettings');
  if(connection){connection.querySelector('p').textContent='模型在云端处理请求，个人会话保存在服务电脑。';connection.querySelector('.fine').textContent='密钥只保存在服务运行内存中，服务重启后需重新连接。';}
  const copy=document.querySelector('[data-action="copyConnection"]');copy?.closest('.settings-section').remove();
};
$('#settingsButton').onclick=settings;$('#modelStatus').onclick=settings;
chooseMode=function(){
  if(state.webSession.role==='student'){openModal('<h2>这次想做什么？</h2><button class="mode-choice" data-action="chatMode"><b>学生对话</b></button><button class="mode-choice" data-action="ventureMode"><b>创业目标与行动计划</b><span>检索资源、生成行动计划与合作线索</span></button>','mode');return;}
  openModal('<h2>这次想做什么？</h2><button class="mode-choice" data-action="cooperationTeacherMode"><b>老师项目合作</b><span>整理项目需求或可约时间</span></button><button class="mode-choice" data-action="teacherMode"><b>教师提交</b><span>核对课表修改提案</span></button><button class="mode-choice" data-action="questions"><b>待答问题</b><span>查看分配给你的问题</span></button>','mode');
};
$('#modeButton').onclick=chooseMode;
let webIdentityReady=false;
window.agent.onState(next=>{
  if(!webIdentityReady){webIdentityReady=true;kind=next.webSession.role==='teacher'?'cooperationTeacher':'chat';cooperationTeacher=next.webSession.role==='teacher';}
  $('#modeButton').textContent=kind==='venture'?'创业目标⌄':kind==='teacher'?'教师提交⌄':kind==='cooperationTeacher'?'老师项目合作⌄':'学生对话';
  const identity=document.querySelector('#webIdentity')||document.createElement('div');identity.id='webIdentity';identity.className='web-identity';identity.textContent=`${next.webSession.name} · ${next.webSession.role==='teacher'?'教师':'学生'}`;
  if(!identity.isConnected)document.querySelector('.side-footer').prepend(identity);
  if(!document.querySelector('#logoutButton')){const button=document.createElement('button');button.id='logoutButton';button.textContent='退出登录';button.onclick=()=>window.agent.logout().catch(error=>toast(error.message));document.querySelector('.side-footer').append(button);}
});
const desktopCooperation=openCooperation;
openCooperation=async function(_asTeacher,refresh=false){
  await desktopCooperation(state.webSession.role==='teacher',refresh);
  if(modalType==='cooperation')for(const button of document.querySelectorAll('[data-coop="student"],[data-coop="teacher"],[data-coop="unlock"]'))button.remove();
};
$('#cooperationButton').onclick=()=>openCooperation().catch(error=>toast(error.message));
showTeacherLogin=()=>toast('请退出当前账号，再使用教师账号登录。');
