// Narrow server gateway: preserves database MFA policies; never accepts table/select SQL from clients.
import {getAdmin,json,readLimitedText} from '../_lib/security.js';
const tables={
 requests:['song_requests','id,created_at,requester_name,song_name,details,email,delivery,status,linked_song_id','created_at.desc'],
 messages:['private_messages','id,created_at,sender_name,sender_email,message,status','created_at.desc'],
 totals:['song_analytics','*','song_id'],
 events:['song_events','id,song_id,event_type,created_at','created_at,id'],
 likes:['song_likes','song_id,likes','song_id']
};
function headers(env){if(!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Studio data unavailable');return {apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};}
function base(env){return (env.SUPABASE_URL||env.VITE_SUPABASE_URL).replace(/\/$/,'')+'/rest/v1/';}
export async function onRequestGet(context){try{
 if(!await getAdmin(context))return json({error:'Administrator sign-in required'},401);
 const params=new URL(context.request.url).searchParams,kind=params.get('kind'),spec=tables[kind];
 const offset=Number(params.get('offset')||0);if(!spec || !Number.isInteger(offset)||offset<0||offset>50000)return json({error:'Invalid Studio query'},400);
 const query=new URLSearchParams({select:spec[1],order:spec[2],limit:'1000',offset:String(offset)});
 if(kind==='events'){
  const start=params.get('start'),end=params.get('end');
  if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(start)>=Date.parse(end))return json({error:'Invalid date range'},400);
  query.append('created_at','gte.'+new Date(start).toISOString());query.append('created_at','lt.'+new Date(end).toISOString());
 }
 const result=await fetch(base(context.env)+spec[0]+'?'+query,{headers:headers(context.env),signal:AbortSignal.timeout(10000)});
 return result.ok?json(await result.json()):json({error:'Studio data could not be loaded'},503);
}catch{return json({error:'Studio data temporarily unavailable'},503);}}
export async function onRequestPost(context){try{
 const origin=context.request.headers.get('Origin');if(origin&&origin!==new URL(context.request.url).origin)return json({error:'Forbidden origin'},403);
 if(!await getAdmin(context))return json({error:'Administrator sign-in required'},401);
 const body=JSON.parse(await readLimitedText(context.request,2048)),spec=tables[body.kind];
 if(!['requests','messages'].includes(body.kind)||!/^([0-9]+|[0-9a-f-]{36})$/i.test(String(body.id)))return json({error:'Invalid inbox item'},400);
 const allowed=body.kind==='requests'?['pending','done']:['new','read'];const patch={};
 if(body.patch?.status!==undefined){if(!allowed.includes(body.patch.status))return json({error:'Invalid status'},400);patch.status=body.patch.status;}
 if(body.kind==='requests'&&body.patch?.linked_song_id!==undefined){if(typeof body.patch.linked_song_id!=='string'||body.patch.linked_song_id.length>150)return json({error:'Invalid song'},400);patch.linked_song_id=body.patch.linked_song_id;}
 if(!Object.keys(patch).length)return json({error:'No supported change'},400);
 const query=new URLSearchParams({id:'eq.'+body.id,select:'id'});
 const result=await fetch(base(context.env)+spec[0]+'?'+query,{method:'PATCH',headers:{...headers(context.env),'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(patch),signal:AbortSignal.timeout(10000)});
 if(!result.ok || (await result.json()).length!==1)return json({error:'Inbox item could not be updated'},409);
 return json({success:true});
}catch{return json({error:'Studio data temporarily unavailable'},503);}}
