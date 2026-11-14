// Isolated UI test fixture; never packaged or used by live accounts.
module.exports=()=>{const base=require('./venture-model')();let reflected=false;return {...base,async complete(messages,options,execution){const input=JSON.parse(messages.at(-1).content);
 if(Object.hasOwn(input.output||{},'issue')){const issue=reflected?null:'首轮验证产出缺少继续或停止的判断依据';reflected=true;return {content:JSON.stringify({issue,guidance:'为需求验证产出增加明确的继续或停止依据',goalQuote:input.goal,planQuote:input.plan[0].deliverable})};}
 if(input.baseline)return {content:JSON.stringify({steps:input.baseline.map((s,i)=>i?s:{...s,deliverable:s.deliverable+'；根据付费意愿决定继续或停止'})})};
 if(input.plans){const winner=input.plans.A[0].deliverable.includes('决定继续或停止')?'A':'B';return {content:JSON.stringify({winner,safe:true,reason:'候选为首轮验证增加了可核对的继续或停止依据',goalQuote:input.goal,planQuote:input.plans[winner][0].deliverable})};}
 return base.complete(messages,options,execution);
 }};};
