import {getAdmin,json,readLimitedText} from '../_lib/security.js';
import {actorHash,verifyTurnstile} from '../_lib/contacts.js';
import {validateMerchInterest} from '../../shared/merch-interest.js';
export function merchConfig(env){return {enabled:env.CONTACTS_ENABLED==='true'&&Boolean((env.SUPABASE_URL||env.VITE_SUPABASE_URL)&&env.SUPABASE_SERVICE_ROLE_KEY&&env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET_KEY&&env.INTERACTION_HASH_SECRET),siteKey:env.TURNSTILE_SITE_KEY||'',testMode:env.CONTACT_TEST_MODE==='true'};}
async function rpc(env,name,body){const url=env.SUPABASE_URL||env.VITE_SUPABASE_URL;return fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}
export async function onRequestGet(context){try{
 const config=merchConfig(context.env);
 if(new URL(context.request.url).searchParams.get('summary')!=='1')return json(config);
 if(!await getAdmin(context))return json({error:'Administrator MFA sign-in required.'},401);
 if(!config.enabled)return json({error:'Merch interest is not enabled yet.'},503);
 const response=await rpc(context.env,'merch_interest_summary',{p_test:config.testMode});if(!response.ok)throw Error();return json(await response.json());
}catch{return json({error:'Merch interest results are temporarily unavailable.'},503);}}
export async function onRequestPost(context){try{
 const origin=context.request.headers.get('Origin');if(origin&&origin!==new URL(context.request.url).origin)return json({error:'Forbidden origin.'},403);
 const config=merchConfig(context.env);if(!config.enabled)return json({error:'This survey is not open yet.'},503);
 let raw,data;try{raw=JSON.parse(await readLimitedText(context.request,8192));data=validateMerchInterest(raw);}catch(error){return json({error:error instanceof RangeError?'Submission too large.':error.message},error instanceof RangeError?413:400);}
 if(!await verifyTurnstile(context,raw.turnstileToken))return json({error:'Please complete the bot check again.'},403);
 const response=await rpc(context.env,'merch_interest_submit',{p_id:data.id,p_actor:await actorHash(context,'merch'),p_collection:data.collection,p_currency:data.currency,p_choices:data.choices,p_test:config.testMode});
 if(response.ok)return json({success:true});const error=await response.json().catch(()=>({}));if(error.code==='P0001')return json({error:'Please wait before submitting again. Up to five responses per connection per day are allowed.'},429);if(['22023','22P02'].includes(error.code))return json({error:'Please check the submitted choices and prices.'},400);throw Error();
}catch{return json({error:'Your interest could not be saved. Please try again later.'},503);}}
