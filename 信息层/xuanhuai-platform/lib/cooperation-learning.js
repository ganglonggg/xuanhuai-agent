const crypto=require('node:crypto');
const FIELDS=['每周投入','参与方式'];
const key=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function decision(report,fields){return report.checks.some(c=>fields.includes(c.field)&&c.status==='conflict')?'resolve_constraints':'prepare_interest';}
function metrics(rows,fields){let missed=0,falseBlocks=0;for(const row of rows){const conflict=row.report.checks.some(c=>FIELDS.includes(c.field)&&c.status==='conflict');const blocked=decision(row.report,fields)==='resolve_constraints';if(conflict&&!blocked)missed++;if(!conflict&&blocked)falseBlocks++;}return {total:rows.length,missedConflicts:missed,falseBlocks};}
// Learn only from completed, mutually authorized, still-visible preflights.
// A frozen candidate uses earlier projects for discovery; later distinct projects
// are reserved for prospective validation. No synthetic examples are injected.
function refresh(d,stamp){
 d.adaptation||={};const students=new Set(d.interests.map(i=>i.studentId));
 for(const id of students){
  const state=d.adaptation[id]||={version:0,activeFields:[],events:[]};
  const rows=d.interests.filter(i=>i.studentId===id&&i.preflight&&i.preflightGrants?.student&&i.preflightGrants?.owner&&!['closed','changed','withdrawn','declined'].includes(i.status)).filter(i=>{const n=d.needs.find(n=>n.id===i.needId);return n?.status==='published'&&n.revision===i.needRevision&&(n.audience==='members'||n.memberIds?.includes(id)||n.ownerId===id);}).map(i=>({id:i.id,project:i.needId,revision:i.needRevision,report:i.preflight,fingerprint:key([i.needRevision,i.preflightGrants.student,i.preflightGrants.owner])}));
  if(state.paused)continue;
  const available=new Map(rows.map(r=>[r.id,r]));
  const valid=refs=>refs.every(r=>available.get(r.id)?.fingerprint===r.fingerprint);
  if(state.acceptedEvidence&&!valid(state.acceptedEvidence)){
   state.events.push({type:'rollback',at:stamp,reason:'授权撤销、资料修改或需求失效，验证依据已不完整'});state.activeFields=[];state.version++;delete state.acceptedEvidence;delete state.candidate;
  }
  if(state.candidate&&!valid(state.candidate.training)){state.events.push({type:'discarded',at:stamp,reason:'候选生成依据失效'});delete state.candidate;}
  const refs=rs=>rs.map(({id,project,fingerprint})=>({id,project,fingerprint}));
  if(!state.candidate){
   // One current record per project prevents repeated edits manufacturing samples.
   const unique=[...new Map(rows.map(r=>[r.project,r])).values()];
   const discovery=unique.slice(-2);
   const found=FIELDS.filter(field=>discovery.some(r=>r.report.checks.some(c=>c.field===field&&c.status==='conflict'))&&!state.activeFields.includes(field));
   if(discovery.length===2&&found.length){state.candidate={id:crypto.randomUUID(),created:stamp,fields:[...state.activeFields,...found],training:refs(discovery),excludedProjects:unique.map(r=>r.project),baseline:[...state.activeFields]};state.events.push({type:'proposed',at:stamp,fields:state.candidate.fields,reason:'从较早的两个真实项目预检中发现未提前处理的约束冲突'});}
  }
  const c=state.candidate;
  if(c){
   const trainingProjects=new Set(c.excludedProjects);
   const validation=[...new Map(rows.filter(r=>!trainingProjects.has(r.project)).map(r=>[r.project,r])).values()];
   c.validationCount=validation.length;c.before=metrics(validation,c.baseline);c.after=metrics(validation,c.fields);
   const negative=validation.some(r=>decision(r.report,FIELDS)==='resolve_constraints');
   const positive=validation.some(r=>decision(r.report,FIELDS)==='prepare_interest');
   c.status=validation.length<2||!negative||!positive?'awaiting_evidence':'evaluated';
   if(c.status==='evaluated'){
    const accepted=c.after.missedConflicts<c.before.missedConflicts&&c.after.falseBlocks<=c.before.falseBlocks;
    const attempt=key([c.id,refs(validation)]);
    if(c.lastAttempt!==attempt){state.events.push({type:accepted?'activated':'rejected',at:stamp,candidateId:c.id,fields:c.fields,before:c.before,after:c.after,training:c.training,validation:refs(validation),reason:accepted?'后续项目的漏检减少，且未增加对无冲突项目的阻断':'后续记录未达到改进门槛'});c.lastAttempt=attempt;}
    if(accepted){state.previousFields=[...state.activeFields];state.activeFields=c.fields;state.version++;state.acceptedEvidence=[...c.training,...refs(validation)];delete state.candidate;}
   }
  }
  state.sampleCount=new Set(rows.map(r=>r.project)).size;state.events=state.events.slice(-40);
 }
}
function view(d,actor){const s=d.adaptation?.[actor.id];return s?structuredClone(s):{version:0,activeFields:[],sampleCount:0,events:[]};}
module.exports={refresh,view,decision,metrics};
