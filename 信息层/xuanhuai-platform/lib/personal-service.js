const crypto = require('node:crypto');
const { hash, fail, str } = require('./storage');
function createPersonalService(db, publicService) {
  function createSession(){const token=crypto.randomBytes(32).toString('hex'),d=db.read();d.users[hash(token)]={created:new Date().toISOString(),profile:'',subscriptions:[],readThrough:0};db.write(d);return token;}
  function identify(token){if(!token)return null;const id=hash(token);return db.read().users[id]?{role:'student',id}:null;}
  function user(actor){const d=db.read(),u=d.users[actor?.id];if(!u)fail('个人会话已失效，请刷新页面',401);return {d,u};}
  function state(actor){const {d,u}=user(actor);const merged=new Map();for(const sub of u.subscriptions){const id=publicService.stableId(sub.courseId);const old=merged.get(id);merged.set(id,{courseId:id,afterSeq:Math.min(sub.afterSeq,old?.afterSeq??Infinity)});}const subscriptions=[...merged.values()];if(JSON.stringify(subscriptions)!==JSON.stringify(u.subscriptions)){u.subscriptions=subscriptions;db.write(d);}const notifications=publicService.changes(0,actor).filter(c=>u.subscriptions.some(s=>s.courseId===c.courseId&&c.seq>s.afterSeq));return {...u,notifications,unread:notifications.filter(n=>n.seq>u.readThrough).length};}
  function follow(actor,id){const c=publicService.getCourse(str(id,'课程 ID',100),actor);id=publicService.stableId(id);const {d,u}=user(actor);if(!u.subscriptions.some(s=>s.courseId===id))u.subscriptions.push({courseId:id,afterSeq:publicService.latestSeq()});db.write(d);return {subscribed:true,course:c};}
  function unfollow(actor,id){id=publicService.stableId(id);const {d,u}=user(actor);u.subscriptions=u.subscriptions.filter(s=>s.courseId!==id);db.write(d);return {subscribed:false};}
  function profile(actor,value){if(typeof value!=='string'||value.length>2000)fail('个人偏好最多 2000 字符');const {d,u}=user(actor);u.profile=value.trim();db.write(d);return {saved:true};}
  function markRead(actor,seq){if(!Number.isSafeInteger(seq)||seq<0)fail('通知游标不正确');const {d,u}=user(actor);u.readThrough=Math.max(u.readThrough,Math.min(seq,publicService.latestSeq()));db.write(d);return {saved:true};}
  const learning=require('./learning').createLearning(db,publicService);
  return {learning,createSession,identify,state,follow,unfollow,profile,markRead};
}
module.exports={createPersonalService};
