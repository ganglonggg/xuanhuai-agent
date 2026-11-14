// Deterministic model substitute for isolated tests; never used in production.
module.exports=()=>({enabled:true,model:'isolated-test',async complete(messages){
 const input=JSON.parse(messages.at(-1).content);
 if(Object.hasOwn(input.output||{},'issue'))return {content:JSON.stringify({issue:null,guidance:'',goalQuote:'',planQuote:''})};
 if(input.output.objective)return {content:JSON.stringify({objective:'验证面向老年人的 AI 硬件创业方向',queries:['AI 硬件'],unknowns:['需要确认是否能够接触目标用户']})};
 if(input.output.steps){const article=input.resources.find(r=>r.type==='article'),need=input.resources.find(r=>r.type==='need');return {content:JSON.stringify({steps:[{title:'先验证真实需求',why:'先了解老年人在什么场景下遇到困难，再决定产品形态。',deliverable:'5 份访谈记录与问题清单',refs:article?[article.ref]:[]},{title:'核对项目合作条件',why:'将已有软件能力与公开项目要求逐项比较。',deliverable:'合作条件与待确认问题',refs:need?[need.ref]:[]},{title:'制作最小可验证原型',why:'用小规模试用验证一个关键场景。',deliverable:'一个原型和一份试用反馈',refs:[] }],nextNeed:need?.ref||null})};}
 return {content:JSON.stringify({checks:[{status:'potential',finding:'已有软件能力与项目公开要求可能契合，仍需双方核对具体技术栈。',evidence:[{source:'goal',quote:'有软件能力'},{source:'need',quote:'有软件能力'}]},{status:'unknown',finding:'目标用户访谈安排尚需确认。',evidence:[{source:'need',quote:'验证养老需求'}]}]})};
}});
