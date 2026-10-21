import {json} from '../_lib/security.js';
import {contactConfig,verifiedContactUser,readContactBody,actorHash,verifyTurnstile,contactRpc,contactResult} from '../_lib/contacts.js';
import {deliverContactNotifications} from '../_lib/contact-mail.js';
export async function onRequestGet(context){
 try{
   if(!contactConfig(context.env).enabled)return json({error:'Private conversations are not available yet.'},503);
   const user=await verifiedContactUser(context);if(!user)return json({error:'Verify your email to access your private conversations.'},401);
   const id=new URL(context.request.url).searchParams.get('id');
   if(id&&!/^[0-9a-f-]{36}$/i.test(id))return json({error:'Conversation unavailable.'},404);
   return contactResult(await contactRpc(context.env,{p_user:user.id,p_admin:user.admin,p_action:id?'detail':'list',p_data:id?{id}:{}}));
 }catch{return json({error:'Private conversations are temporarily unavailable.'},503);}
}
export async function onRequestPost(context){
 try{
   const origin=context.request.headers.get('Origin');
   if(origin&&origin!==new URL(context.request.url).origin)return json({error:'Forbidden origin.'},403);
   if(!contactConfig(context.env).enabled)return json({error:'Private conversations are not available yet.'},503);
   const user=await verifiedContactUser(context);if(!user)return json({error:'Verify your email before sending.'},401);
   let body;try{body=await readContactBody(context.request);}catch(error){return json({error:'Invalid or oversized submission.'},error instanceof RangeError?413:400);}
   if(!body||!['create','reply','consent','update','block','settings'].includes(body.action)||!body.data||typeof body.data!=='object'||Array.isArray(body.data))return json({error:'Invalid action.'},400);
   if(['update','block','settings'].includes(body.action)&&!user.admin)return json({error:'Administrator access required.'},403);
   if(!user.admin&&!await verifyTurnstile(context,body.turnstileToken))return json({error:'Please complete the bot check again.'},403);
   const allowed={create:['kind','title','body','nickname','publish_song','credit_name'],reply:['id','body'],consent:['id','publish_song','credit_name'],update:['id','status','linked_song_id'],block:['id','blocked'],settings:['pause_requests','pause_messages']}[body.action];
   const data=Object.fromEntries(allowed.filter(key=>body.data[key]!==undefined).map(key=>[key,body.data[key]]));
   for(const key of ['publish_song','credit_name','blocked','pause_requests','pause_messages'])if(data[key]!==undefined&&typeof data[key]!=='boolean')return json({error:'Invalid preference.'},400);
   if(body.action==='create')data.email=user.email;
   const result=await contactResult(await contactRpc(context.env,{p_user:user.id,p_admin:user.admin,p_action:body.action,p_data:data,p_actor:user.admin?null:await actorHash(context)}));
   if(result.ok&&user.admin&&body.action==='reply')context.waitUntil?.(deliverContactNotifications(context.env).catch(()=>{}));
   return result;
 }catch{return json({error:'Your message could not be sent. Please try again later.'},503);}
}
