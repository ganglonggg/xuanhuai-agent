// Bounded, deterministic delegates: each side speaks only from its confirmed card.
function negotiate(student,owner){
 const skills=owner.skills.split(/[,，、]/).map(x=>x.trim().toLowerCase()).filter(Boolean);
 const available=student.skills.split(/[,，、]/).map(x=>x.trim().toLowerCase());
 const missing=skills.filter(x=>!available.includes(x));
 const checks=[{field:'技能',status:missing.length?'unknown':'potential',detail:missing.length?'需核对技能：'+missing.join('、'):'授权卡中的技能标签吻合',student:student.skills,owner:owner.skills},
 {field:'每周投入',status:student.hours>=owner.hours?'potential':'conflict',detail:student.hours>=owner.hours?'投入时数满足要求':'可投入时数低于需求',student:student.hours,owner:owner.hours},
 {field:'参与方式',status:student.mode===owner.mode||student.mode==='flexible'||owner.mode==='flexible'?'potential':'conflict',detail:'以双方本人确认的参与方式核对',student:student.mode,owner:owner.mode}];
 return {protocol:'bounded-card-v1',rounds:[{agent:'学生授权代理',message:'提交本人授权的能力、时间和参与方式',card:student},{agent:'项目方授权代理',message:'按本人授权的要求逐项核对',card:owner},{agent:'合作预检汇总',checks}],checks,next:checks.some(c=>c.status==='conflict')?'先由本人处理冲突，再决定是否继续':'请双方本人核对待确认项，再决定是否继续',notice:'固定三轮规则代理协作，不使用语言模型；不作录取承诺，不交换联系方式。'};
}
module.exports={negotiate};
