const BASE={version:1,lessPenalty:8};
function score(features,policy=BASE){return features.base-(features.less?policy.lessPenalty:0);}
// Fixed regression scenarios, never used to calculate the candidate penalty.
const HOLDOUT=Object.freeze([
 {id:'less-followed-interest',base:11,less:true,eligible:true,expected:false},
 {id:'less-goal',base:10,less:true,eligible:true,expected:false},
 {id:'less-simple',base:3,less:true,eligible:true,expected:false},
 {id:'other-ai',base:5,less:false,eligible:true,expected:true},
 {id:'other-goal',base:7,less:false,eligible:true,expected:true},
 {id:'neutral',base:0,less:false,eligible:true,expected:true},
 {id:'cancelled',base:30,less:false,eligible:false,expected:false},
 {id:'unconfirmed',base:30,less:false,eligible:false,expected:false},
 {id:'busy',base:30,less:false,eligible:false,expected:false},
 {id:'cross-campus',base:30,less:false,eligible:false,expected:false}
]);
function evaluate(policy,cases=HOLDOUT){const rows=cases.map(c=>({...c,selected:c.eligible&&score(c,policy)>=0}));return {correct:rows.filter(c=>c.selected===c.expected).length,total:rows.length,safetyViolations:rows.filter(c=>!c.eligible&&c.selected).length,rows};}
function propose(current,feedback){const examples=feedback.filter(f=>f.choice==='less'&&Number.isFinite(f.baseScore));if(!examples.length)throw Error('请先对一门推荐课程选择“减少这门课程”');const penalty=Math.min(100,Math.max(current.lessPenalty,...examples.map(f=>f.baseScore+1)));const candidate={version:current.version+1,lessPenalty:penalty};const before=evaluate(current),after=evaluate(candidate);return {created:new Date().toISOString(),current:{...current},candidate,trainingCount:examples.length,benchmark:'固定的10条人工回归场景 v1；不代表真实用户效果',before,after,accepted:after.correct>before.correct&&after.safetyViolations===0,reason:after.correct>before.correct&&after.safetyViolations===0?'回归正确数提高且安全项无违规，启用候选版本':'未达到严格改进门槛，保留当前版本'};}
module.exports={BASE,score,evaluate,propose};
