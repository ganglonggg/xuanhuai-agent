const crypto=require('node:crypto');
const {fail,str,hash}=require('./storage');
const {admin}=require('./schedule');
function passwordHash(password){str(password,'口令',300);if(password.length<8)fail('口令至少 8 位');const salt=crypto.randomBytes(16).toString('hex');return {salt,hash:crypto.scryptSync(password,salt,64).toString('hex')};}
function matches(password,record){if(typeof password!=='string'||password.length>300)return false;const actual=crypto.scryptSync(password,record.salt,64);return crypto.timingSafeEqual(actual,Buffer.from(record.hash,'hex'));}
function createAccounts(db,adminPassword,publicService){
 const tokens=new Map();const adminRecord={salt:crypto.randomBytes(16).toString('hex')};adminRecord.hash=crypto.scryptSync(adminPassword,adminRecord.salt,64).toString('hex');
 function requireAdmin(a){if(!admin(a))fail('需要管理员权限',403);}
 function list(a){requireAdmin(a);return db.read().teachers.map(({password,...t})=>t);}
 function create(a,input){requireAdmin(a);const d=db.read(),username=str(input.username,'用户名',80),name=str(input.name,'姓名',80);if(username==='admin'||d.teachers.some(t=>t.username===username))fail('用户名已存在',409);const t={id:crypto.randomUUID(),username,name,password:passwordHash(input.password),version:1};d.teachers.push(t);db.write(d);return {id:t.id,username,name};}
 function reset(a,id,password){requireAdmin(a);const d=db.read(),t=d.teachers.find(t=>t.id===id);if(!t)fail('账号不存在',404);t.password=passwordHash(password);t.version++;db.write(d);for(const [key,v] of tokens)if(v.actor.id===id)tokens.delete(key);return {reset:true};}
 function assign(a,courseId,teacherId){requireAdmin(a);const t=teacherId?db.read().teachers.find(t=>t.id===teacherId):null;if(teacherId&&!t)fail('账号不存在',404);return publicService.assignOwner(courseId,t,a);}
 function login(username='admin',password){let actor,version=0;if(username==='admin'){if(matches(password,adminRecord))actor={id:'local-teacher',role:'teacher',isAdmin:true,name:'管理员'};}else{const t=db.read().teachers.find(t=>t.username===username);if(t&&matches(password,t.password)){actor={id:t.id,role:'teacher',name:t.name};version=t.version;}}if(!actor)fail('账号或口令不正确',401);const token=crypto.randomBytes(32).toString('hex');tokens.set(hash(token),{actor,version,expires:Date.now()+8*3600000,lastUsed:Date.now()});return {token,actor};}
 function identify(token){const key=hash(token),s=tokens.get(key);if(!s)return null;const t=s.actor.isAdmin?null:db.read().teachers.find(t=>t.id===s.actor.id);if(s.expires<=Date.now()||(!s.actor.isAdmin&&(!t||t.version!==s.version))){tokens.delete(key);return null;}s.lastUsed=Date.now();return s.actor;}
 function logout(token){tokens.delete(hash(token));return {ok:true};}
 return {list,create,reset,assign,login,identify,logout};
}
module.exports={createAccounts};
