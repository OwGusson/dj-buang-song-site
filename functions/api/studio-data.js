// Narrow server gateway: preserves database MFA policies; never accepts table/select SQL from clients.
import {getAdmin,json,readLimitedText,readSongs,isPublicSong} from '../_lib/security.js';
const tables={
 requests:['song_requests','id,created_at,requester_name,song_name,details,email,delivery,status,linked_song_id','created_at.desc'],
 messages:['private_messages','id,created_at,sender_name,sender_email,message,status','created_at.desc'],
 totals:['song_analytics','*','song_id'],
 events:['song_events','id,song_id,event_type,created_at,measurement_version,traffic_scope','created_at,id'],
 likes:['song_likes','song_id,likes','song_id']
};
function headers(env){if(!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Studio data unavailable');return {apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY};}
function base(env){return (env.SUPABASE_URL||env.VITE_SUPABASE_URL).replace(/\/$/,'')+'/rest/v1/';}
async function audienceSummary(context,start,end,includeQA=false){
 const songs=await readSongs(context.env),publicSongs=songs.filter(song=>isPublicSong(song,context.env)),songById=new Map(publicSongs.map(song=>[song.id,song]));
 const actorCounts=new Map(),songActors=new Map(),daily=new Map(),hours=new Map();
 const query=new URLSearchParams({select:'song_id,session_id,created_at',event_type:'eq.play_start',measurement_version:'eq.2',traffic_scope:includeQA?'in.(public,qa)':'eq.public',created_at:`gte.${new Date(start).toISOString()}`,order:'created_at,id',limit:'1000'});
 query.append('created_at',`lt.${new Date(end).toISOString()}`);
 for(let offset=0;offset<50000;offset+=1000){
  const pageQuery=new URLSearchParams(query);pageQuery.set('offset',String(offset));
  const result=await fetch(base(context.env)+'song_events?'+pageQuery,{headers:headers(context.env),signal:AbortSignal.timeout(10000)});
  if(!result.ok)throw Error('Audience estimates could not be loaded');
  const rows=await result.json();if(!Array.isArray(rows))throw Error('Audience estimates could not be loaded');
  for(const event of rows){
   if(!songById.has(event.song_id)||!/^[0-9a-f-]{36}$/i.test(event.session_id||''))continue;
   actorCounts.set(event.session_id,(actorCounts.get(event.session_id)||0)+1);
   if(!songActors.has(event.song_id))songActors.set(event.song_id,new Set());
   songActors.get(event.song_id).add(event.session_id);
   const time=new Date(event.created_at);if(!Number.isFinite(+time))continue;
   const day=time.toISOString().slice(0,10),hour=time.getUTCHours();daily.set(day,(daily.get(day)||0)+1);hours.set(hour,(hours.get(hour)||0)+1);
  }
  if(rows.length<1000)return summarize();
 }
 throw Error('Too much audience data to load. Choose a shorter period.');
 function summarize(){
  const peak=map=>[...map].sort((a,b)=>b[1]-a[1])[0]||null;
  const peakDay=peak(daily),peakHour=peak(hours),albums=new Map();
  for(const song of publicSongs.filter(item=>item.albumId&&item.albumTrackNumber!==null&&item.albumTrackNumber!==undefined&&Number.isFinite(Number(item.albumTrackNumber))&&Number(item.albumTrackNumber)>0)){
   if(!albums.has(song.albumId))albums.set(song.albumId,[]);albums.get(song.albumId).push(song);
  }
  const albumJourney=[...albums].map(([id,tracks])=>{
   tracks.sort((a,b)=>Number(a.albumTrackNumber)-Number(b.albumTrackNumber));
   const firstSet=songActors.get(tracks[0].id)||new Set(),cohortSize=firstSet.size;let reached=new Set(firstSet);
   const progress=tracks.map((song,index)=>{
    if(index>0){const listeners=songActors.get(song.id)||new Set();reached=new Set([...reached].filter(actor=>listeners.has(actor)));}
    return {songId:song.id,title:song.title,trackNumber:Number(song.albumTrackNumber),listeners:reached.size,rate:cohortSize?Math.round(reached.size/cohortSize*100):0};
   });
   return {id,title:id==='global-barangay'?'Global Barangay':id,cohortSize,tracks:progress};
  });
  return {uniqueListeners:actorCounts.size,returningListeners:[...actorCounts.values()].filter(count=>count>1).length,trackListeners:Object.fromEntries([...songActors].map(([id,actors])=>[id,actors.size])),peakDay:peakDay?{day:peakDay[0],plays:peakDay[1]}:null,peakHour:peakHour?{hour:peakHour[0],plays:peakHour[1]}:null,albumJourney};
 }
}
export async function onRequestGet(context){try{
 if(!await getAdmin(context))return json({error:'Administrator sign-in required'},401);
 const params=new URL(context.request.url).searchParams,kind=params.get('kind');
 if(kind==='audience'){
  const start=params.get('start'),end=params.get('end');
  if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(start)>=Date.parse(end))return json({error:'Invalid date range'},400);
  if(Date.parse(end)-Date.parse(start)>91*86400000)return json({error:'Choose a date range of 90 days or less.'},400);
  return json(await audienceSummary(context,start,end,params.get('includeQA')==='1'));
 }
 if(kind==='site'){
  const start=params.get('start'),end=params.get('end');
  if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(start)>=Date.parse(end))return json({error:'Invalid date range'},400);
  if(Date.parse(end)-Date.parse(start)>91*86400000)return json({error:'Choose a date range of 90 days or less.'},400);
  const response=await fetch(base(context.env)+'rpc/read_site_analytics',{
   method:'POST',headers:{...headers(context.env),'Content-Type':'application/json'},
   body:JSON.stringify({p_start:new Date(start).toISOString(),p_end:new Date(end).toISOString(),p_include_qa:params.get('includeQA')==='1'}),
   signal:AbortSignal.timeout(10000),
  });
  return response.ok?json(await response.json()):json({error:'Website analytics could not be loaded'},503);
 }
 const spec=tables[kind];
 const offset=Number(params.get('offset')||0);if(!spec || !Number.isInteger(offset)||offset<0||offset>50000)return json({error:'Invalid Studio query'},400);
 const query=new URLSearchParams({select:spec[1],order:spec[2],limit:'1000',offset:String(offset)});
 if(kind==='events'){
  const start=params.get('start'),end=params.get('end');
  if(!start||!end||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(start)>=Date.parse(end))return json({error:'Invalid date range'},400);
  query.append('created_at','gte.'+new Date(start).toISOString());query.append('created_at','lt.'+new Date(end).toISOString());
  query.set('measurement_version','eq.2');
  query.set('traffic_scope',params.get('includeQA')==='1'?'in.(public,qa)':'eq.public');
  query.set('limit','1000');
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
