import {VOICE_BUCKET} from '../../shared/voice-samples.js';
export function voiceHeaders(env){return {apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};}
export function voiceBase(env){return (env.SUPABASE_URL||env.VITE_SUPABASE_URL).replace(/\/$/,'');}
export async function voiceRpc(env,user,action,data={}){
 const response=await fetch(voiceBase(env)+'/rest/v1/rpc/voice_dispatch',{method:'POST',headers:{...voiceHeaders(env),'Content-Type':'application/json'},body:JSON.stringify({p_user:user.id,p_admin:user.admin,p_action:action,p_data:data}),signal:AbortSignal.timeout(10000)});
 if(!response.ok){const err=await response.json().catch(()=>({}));const failure=Error(err.code==='P0001'?'One stored recording per request and three uploads per day are allowed.':'Voice sample unavailable or permission denied.');failure.status=err.code==='P0001'?429:err.code==='22023'?400:404;throw failure;}
 return response.json();
}
export async function removeVoiceObject(env,key){
 if(!key)return;if(!/^samples\/[0-9a-f-]{36}\.(wav|mp3|m4a)$/.test(key))throw Error('Invalid private object key');
 const response=await fetch(voiceBase(env)+'/storage/v1/object/'+VOICE_BUCKET,{method:'DELETE',headers:{...voiceHeaders(env),'Content-Type':'application/json'},body:JSON.stringify({prefixes:[key]}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('Stored recording could not be removed. Cleanup will retry.');
}
