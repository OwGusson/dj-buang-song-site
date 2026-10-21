import {getAdmin,json} from '../_lib/security.js';
import {deliverContactNotifications} from '../_lib/contact-mail.js';
export async function onRequestPost(context){
 try{
   const origin=context.request.headers.get('Origin');if(origin&&origin!==new URL(context.request.url).origin)return json({error:'Forbidden origin'},403);
   if(!await getAdmin(context))return json({error:'Administrator sign-in required'},401);
   return json(await deliverContactNotifications(context.env));
 }catch{return json({error:'Notifications could not be delivered. Conversations remain available in the inbox.'},503);}
}
