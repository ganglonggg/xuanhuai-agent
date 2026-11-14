const evolution=require('./evolution');
const {terms}=require('./knowledge');
const crypto = require('node:crypto');
const {fail,str} = require('./storage');
const dayMs=86400000;
function localDate(now=new Date()){return new Date(now).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});}
// Calendar arithmetic uses UTC noon, independent of the computer's timezone.
function weekStart(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
function addDays(date,n){return new Date(+new Date(date+'T12:00:00Z')+n*dayMs).toISOString().slice(0,10);}
function validDate(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
function minutes(s){const m=String(s).match(/^(\d{1,2}):(\d{2})$/);return m&&+m[1]<24&&+m[2]<60?+m[1]*60+(+m[2]):null;}
function slot(c){const match=String(c.time||'').match(/(\d{1,2}:\d{2})\s*[–—~至-]\s*(\d{1,2}:\d{2})/);if(!match)return null;const start=minutes(match[1]),end=minutes(match[2]);return start!==null&&end!==null&&end>start?{start,end}:null;}
function courseDate(c,week){if(validDate(c.date))return c.date;const m=String(c.date).match(/^(\d{1,2})[.月/-](\d{1,2})日?$/);const year=String(week).match(/^\d{4}/)?.[0];if(!m||!year)return null;const date=`${year}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;return validDate(date)?date:null;}
function campus(c){return c.campus||(['北洋园','卫津路','线上'].find(x=>String(c.place).includes(x))||'');}
function deadline(value){if(!value)return null;if(validDate(value))return +new Date(`${value}T23:59:59.999+08:00`);const n=Date.parse(value);return Number.isNaN(n)?0:n;}
function missingPlace(c){return !c.place||/待定|待确认|待通知|群内通知|另行通知|未知/.test(c.place);}
function createLearning(db,publicService){
 function get(actor){const d=db.read(),u=d.users[actor?.id];if(!u)fail('需要个人访问令牌',401);u.learning||={memories:[],feedback:[],waiting:[],inbox:[],digests:[]};return {d,u,l:u.learning};}
 function active(l,now){return l.memories.filter(m=>!m.expiresAt||m.expiresAt>=localDate(now));}
 function validateMemory(input){
  const kind=input?.kind;if(!['campus','interest','goal','busy','preference'].includes(kind))fail('不支持的记忆类型');
  let value=input.value;
  if(kind==='busy'){if(!value||!Number.isInteger(value.day)||value.day<1||value.day>7||minutes(value.start)===null||minutes(value.end)===null||minutes(value.end)<=minutes(value.start))fail('忙碌时段需要星期 1–7 和有效起止时间');value={day:value.day,start:value.start,end:value.end};}
  else {value=str(value,'记忆内容',200);if(kind==='campus'&&!['北洋园','卫津路','不限'].includes(value))fail('请选择常去校区');if(kind==='preference'&&value!=='no_cross_campus')fail('不支持的偏好');}
  const expiresAt=input.expiresAt||null;if(expiresAt&&!validDate(expiresAt))fail('有效期格式为 YYYY-MM-DD');if(kind==='goal'&&!expiresAt)fail('近期目标需要设置有效期');
  return {kind,value,expiresAt};
 }
 function remember(actor,input,now=new Date()){const item=validateMemory(input),{d,l}=get(actor);if(item.expiresAt&&item.expiresAt<localDate(now))fail('有效期不能早于今天');if(item.kind==='campus')l.memories=l.memories.filter(m=>m.kind!=='campus');let m=l.memories.find(m=>m.kind===item.kind&&JSON.stringify(m.value)===JSON.stringify(item.value));if(!m){m={id:crypto.randomUUID(),...item};l.memories.push(m);}Object.assign(m,item,{source:'本人确认',confirmed:true,updated:new Date(now).toISOString()});db.write(d);return m;}
 function forget(actor,id){const {d,l}=get(actor);l.memories=l.memories.filter(m=>m.id!==id);db.write(d);return {removed:true};}
 function feedback(actor,id,choice,now=new Date()){
  if(!['want','busy','less','clear'].includes(choice))fail('不支持的反馈');const c=publicService.getCourse(str(id,'课程 ID',100),actor),{d,l,u}=get(actor);
  const previous=recommend(actor,{start:weekStart(courseDate(c,localDate(now))||localDate(now)),preview:true,now}).items.find(x=>x.id===id);
  l.feedback=l.feedback.filter(f=>f.courseId!==id);if(choice!=='clear')l.feedback.push({courseId:id,series:c.series||c.title,choice,baseScore:previous?previous.score+(previous.reasons.includes('你曾要求减少这门课程的推荐')?(l.policy||evolution.BASE).lessPenalty:0):null,created:new Date(now).toISOString(),source:'本人反馈'});
  if(choice==='want'&&!u.subscriptions.some(s=>s.courseId===(c.courseId||id)))u.subscriptions.push({courseId:c.courseId||id,afterSeq:publicService.latestSeq()});db.write(d);return {saved:true};
 }
 function recommend(actor,{start,preview=false,now=new Date()}={}){
  const today=localDate(now);start=start||addDays(weekStart(today),7);if(!validDate(start))fail('周起始日期无效');const end=addDays(start,6),snapshot=publicService.listCourses('',actor,{start,now});const {l,u}=get(actor),memories=active(l,now),home=memories.find(m=>m.kind==='campus')?.value;
  const strict=memories.some(m=>m.kind==='preference'&&m.value==='no_cross_campus'),busy=memories.filter(m=>m.kind==='busy');const excluded={historical:0,unverified:0,outside:0,conflict:0,unavailable:0};const candidates=[];
  for(const c of snapshot.courses){
   const date=courseDate(c,snapshot.week),time=slot(c),where=campus(c);
   if(publicService.isPreviewOnly?.(c.id)&&!preview){excluded.historical++;continue;}
   if(!date||date<start||date>end){excluded.outside++;continue;}
   if(['cancelled','canceled','已取消'].includes(c.status)||c.registrationOpen===false||(c.registrationDeadline&&deadline(c.registrationDeadline)<+new Date(now))){excluded.unavailable++;continue;}
   if(!preview&&time&&+new Date(`${date}T${String(Math.floor(time.end/60)).padStart(2,'0')}:${String(time.end%60).padStart(2,'0')}:00+08:00`)<=+new Date(now)){excluded.outside++;continue;}
   if(!preview&&(c.status!=='confirmed'||missingPlace(c)||!time||!where)){excluded.unverified++;continue;}
   const cross=home&&home!=='不限'&&where&&where!=='线上'&&where!==home;
   const weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7+1;
   if((strict&&cross)||busy.some(m=>m.value.day===weekday&&time&&time.start<minutes(m.value.end)+(cross?90:0)&&time.end>minutes(m.value.start)-(cross?90:0))){excluded.conflict++;continue;}
   const fb=l.feedback.find(f=>f.courseId===c.id);if(fb?.choice==='busy'){excluded.conflict++;continue;}
   let score=0;const reasons=[],warnings=[];const content=`${c.title} ${c.note||''} ${c.tags?.join(' ')||''}`.toLowerCase();
   for(const m of memories.filter(m=>['interest','goal'].includes(m.kind))){const tokens=terms(m.value);if(tokens.some(t=>content.includes(t))){score+=m.kind==='goal'?5:3;reasons.push(`${m.kind==='goal'?'符合近期目标':'匹配关注方向'}：${m.value}`);}}
   if(u.subscriptions.some(s=>s.courseId===(c.courseId||c.id))){score+=6;reasons.push('你已明确关注');}
   if(home&&home===where){score+=2;reasons.push('在你常去的校区');}
   if(l.feedback.some(f=>f.choice==='less'&&f.series===(c.series||c.title))){score-=(l.policy||evolution.BASE).lessPenalty;reasons.push('你曾要求减少这门课程的推荐');}
   if(cross)warnings.push('跨校区，建议预留 90 分钟');if(!where)warnings.push('校区待确认');
   if(preview)warnings.push('历史样例预览，不是可参加的下周安排');
   if(c.status!=='confirmed')warnings.push('安排未经确认');
   if(!reasons.length)reasons.push(preview?'历史样例，未匹配到明确偏好':'本周可选课程；补充关注方向可改善排序');
   candidates.push({...c,missingPlace:missingPlace(c),date,campus:where,score,reasons,warnings,feedback:fb?.choice||null,_time:time});
  }
  candidates.sort((a,b)=>b.score-a.score||a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const items=candidates.filter(c=>c.score>=0).slice(0,5);
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];if(a.date!==b.date||!a._time||!b._time)continue;const gap=a.campus&&b.campus&&a.campus!==b.campus&&a.campus!=='线上'&&b.campus!=='线上'?90:0;if(a._time.start<b._time.end+gap&&b._time.start<a._time.end+gap){a.warnings.push(`与「${b.title}」时间冲突或出行时间不足`);b.warnings.push(`与「${a.title}」时间冲突或出行时间不足`);}}
  return {policy:l.policy||evolution.BASE,start,end,preview,items:items.sort((a,b)=>a.date.localeCompare(b.date)||(a._time?.start||0)-(b._time?.start||0)).map(({_time,...c})=>c),excluded,notice:preview?'仅用历史样例演示筛选，不代表真实推荐。':items.length?'按你的已确认偏好筛选；请查看每项提示。':'这一周还没有符合条件且已经确认的安排；不会用历史课表补成下周推荐。'};
 }
 function evolve(actor){const {d,l}=get(actor);const report=evolution.propose(l.policy||evolution.BASE,l.feedback);l.evaluations||=[];l.evaluations.push(report);l.evaluations=l.evaluations.slice(-20);if(report.accepted){l.previousPolicy=l.policy||{...evolution.BASE};l.policy=report.candidate;}db.write(d);return report;}
 function rollback(actor){const {d,l}=get(actor);if(!l.previousPolicy)fail('没有可回退的策略');l.policy=l.previousPolicy;delete l.previousPolicy;l.evaluations||=[];l.evaluations.push({created:new Date().toISOString(),rollback:true,policy:l.policy});db.write(d);return l.policy;}
 function registerGap(actor,id,now=new Date()){get(actor);const gap=publicService.registerGap(id,actor);const {d,l}=get(actor);if(!l.waiting.some(w=>w.gapId===gap.id))l.waiting.push({gapId:gap.id,created:new Date(now).toISOString()});db.write(d);return gap;}
 function results(actor){const {l}=get(actor);return l.waiting.flatMap(w=>{try{return [{...w,...publicService.gapResult(w.gapId,actor)}];}catch(e){if(e.status===404)return [];throw e;}});}
 function state(actor,now=new Date()){const {l}=get(actor),answers=results(actor);return {...l,metrics:{activeMemories:active(l,now).length,feedbackCount:l.feedback.length,asked:answers.length,answered:answers.filter(g=>g.status==='answered').length,digests:l.digests.length},memories:l.memories.map(m=>({...m,expired:Boolean(m.expiresAt&&m.expiresAt<localDate(now))})),results:answers};}
 function markRead(actor){const {d,l}=get(actor);l.inbox.forEach(n=>n.read=true);db.write(d);}
 function poll(actor,now=new Date()){
  const replies=results(actor).filter(g=>g.status==='answered');const {d,l}=get(actor);const fresh=[];
  for(const g of replies){const key=`gap:${g.id}:${g.answeredAt}`;if(l.inbox.some(n=>n.key===key))continue;const n={key,type:'gap',title:`追问已答复：${g.title}`,body:g.answer,created:new Date(now).toISOString(),read:false};l.inbox.push(n);fresh.push(n);}
  const today=localDate(now),weekday=new Date(today+'T12:00:00Z').getUTCDay(),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(new Date(now)));
  const target=weekday===0?addDays(weekStart(today),7):weekStart(today);const due=weekday!==0||hour>=9;
  if(due&&!l.digests.some(x=>x.start===target)){
   const rec=recommend(actor,{start:target,now});const digest={...rec,created:new Date(now).toISOString()};l.digests.push(digest);l.digests=l.digests.slice(-12);
   const n={key:`week:${target}`,type:'weekly',start:target,title:`每周推荐 · ${target}`,body:rec.items.length?`${rec.items.length} 项安排已按你的偏好筛选，打开每周推荐查看。`:rec.notice,created:new Date(now).toISOString(),read:false};l.inbox.push(n);fresh.push(n);
  }
  if(fresh.length)db.write(d);return fresh;
 }
 return {evolve,rollback,validateMemory,remember,forget,feedback,recommend,registerGap,results,state,markRead,poll};
}
module.exports={slot,createLearning,localDate,weekStart,addDays,courseDate,missingPlace};
