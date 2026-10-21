let loading;
function load(){
 if(window.turnstile)return Promise.resolve(window.turnstile);
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;
   const fail=()=>{clearTimeout(timer);script.remove();loading=undefined;reject(Error('The bot check could not load. Please retry.'));};
   const timer=setTimeout(fail,20000);script.onload=()=>{clearTimeout(timer);window.turnstile?resolve(window.turnstile):fail();};script.onerror=fail;document.head.append(script);
 });return loading;
}
export async function mountTurnstile(container,siteKey){
 if(!siteKey)throw Error('Verification is not available yet. Please try again later.');
 const api=await load();if(!container.isConnected)return null;
 const id=api.render(container,{sitekey:siteKey,action:'contact',theme:'dark',size:container.clientWidth<300?'compact':'normal','refresh-expired':'auto'});
 return {token(){const token=api.getResponse(id);if(!token)throw Error('Please complete the bot check.');return token;},reset(){try{api.reset(id);}catch{/* Widget was closed. */}},destroy(){try{api.remove(id);}catch{/* Widget was closed. */}}};
}
