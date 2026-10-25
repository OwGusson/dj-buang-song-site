import {supabase} from '../supabase';
async function apiFetch(path,options={}){const {data:{session}}=await supabase.auth.getSession();return fetch(path,{...options,headers:{...options.headers,...(session?.access_token?{Authorization:'Bearer '+session.access_token}:{})},cache:'no-store'});}
let timer=null,active=false,idleEnd=0,hardEnd=0,lastInput=0,lastSent=0,busy=false,warning=null,expiring=false,hardWarned=false;
const activityKey='dj-studio-last-activity';
function dismiss(){if(warning){warning.close();warning.remove();warning=null;}}
function recordActivity(event){
 if(!active || !event.isTrusted)return;
 // Listener playback and background polling do not count as Studio activity.
 if(!event.target.closest?.('.studio-dialog,#studio-timeout-warning') && !location.pathname.startsWith('/studio'))return;
 lastInput=Date.now();try{localStorage.setItem(activityKey,String(lastInput));}catch{/* Storage may be disabled. */}
}
for(const event of ['pointerdown','keydown','input'])document.addEventListener(event,recordActivity,{passive:true});
window.addEventListener('storage',event=>{if(event.key===activityKey&&Number(event.newValue)>lastInput)lastInput=Number(event.newValue);});
export function stopStudioSession(){active=false;clearInterval(timer);timer=null;dismiss();}
export function trackStudioSession(info){
 if(!info?.authenticated || !Number.isFinite(info.idleExpiresAt)||!Number.isFinite(info.expiresAt))return;
 const wasActive=active;idleEnd=info.idleExpiresAt;hardEnd=info.expiresAt;active=true;
 if(!wasActive){hardWarned=false;lastInput=Date.now();lastSent=lastInput;timer=setInterval(tick,5000);}
}
async function expire(){
 if(expiring)return;expiring=true;stopStudioSession();
 try{await apiFetch('/api/session',{method:'DELETE'});}catch{/* Server also enforces expiration. */}
 await supabase.auth.signOut({scope:'local'});expiring=false;
 window.dispatchEvent(new CustomEvent('studio-session-expired'));
}
async function touch(){
 if(busy)return;busy=true;
 try{
  const response=await apiFetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({activity:true})});
  if(response.status===401){await expire();return;}
  if(response.ok){trackStudioSession(await response.json());lastSent=Date.now();dismiss();}
 }finally{busy=false;}
}
async function tick(){
 if(!active)return;const now=Date.now();
 if(now>=Math.min(idleEnd,hardEnd)){await expire();return;}
 if(lastInput>lastSent && now-lastSent>=60000){try{await touch();}catch{/* Retry on the next activity tick; do not extend locally. */}return;}
 if(Math.min(idleEnd,hardEnd)-now>120000 || warning)return;
 warning=document.createElement('dialog');warning.id='studio-timeout-warning';warning.setAttribute('aria-labelledby','studio-timeout-title');
 const hard=hardEnd-idleEnd<=0;
 if(hard && hardWarned){warning=null;return;}if(hard)hardWarned=true;
 warning.innerHTML=`<h2 id="studio-timeout-title">${hard?'Please sign in again soon':'Still working?'}</h2><p>${hard?'Your 12-hour Studio session is ending. Save your work before signing in again.':'Studio will sign out in about two minutes because you’ve been inactive. Save your work or stay signed in.'}</p><p role="status"></p><button class="primary">${hard?'Continue working briefly':'Stay signed in'}</button>`;
 warning.querySelector('button').onclick=async()=>{if(hard){dismiss();return;}try{await touch();}catch{if(warning)warning.querySelector('[role=status]').textContent='Could not extend the session. Check your connection and save your work.';}};
 warning.addEventListener('cancel',event=>event.preventDefault());document.body.append(warning);warning.showModal();
}
supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')stopStudioSession();});
