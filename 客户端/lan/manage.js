const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn,execFileSync}=require('node:child_process');
const {defaultRoot,provision}=require('./server');
const root=process.env.XUANHUAI_LAN_DATA||defaultRoot,recordFile=path.join(root,'service.json'),serverFile=path.join(__dirname,'server.js');
function read(){try{return JSON.parse(fs.readFileSync(recordFile,'utf8'));}catch{return null;}}
function running(record){if(!record)return false;try{return execFileSync('/bin/ps',['-p',String(record.pid),'-o','command='],{encoding:'utf8'}).includes(serverFile);}catch{return false;}}
function address(){
 let iface;try{iface=execFileSync('/sbin/route',['-n','get','default'],{encoding:'utf8'}).match(/interface:\s+(\S+)/)?.[1];}catch{}
 const interfaces=os.networkInterfaces(),candidates=[...(interfaces[iface]||[]),...Object.entries(interfaces).filter(([key])=>/^en\d+$/.test(key)).flatMap(([,items])=>items)];
 const candidate=candidates.find(item=>item.family==='IPv4'&&!item.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address));
 if(!candidate)throw Error('未找到局域网 IPv4 地址，请先连接 Wi-Fi。');return candidate.address;
}
async function main(){
 const command=process.argv[2]||'status',existing=read();
 if(command==='stop'){if(running(existing)){process.kill(existing.pid,'SIGTERM');console.log('已停止局域网测试服务。');}else console.log('测试服务未运行。');return;}
 if(command==='status'){console.log(running(existing)?`服务运行中：${existing.url}`:'测试服务未运行。');return;}
 if(command!=='start')throw Error('用法：node manage.js start|stop|status');
 if(running(existing)){console.log(`服务运行中：${existing.url}`);return;}
 const host=address(),port=3218,url=`http://${host}:${port}`;
 provision(root);const log=fs.openSync(path.join(root,'service.log'),'a',0o600);
 const child=spawn(process.execPath,[serverFile],{detached:true,stdio:['ignore',log,log],env:{...process.env,XUANHUAI_LAN_HOST:host,XUANHUAI_LAN_PORT:String(port),XUANHUAI_LAN_DATA:root}});child.unref();fs.closeSync(log);
 fs.writeFileSync(recordFile,JSON.stringify({pid:child.pid,url,host,port}),{mode:0o600});
 for(let i=0;i<30;i++){
  if(!running({pid:child.pid}))throw Error('服务启动失败，请查看 '+path.join(root,'service.log'));
  try{const response=await fetch(url+'/login',{signal:AbortSignal.timeout(500)});if(response.ok){console.log(`测试服务已启动：${url}\n账号文件：${path.join(root,'测试账号.json')}`);return;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('服务未就绪，请查看 service.log。');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
