const {hash,fail}=require('./storage');
const {localDate,weekStart,addDays,courseDate}=require('./learning');
const normalizeName=s=>String(s||'').normalize('NFKC').replace(/[《》“”\s:：()（）]/g,'').toLowerCase();
const sessions=d=>Object.values(d.weeks).flatMap(w=>w.sessions);
function date(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail('日期格式应为 YYYY-MM-DD');return s;}
function monday(s){date(s);if(weekStart(s)!==s)fail('周起始日期必须是周一');return s;}
function migrate(input){
 const d=structuredClone(input);if(d.schemaVersion!==2){
  d.catalog=[];d.weeks={};d.aliases={};
  for(const old of d.courses||[]){
   let c=d.catalog.find(c=>normalizeName(c.title)===normalizeName(old.title));
   if(!c){c={id:old.id,title:old.title,ownerId:old.ownerId||null,legacyResponsibleId:old.ownerId?null:'local-teacher',ownerName:old.teacher&&!/待|企业授课/.test(old.teacher)?old.teacher:'',visibility:'members',revision:0,rule:null,templates:[]};d.catalog.push(c);}
   const actual=courseDate(old,d.week);if(!actual)fail('旧课表日期无法迁移');
   const start=weekStart(actual);d.weeks[start]||={start,end:addDays(start,6),state:'published',revision:0,sessions:[],uncertain:[]};
   const s={...old,date:actual,courseId:c.id,weekStart:start,visibility:'members',revision:old.revision||0,source:old.source||`${d.week} 课表`,fieldStatus:{},pendingFields:[],legacyPreviewOnly:d.historicalSample===true};
   for(const k of ['time','place','teacher'])s.fieldStatus[k]=old.status==='confirmed'?'confirmed':'inherited';
   d.weeks[start].sessions.push(s);d.aliases[old.id]=c.id;
   if(!c.templates.some(t=>t.day===old.day&&t.time===old.time))c.templates.push({day:old.day,time:old.time,place:old.place,campus:old.campus||(['北洋园','卫津路','线上'].find(x=>old.place?.includes(x))||''),teacher:old.teacher,basis:[`${d.week} 课表 / ${old.source||'原记录'}`]});
  }
  for(const change of d.changes||[]){change.sessionId||=change.courseId;change.courseId=d.aliases[change.courseId]||change.courseId;}
  for(const g of d.gaps||[]){g.sessionId||=g.courseId;g.courseId=d.aliases[g.courseId]||g.courseId;}
  delete d.courses;delete d.week;delete d.historicalSample;d.schemaVersion=2;
 }
 d.anchor||={start:'2026-11-09',number:11};d.changes||=[];d.proposals||=[];d.gaps||=[];d.suggestions||=[];
 for(const g of d.gaps)if(g.status==='pending')g.status='pending_delivery';
 return d;
}
function parseRule(text,basis,templates=[]){
 const range=String(text).match(/第\s*(\d+)\s*[–—-]\s*(\d+)\s*周/);
 const days=[...String(text).matchAll(/周([一二三四五六日天])/g)].map(m=>'一二三四五六日天'.indexOf(m[1])+1).map(n=>Math.min(n,7));
 const unknown=/未见|没有周次|没有写明|近五周|只在/.test(text);
 return {startWeek:range?+range[1]:null,endWeek:range?+range[2]:null,frequency:String(text).includes('单周')?'odd':String(text).includes('双周')?'even':unknown?'unknown':'weekly',days:[...new Set(days.length?days:templates.map(t=>t.day))],slots:templates.filter(t=>!days.length||days.includes(t.day)).map(t=>({day:t.day,time:t.time})),basis:Array.isArray(basis)?basis:basis?[basis]:[],inferred:/推断|未见|没有|近五周|只在/.test(text),text};
}
function validRule(r){
 if(!r||!['weekly','odd','even','unknown'].includes(r.frequency)||typeof r.inferred!=='boolean'||!Array.isArray(r.basis)||!r.basis.length||!r.basis.every(x=>typeof x==='string'&&x.trim()))fail('规则须包含 frequency、inferred 和 basis');
 for(const k of ['startWeek','endWeek'])if(r[k]!=null&&(!Number.isInteger(r[k])||r[k]<1||r[k]>60))fail('周次必须为 1–60');
 if(r.startWeek&&r.endWeek&&r.startWeek>r.endWeek)fail('起止周次颠倒');
 if(!Array.isArray(r.days)||!r.days.every(n=>Number.isInteger(n)&&n>=1&&n<=7))fail('规则星期应为 1–7');
 if(!Array.isArray(r.slots)||!r.slots.every(s=>r.days.includes(s.day)&&typeof s.time==='string'))fail('规则 slots 需要 day、time');
 return structuredClone(r);
}
const weekNumber=(d,start)=>d.anchor.number+Math.round((Date.parse(start)-Date.parse(d.anchor.start))/604800000);
const admin=a=>a?.role==='admin'||(a?.role==='teacher'&&a.id==='local-teacher');
const staff=a=>admin(a)||a?.role==='teacher';
const owns=(c,a)=>admin(a)||(a?.role==='teacher'&&c?.ownerId===a.id);
function visible(d,s,a){const c=d.catalog.find(c=>c.id===s.courseId);return !!a&&(((s.visibility||c?.visibility)==='members'&&c?.visibility!=='staff')||owns(c,a));}
const fieldNames=['date','time','place','campus','teacher','organizer','topic','guest','registration','is_running','note','visibility'];
function makeSession(c,start,index,t,pending=[],question=''){
 const day=t.day||c.rule?.days[index]||1;const s={id:`${c.id}@${start}#${index+1}`,courseId:c.id,weekStart:start,date:addDays(start,day-1),day,title:c.title,time:t.time||'',place:t.place||'',campus:t.campus||'',teacher:t.teacher||'',topic:'',guest:'',registration:'',visibility:c.visibility||'members',status:'unconfirmed',revision:0,pendingFields:[...new Set(pending)],question,source:[...new Set([...(c.rule?.basis||[]),...(t.basis||[])])].join('；'),fieldStatus:{},evidence:{},basis:[...new Set([...(c.rule?.basis||[]),...(t.basis||[])])],is_running:''};
 for(const k of s.pendingFields)if(k in s)s[k]='';
 for(const k of fieldNames)s.fieldStatus[k]=s.pendingFields.includes(k)||!s[k]?'pending':'inherited';
 for(const k of ['time','place','campus','teacher'])if(s[k])s.evidence[k]={source:s.source,quote:s[k]};
 return s;
}
module.exports={migrate,sessions,normalizeName,date,monday,parseRule,validRule,weekNumber,admin,staff,owns,visible,fieldNames,makeSession,localDate,weekStart,addDays,hash};
