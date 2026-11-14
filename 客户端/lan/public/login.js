document.querySelector('#loginForm').onsubmit=async event=>{
  event.preventDefault();const button=event.target.querySelector('button'),error=document.querySelector('#loginError');
  button.disabled=true;error.textContent='正在登录…';
  try{
    const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Xuanhuai-Request':'1'},body:JSON.stringify(Object.fromEntries(new FormData(event.target)))});
    const result=await response.json();if(!response.ok)throw Error(result.error);
    event.target.reset();location.replace('/');
  }catch(problem){error.textContent=problem.message;button.disabled=false;}
};
