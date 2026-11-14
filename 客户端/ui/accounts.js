function showTeacherLogin(){
 openModal(`<h2>登录教师账号</h2><p>使用管理员为你开通的独立账号。需求、意向、草稿和通知按账号隔离。</p><form id="unlockForm"><label>账号<input id="teacherUsername" autocomplete="username" value="admin" required maxlength="80"></label><label>口令<input type="password" id="teacherPassword" autocomplete="current-password" required maxlength="300"></label><button class="primary">登录</button><span id="unlockError" class="inline-status"></span></form><button class="text-button" data-action="showTeacherPassword">显示本机管理员口令文件</button><p class="fine">本机管理员账号为 admin。普通教师请使用自己的账号；当前尚未接入学校认证。</p>`,'unlock');
 $('#unlockForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter||event.target.querySelector('button');button.disabled=true;
  try{await window.agent.loginTeacher($('#teacherUsername').value,$('#teacherPassword').value);kind='cooperationTeacher';closeModal();render(state);$('#prompt').focus();}
  catch(error){$('#unlockError').textContent=error.message;}finally{button.disabled=false;}
 };
}
async function showTeacherAccounts(){
 const adminId=state.teacherIdentity?.id,accounts=await window.agent.teacherAccounts();
 if(!state.teacherIdentity?.isAdmin||state.teacherIdentity.id!==adminId)return;
 openModal(`<h2>教师账号管理</h2><p>当前管理员：${esc(state.teacherIdentity.name)}。账号仅用于本机服务。</p><form id="teacherCreateForm"><h3>创建账号</h3><label>账号<input name="username" required maxlength="80" autocomplete="off"></label><label>姓名<input name="name" required maxlength="80" autocomplete="off"></label><label>初始口令<input type="password" name="password" required minlength="8" maxlength="300" autocomplete="new-password"></label><button class="primary">确认创建账号</button><span id="teacherCreateError" class="inline-status"></span></form><h3 class="subheading">现有账号</h3>${accounts.map(a=>`<article class="notification"><h3>${esc(a.name)}</h3><p>${esc(a.username)}</p><button class="secondary" data-reset-teacher="${esc(a.id)}">重置口令</button></article>`).join('')||'<p>还没有独立教师账号。</p>'}`,'teacherAccounts');
 $('#teacherCreateForm').onsubmit=async event=>{
  event.preventDefault();const button=event.submitter||event.target.querySelector('button');button.disabled=true;
  try{const input=Object.fromEntries(new FormData(event.target));await window.agent.createTeacherAccount(input);event.target.reset();await showTeacherAccounts();toast('账号已创建，请通过你选择的方式交给本人');}
  catch(error){$('#teacherCreateError').textContent=error.message;}finally{button.disabled=false;}
 };
 document.querySelectorAll('[data-reset-teacher]').forEach(button=>button.onclick=()=>{
  const account=accounts.find(a=>a.id===button.dataset.resetTeacher);
  openModal(`<h2>重置教师口令</h2><p>${esc(account.name)} · ${esc(account.username)}</p><p>确认后，该账号此前的登录会话立即失效。不会更改其需求和合作记录。</p><form id="teacherResetForm"><label>新口令<input name="password" type="password" required minlength="8" maxlength="300" autocomplete="new-password"></label><button class="primary">确认重置并撤销旧会话</button><span id="teacherResetError" class="inline-status"></span></form>`,'teacherAccounts');
  $('#teacherResetForm').onsubmit=async event=>{
   event.preventDefault();const submit=event.submitter||event.target.querySelector('button');submit.disabled=true;
   try{await window.agent.resetTeacherPassword(account.id,event.target.elements.password.value);event.target.reset();await showTeacherAccounts();toast('口令已重置，旧会话已撤销');}
   catch(error){$('#teacherResetError').textContent=error.message;}finally{submit.disabled=false;}
  };
 });
}
window.agent.onState(s=>{if(modalType==='teacherAccounts'&&!s.teacherIdentity?.isAdmin)closeModal();});
