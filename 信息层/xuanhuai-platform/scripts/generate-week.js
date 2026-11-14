const {createApp}=require('../server');
const {weekStart,localDate,addDays}=require('../lib/schedule');
try{
 const start=process.argv[2]||addDays(weekStart(localDate()),7);
 const result=createApp().publicService.generateWeek(start,{id:'local-teacher',role:'teacher',name:'管理员'});
 console.log(JSON.stringify({start:result.start,number:result.number,sessions:result.sessions.length,uncertain:result.uncertain.length,alreadyGenerated:!!result.alreadyGenerated},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
