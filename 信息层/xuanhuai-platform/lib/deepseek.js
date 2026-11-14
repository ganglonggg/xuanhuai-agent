const { fail, str } = require('./storage');
function createDeepSeek({apiKey='',provider=process.env.DEEPSEEK_PROVIDER||'siliconflow',model=process.env.DEEPSEEK_MODEL||(provider==='siliconflow'?'deepseek-ai/DeepSeek-V4-Flash':'deepseek-flash'),fetchImpl=fetch}={}) {
  if(!['siliconflow','deepseek'].includes(provider))fail('仅支持 SiliconFlow 或 DeepSeek 官方接口');
  const endpoint=provider==='siliconflow'?'https://api.siliconflow.cn/v1/chat/completions':'https://api.deepseek.com/chat/completions';
  let key=apiKey;
  async function complete(messages,extra={},controls={}) {
    if(!key)fail('请在教师工作台配置模型服务的 API Key 后再使用 AI。资料搜索和关注课程无需 Key。',503);
    let response;
    try {
      const timeout=AbortSignal.timeout(60000);
      response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},signal:controls.signal?AbortSignal.any([timeout,controls.signal]):timeout,body:JSON.stringify({model,messages,...(provider==='siliconflow'?{enable_thinking:false}:{thinking:{type:'disabled'}}),temperature:0.2,max_tokens:2200,...extra})});
    }catch(e){if(controls.signal?.aborted)fail('已停止本次任务',499);fail(e.name==='TimeoutError'?'DeepSeek 响应超时，请重试':'暂时无法连接 DeepSeek，请检查网络',502);}
    if(!response.ok){
      const message=response.status===401?'DeepSeek Key 无效，请重新配置':response.status===402?'DeepSeek 账户余额不足':`DeepSeek 请求失败（${response.status}），请检查模型配置或稍后重试`;
      fail(message,502);
    }
    const result=await response.json();const message=result.choices?.[0]?.message;
    if(!message)fail('DeepSeek 返回了无法识别的结果',502);return message;
  }
  function configure(value){const candidate=str(value,'API Key',300);if(!/^[A-Za-z0-9_-]+$/.test(candidate))fail('Key 格式不正确');key=candidate;return {configured:true};}
  return {complete,configure,get enabled(){return Boolean(key)},model,provider};
}
module.exports={createDeepSeek};
