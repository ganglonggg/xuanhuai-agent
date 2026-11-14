const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createVenture}=require('../lib/venture');
const goal='我想做 AI 硬件，有软件能力，每周 8 小时';
function fixture(overrides={}){
 const calls=[],writes=[];
 const need={id:'n1',title:'AI 硬件项目',summary:'验证养老需求',lookingFor:'有软件能力',offering:'硬件支持',expectations:'每周 8 小时',status:'published',revision:1};
 const check={status:'potential',finding:'软件能力可能契合',evidence:[{source:'goal',quote:'有软件能力'},{source:'need',quote:'有软件能力'}]};
 const replies=[{objective:'验证 AI 硬件需求',queries:['AI 硬件'],unknowns:['是否有用户访谈经验']},{steps:[1,2,3].map(i=>({title:`步骤 ${i}`,why:'基于相关资源，先验证假设',deliverable:'访谈记录',refs:['article:a1']})),nextNeed:'need:n1'},{checks:[check]},{checks:[check]}];
 const model={async complete(messages){calls.push(messages);const value=replies[calls.length-1];return {content:JSON.stringify(overrides.reply?overrides.reply(value,calls.length):value)};}};
 const tools={execute(name){if(name==='search_knowledge')return [{id:'a1',title:'历史案例',date:'2025-01-01',url:'https://example.com',excerpts:['用户访谈']}];if(name==='get_recommendations')return {items:[]};if(name==='get_cooperation_board')return {needs:overrides.noNeeds?[]:[{...need,revision:overrides.changed&&calls.length===4?2:1}],drafts:[{secret:'绝不发送的草稿'}],interests:[{contact:'绝不发送的联系方式'}]};writes.push(name);throw Error('write');}};
 return {run:createVenture(model,tools).run,calls,writes};
}
test('目标流程分离两个分析上下文，只读资源，返回逐字依据与完整行动计划',async()=>{
 const f=fixture(),events=[];const result=await f.run(goal,{id:'student',role:'student'},{onEvent:e=>events.push(e)});
 assert.equal(result.report.steps.length,3);assert.equal(result.report.reviews.length,2);assert.equal(f.calls.length,4);assert.equal(result.actions.length,0);assert.deepEqual(f.writes,[]);
 assert.ok(!JSON.stringify(f.calls).includes('绝不发送'));assert.ok(f.calls[2][0].content.includes('学生侧分析'));assert.ok(f.calls[3][0].content.includes('项目需求分析'));assert.equal(f.calls[2].length,2);assert.equal(f.calls[3].length,2);
 assert.equal(events.filter(e=>e.type==='tool-done'&&e.ok).length,5);assert.ok(result.answer.includes('不代表老师意见'));
});
test('无项目时不虚构双 Agent 预检',async()=>{
 const f=fixture({noNeeds:true,reply:(v,i)=>i===2?{...v,nextNeed:null}:v});const r=await f.run(goal,{});assert.equal(r.report.reviews.length,0);assert.equal(f.calls.length,2);
});
test('拒绝不存在的来源、伪造原文和缺少双方证据的肯定判断',async()=>{
 for(const reply of [(v,i)=>i===2?{...v,steps:v.steps.map(s=>({...s,refs:['article:fake']}))}:v,(v,i)=>i===3?{checks:[{status:'unknown',finding:'伪造',evidence:[{source:'need',quote:'每周 100 小时'}]}]}:v,(v,i)=>i===3?{checks:[{status:'potential',finding:'猜测',evidence:[{source:'goal',quote:'有软件能力'}]}]}:v])await assert.rejects(fixture({reply}).run(goal,{}));
});
test('需求在分析期间修改会拒绝过时报告',async()=>{await assert.rejects(fixture({changed:true}).run(goal,{}),{status:409});});
test('取消后不执行后续模型调用',async()=>{const f=fixture(),controller=new AbortController();await assert.rejects(f.run(goal,{}, {signal:controller.signal,onEvent:e=>{if(e.type==='tool-done')controller.abort();}}));assert.equal(f.calls.length,1);});
