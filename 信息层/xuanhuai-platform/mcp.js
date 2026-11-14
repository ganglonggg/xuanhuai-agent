// MCP stdio adapter: all business logic lives in the shared HTTP service.
const readline=require('node:readline');
const base=process.env.XUANHUAI_URL||'http://127.0.0.1:3210';
const token=process.env.XUANHUAI_TOKEN||'';
const supported=['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];
async function api(route,body){
  const target=new URL(base);if(target.protocol!=='http:'||!['127.0.0.1','localhost'].includes(target.hostname)||target.username||target.password)throw Error('仅允许连接本机 HTTP 服务');
  const response=await fetch(base+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||`HTTP ${response.status}`);return data;
}
async function handle(request){
  if(!request||request.jsonrpc!=='2.0'||typeof request.method!=='string')return {jsonrpc:'2.0',id:request?.id??null,error:{code:-32600,message:'Invalid request'}};
  if(request.id===undefined)return;
  let result;
  switch(request.method){
    case 'initialize':result={protocolVersion:supported.includes(request.params?.protocolVersion)?request.params.protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'xuanhuai-public-agent',version:'0.6.0'},instructions:'宣怀资料和课程服务。按 Asia/Shanghai 查询本周和下周；区分已确认和沿用待确认，未知项不得补造。写操作需要用户明确要求；教师确认发布前须展示差异。'};break;
    case 'ping':result={};break;
    case 'tools/list':result=await api('/api/tools');break;
    case 'tools/call':
      try{const r=await api('/api/tools/call',{name:request.params?.name,arguments:request.params?.arguments||{}});result={content:[{type:'text',text:JSON.stringify(r.result)}]};}
      catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}break;
    default:return {jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Method not found'}};
  }
  return {jsonrpc:'2.0',id:request.id,result};
}
if(require.main===module){const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});lines.on('line',async line=>{let response;try{if(line.length>100000)throw Error('Request too large');response=await handle(JSON.parse(line));}catch(e){response={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Unable to process request'}};}if(response)process.stdout.write(JSON.stringify(response)+'\n');});}
module.exports={handle};
