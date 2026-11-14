const {fail,str}=require('./storage');
const S=require('./schedule');
function createWeekly(db,{read,course,queue,getDraft}){
 function importDraft(draft,actor){
  if(!S.admin(actor))fail('导入草稿需要管理员权限',403);const start=S.monday(draft.week_start);if(draft.week_end!==S.addDays(start,6)||!Number.isInteger(draft.week_number))fail('草稿周次或结束日期无效');
  const d=read(),digest=S.hash(JSON.stringify(draft));if(d.weeks[start]?.importHash===digest)return {alreadyImported:true,...getDraft(start,actor)};
  if(d.weeks[start])fail('该周已有草稿；请在工作台修改，避免覆盖老师已填内容',409);
  if(S.weekNumber(d,start)!==draft.week_number)fail('草稿周次与学期锚点不一致，请先配置锚点');
  const w={start,end:draft.week_end,number:draft.week_number,state:'draft',revision:0,sessions:[],uncertain:[],questions:draft.questions||[],importHash:digest,importedAt:new Date().toISOString()};
  for(const group of ['rows','not_this_week','ended','unknown']){
   if(!Array.isArray(draft[group]))fail(`草稿缺少 ${group}`);
   for(const row of draft[group]){
    const title=str(row.course_name,'课程名',200);let c=d.catalog.find(c=>S.normalizeName(c.title)===S.normalizeName(title));
    if(!c){c={id:row.course_id||`course-${S.hash(S.normalizeName(title)).slice(0,12)}`,title,ownerId:null,ownerName:row.teacher||'',visibility:'members',revision:0,templates:[]};if(course(d,c.id))fail('草稿课程 ID 冲突');d.catalog.push(c);}
    delete c.legacyResponsibleId;c.importGroup=group;c.ownerName=row.teacher||c.ownerName||'';
    const templates=(row.sessions||[]).map(s=>({day:'一二三四五六日'.indexOf(s.weekday?.replace('周',''))+1,time:row.start_time&&row.end_time?`${row.start_time}–${row.end_time}`:'',place:row.classroom||'',campus:row.campus||'',teacher:row.teacher||''}));
    if(templates.length)c.templates=templates;
    if(!c.ruleConfirmed)c.rule=S.parseRule(row.week_rule||row.reason||'',row.basis||row.confirmed||[],c.templates);c.importRecord=structuredClone(row);c.revision++;
    if(group==='ended'){c.ended=!!row.confirmed&&!row.confirmed.startsWith('未确认');c.endBasis=row.confirmed;}
    if(group==='rows')for(let i=0;i<templates.length;i++){
     const pending=(row.pending_fields||[]).map(k=>k==='classroom'?'place':k);const s=S.makeSession(c,start,i,templates[i],pending,row.question_for_teacher||'');
     if(row.sessions[i].date!==s.date)fail('草稿日期与星期不一致');w.sessions.push(s);
     if(row.question_for_teacher)for(const field of pending.length?pending:['is_running'])queue(d,{s,c,field,question:row.question_for_teacher});
    }
    if(group==='unknown'||c.rule.inferred){const question=row.question_for_teacher||`请确认「${c.title}」第 ${w.number} 周是否开课，并补充起止周次、单双周和时段。`;w.uncertain.push({courseId:c.id,title:c.title,question,rule:c.rule});if(group!=='rows')queue(d,{c,field:'is_running',question,scope:start});}
   }
  }
  for(const question of draft.questions||[]){if(typeof question!=='string')fail('文件级问题必须是文本');
   // Split grouped questions by named course; share row questions by session and field.
   const normalized=S.normalizeName(question);
   const named=d.catalog.filter(c=>normalized.includes(S.normalizeName(c.title).slice(0,4))||normalized.includes('大讲堂')&&c.title.includes('大讲堂')||question.includes('周五下午')&&c.title.includes('实战训练'));
   if(named.length)for(const c of named){const s=w.sessions.find(s=>s.courseId===c.id);queue(d,{s,c,field:'is_running',question,scope:s?undefined:start});}
   else queue(d,{title:question,field:'schedule',question,scope:start});
  }
  d.weeks[start]=w;db.write(d);return getDraft(start,actor);
 }
 function generateWeek(start,actor){
  if(!S.admin(actor))fail('生成全周草稿需要管理员权限',403);S.monday(start);const d=read();if(d.weeks[start])return {alreadyGenerated:true,...getDraft(start,actor)};
  const number=S.weekNumber(d,start);if(number<1||number>60)fail('该日期超出本学期周次');const w={start,end:S.addDays(start,6),number,state:'draft',revision:0,sessions:[],uncertain:[],generatedAt:new Date().toISOString()};
  for(const c of d.catalog){const r=c.rule;if(c.ended||(r?.endWeek&&number>r.endWeek)||(r?.startWeek&&number<r.startWeek))continue;
   if(!r||r.inferred||r.frequency==='unknown'||!r.days.length){const question=`请确认「${c.title}」第 ${number} 周是否开课，以及周次规则、时段、地点。`;w.uncertain.push({courseId:c.id,title:c.title,rule:r,question});queue(d,{c,field:'is_running',question,scope:start});continue;}
   if(r.frequency==='odd'&&number%2===0||r.frequency==='even'&&number%2!==0)continue;
   const slots=r.slots?.length?r.slots:r.days.map(day=>({day,time:c.templates.find(t=>t.day===day)?.time||''}));
   for(let i=0;i<slots.length;i++){
    const t={...(c.templates.find(t=>t.day===slots[i].day)||c.templates[0]||{}),...slots[i]};let pending=[];
    if(/大讲堂/.test(c.title)){t.teacher='';pending.push('teacher','topic','guest','place');}
    if(/实战训练|AI×产业/.test(c.title)){t.place='';t.campus='';pending.push('place','campus');}
    for(const k of ['time','place','teacher','campus'])if(!t[k]||/待定|待确认|群内通知|待通知/.test(t[k])){t[k]='';pending.push(k);}
    const s=S.makeSession(c,start,i,t,pending,pending.length?'请补充本周待确认项':'' );w.sessions.push(s);
    for(const field of pending)queue(d,{s,c,field,question:s.question});
   }
  }d.weeks[start]=w;db.write(d);return getDraft(start,actor);
 }
 function configureAnchor(input,actor){if(!S.admin(actor))fail('需要管理员权限',403);const start=S.monday(input.start),number=input.number;if(!Number.isInteger(number)||number<1||number>60)fail('锚点周次无效');const d=read();d.anchor={start,number};db.write(d);return d.anchor;}
 return {importDraft,generateWeek,configureAnchor};
}
module.exports={createWeekly};
