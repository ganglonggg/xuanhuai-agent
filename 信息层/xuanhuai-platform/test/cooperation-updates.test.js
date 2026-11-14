const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {store}=require('../lib/storage');
const {createCooperation}=require('../lib/cooperation');
const teacher={id:'t',role:'teacher'},student={id:'s',role:'student'},outsider={id:'other',role:'student'};
const card={title:'原先可见的需求',summary:'项目简介',lookingFor:'伙伴',offering:'研究基础',expectations:'每周讨论'};
const intro={who:'本人介绍',experience:'个人经历',availability:'每周十小时'};
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'xh-updates-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'cooperation.json');return {file,c:createCooperation(store(file,{}))};}
function commit(c,a,op,payload){const p=c.prepare(a,op,payload);return c.confirm(a,p.id).result.id;}
function prepareMatch(c){const needId=commit(c,teacher,'publish_need',card);const id=commit(c,student,'send_interest',{needId,...intro});return {needId,id};}

test('只在确认时通知接收方，重复确认不重复通知；查询和已读按身份隔离',t=>{
 const {c,file}=fixture(t);const needId=commit(c,teacher,'publish_need',card);
 const pending=c.prepare(student,'send_interest',{needId,...intro});assert.equal(c.updates(teacher).unread,0);
 c.confirm(student,pending.id);c.confirm(student,pending.id);
 const u=c.updates(teacher);assert.equal(u.items.length,1);assert.equal(u.unread,1);assert.equal(u.items[0].type,'interest');
 assert.equal(c.updates(student).items.length,0);assert.equal(c.updates(outsider).items.length,0);assert.throws(()=>c.updates(null));
 assert.ok(!JSON.stringify(u).includes('本人介绍'));assert.ok(!JSON.stringify(u).includes('个人经历'));assert.ok(!('recipient' in u.items[0]));
 assert.throws(()=>c.updates(teacher,-1));assert.throws(()=>c.markRead(teacher,NaN));
 c.markRead(outsider,u.latestSeq);assert.equal(c.updates(teacher).unread,1);
 c.markRead(teacher,u.latestSeq);assert.equal(c.updates(teacher).unread,0);
 const reopened=createCooperation(store(file,{}));assert.equal(reopened.updates(teacher).unread,0);assert.equal(reopened.updates(teacher).items[0].read,true);
});

test('许可与约见通知只含状态，不含联系方式或约见私密内容',t=>{
 const {c}=fixture(t),{id}=prepareMatch(c);
 commit(c,teacher,'decide_interest',{id,decision:'accepted'});
 commit(c,student,'consent_contact',{id,contact:'secret-student-contact'});
 assert.equal(c.updates(teacher).items.at(-1).type,'consent');assert.ok(!JSON.stringify(c.updates(teacher)).includes('secret-student-contact'));
 commit(c,teacher,'consent_contact',{id,contact:'secret-teacher-contact'});
 for(const a of [student,teacher])assert.equal(c.updates(a).items.at(-1).type,'exchanged');
 const time=new Date(Date.now()+7*86400000).toISOString().slice(0,16);
 commit(c,student,'propose_meeting',{id,time,duration:30,place:'private-place',agenda:'private-agenda'});
 assert.equal(c.updates(teacher).items.at(-1).type,'meeting_proposed');
 commit(c,teacher,'confirm_meeting',{id});for(const a of [student,teacher])assert.equal(c.updates(a).items.at(-1).type,'meeting_confirmed');
 commit(c,student,'cancel_meeting',{id});assert.equal(c.updates(teacher).items.at(-1).type,'meeting_cancelled');
 for(const a of [student,teacher,outsider])for(const secret of ['secret-student-contact','secret-teacher-contact','private-place','private-agenda'])assert.ok(!JSON.stringify(c.updates(a)).includes(secret));
});

test('已读只推进到已看到的游标；增量读取不会漏掉之后的新决定',t=>{
 const {c}=fixture(t),{id}=prepareMatch(c);commit(c,teacher,'decide_interest',{id,decision:'accepted'});
 const before=c.updates(student);commit(c,teacher,'consent_contact',{id,contact:'teacher'});
 c.markRead(student,before.latestSeq);assert.equal(c.updates(student).unread,1);
 const delta=c.updates(student,before.latestSeq);assert.equal(delta.items.length,1);assert.equal(delta.items[0].type,'consent');
});

test('需求改变可见范围或关闭后，旧参与者只收到旧标题与结束状态',t=>{
 const {c}=fixture(t),{id,needId}=prepareMatch(c);
 const pending=c.prepare(teacher,'decide_interest',{id,decision:'accepted'});
 commit(c,teacher,'publish_need',{...card,id:needId,title:'不应告知原学生的新标题',audience:'selected',memberIds:[outsider.id]});
 assert.equal(c.updates(student).items.at(-1).type,'changed');assert.ok(!JSON.stringify(c.updates(student)).includes('不应告知原学生'));
 assert.equal(c.updates(outsider).items.length,0);assert.throws(()=>c.confirm(teacher,pending.id));
 const count=c.updates(student).items.length;commit(c,teacher,'close_need',{id:needId});assert.equal(c.updates(student).items.length,count);
 const next=commit(c,teacher,'publish_need',card);commit(c,student,'send_interest',{needId:next,...intro});commit(c,teacher,'close_need',{id:next});assert.equal(c.updates(student).items.at(-1).type,'closed');
});

test('拒绝和撤回只通知对方；旧数据不凭空补发历史通知，导师收件角色准确',t=>{
 const {c,file}=fixture(t),{id,needId}=prepareMatch(c);
 commit(c,teacher,'decide_interest',{id,decision:'declined',reason:'private-reason'});assert.equal(c.updates(student).items.at(-1).title,'对方暂不继续');
 const next=commit(c,student,'send_interest',{needId,...intro});commit(c,student,'withdraw_interest',{id:next});assert.equal(c.updates(teacher).items.at(-1).title,'对方暂不继续');
 assert.ok(!fs.readFileSync(file,'utf8').includes('private-reason'));
 const old=JSON.parse(fs.readFileSync(file));delete old.events;delete old.readThrough;fs.writeFileSync(file,JSON.stringify(old));
 assert.equal(createCooperation(store(file,{})).updates(teacher).unread,0);
 const mentor={id:'m',role:'mentor'},n=commit(c,mentor,'publish_need',{...card,kind:'availability'});commit(c,student,'send_interest',{needId:n,...intro});
 assert.equal(c.updates(mentor).unread,1);assert.equal(c.updates({...mentor,role:'teacher'}).unread,0);
});
