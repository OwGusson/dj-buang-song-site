import { json,readLimitedText } from './security.js';
export function contactConfig(env){
 return {enabled:env.CONTACTS_ENABLED==='true'&&Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY&&env.INTERACTION_HASH_SECRET&&env.SUPABASE_SERVICE_ROLE_KEY),siteKey:env.TURNSTILE_SITE_KEY||'',authCaptchaEnabled:env.AUTH_CAPTCHA_ENABLED==='true'};
}
export async function verifiedContactUser(context){
 const authorization=context.request.headers.get('Authorization');
 if(!authorization?.startsWith('Bearer '))return null;
 const url=context.env.SUPABASE_URL||context.env.VITE_SUPABASE_URL;
 const key=context.env.SUPABASE_PUBLISHABLE_KEY||context.env.SUPABASE_ANON_KEY||context.env.VITE_SUPABASE_PUBLISHABLE_KEY||context.env.VITE_SUPABASE_ANON_KEY;
 if(!url||!key)throw Error('Authentication unavailable');
 const result=await fetch(url.replace(/\/$/,'')+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization},signal:AbortSignal.timeout(10000)});
 if(result.status===401||result.status===403)return null;
 if(!result.ok)throw Error('Authentication unavailable');
 const user=await result.json();
 if(!user.id||!user.email||!user.email_confirmed_at||user.is_anonymous)return null;
 let claims;try{claims=JSON.parse(atob(authorization.slice(7).split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{return null;}
 const admin=user.app_metadata?.role==='admin';
 if(admin&&claims.aal!=='aal2')return null;
 return {id:user.id,email:user.email,admin};
}
export async function readContactBody(request){
 return JSON.parse(await readLimitedText(request,30000));
}
export async function actorHash(context){
 const ip=context.request.headers.get('CF-Connecting-IP');
 if(!ip||!context.env.INTERACTION_HASH_SECRET)throw Error('Client identity unavailable');
 const encoder=new TextEncoder();
 const key=await crypto.subtle.importKey('raw',encoder.encode(context.env.INTERACTION_HASH_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,encoder.encode('contacts:'+ip));
 return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function verifyTurnstile(context,token){
 if(typeof token!=='string'||!token||token.length>2048)return false;
 const body=new URLSearchParams({secret:context.env.TURNSTILE_SECRET_KEY,response:token});
 const ip=context.request.headers.get('CF-Connecting-IP');if(ip)body.set('remoteip',ip);
 const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Bot verification unavailable');
 const result=await response.json();
 return result.success===true&&result.action==='contact'&&result.hostname===new URL(context.request.url).hostname;
}
export async function contactRpc(env,body){
 const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;
 return fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/contact_dispatch',{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
}
export async function contactResult(response){
 if(response.ok)return json(await response.json());
 const error=await response.json().catch(()=>({}));
 if(error.code==='42501')return json({error:'Conversation unavailable or access denied.'},404);
 if(error.code==='55000')return json({error:'New submissions are paused. Please try again later.'},409);
 if(error.code==='22023'||error.code==='22P02')return json({error:'Please check the submitted information.'},400);
 if(error.code==='P0001')return json({error:'Your submission limit or cooldown was reached. You can have two active requests and start five conversations per day. Please wait before trying again.'},429);
 return json({error:'Conversations are temporarily unavailable.'},503);
}
