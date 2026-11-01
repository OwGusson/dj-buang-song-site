import { getAdmin, isPublicSong, json, readLimitedText, readSongs } from '../_lib/security.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NEW_EVENTS=new Set(['song_detail_open','play_start','play_25','play_50','play_75','play_finished','download_song','download_lyrics']);

async function actorHash(ip,secret){
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=await crypto.subtle.sign('HMAC',key,encoder.encode(ip));
  return [...new Uint8Array(signature)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

export async function onRequestPost(context){
  const origin=context.request.headers.get('Origin');
  if(origin&&origin!==new URL(context.request.url).origin)return json({error:'Forbidden origin'},403);
  if(Number(context.request.headers.get('Content-Length'))>4096)return json({error:'Request too large'},413);
  let body;
  try{body=JSON.parse(await readLimitedText(context.request,4096));}catch{return json({error:'Invalid interaction'},400);}
  if(!body||typeof body.songId!=='string'||!['like','open',...NEW_EVENTS].includes(body.eventType))return json({error:'Invalid interaction'},400);
  const songs=await readSongs(context.env);
  if(!songs.some(song=>song.id===body.songId&&isPublicSong(song,context.env)))return json({error:'Song not found'},404);
  const ip=context.request.headers.get('CF-Connecting-IP'),secret=context.env.INTERACTION_HASH_SECRET;
  const url=context.env.SUPABASE_URL||context.env.VITE_SUPABASE_URL,key=context.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!ip||!secret||!url||!key)return json({error:'Interactions not configured'},503);
  try{
    const actor=await actorHash(ip,secret);
    // Likes and compatibility events preserve the original deduplicated legacy path.
    if(body.eventType==='like'||body.eventType==='open'){
      const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/record_interaction`,{
        method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({p_song_id:body.songId,p_event_type:body.eventType,p_actor:actor}),signal:AbortSignal.timeout(10000),
      });
      if(!response.ok)return json({error:'Interaction could not be saved'},response.status===400?429:503);
      return json(await response.json());
    }
    if(!UUID.test(body.eventId||'')||!UUID.test(body.sessionId||''))return json({error:'Invalid playback session'},400);
    const playbackType=['play_start','play_25','play_50','play_75','play_finished'].includes(body.eventType);
    if(playbackType&&!UUID.test(body.playbackId||''))return json({error:'Invalid playback'},400);
    const duration=body.durationSeconds===undefined?null:body.durationSeconds;
    const listened=body.listenedSeconds===undefined?null:body.listenedSeconds;
    if(duration!==null&&(!Number.isInteger(duration)||duration<1||duration>86400))return json({error:'Invalid duration'},400);
    if(listened!==null&&(!Number.isInteger(listened)||listened<0||listened>86400))return json({error:'Invalid listening time'},400);
    let admin=null;
    if(context.request.headers.get('Authorization')?.startsWith('Bearer ')){
      // Admin status here only marks internal telemetry; it does not authorize a user action.
      try{admin=await getAdmin(context,false,false,false);}catch{return json({error:'Analytics is temporarily unavailable'},503);}
    }
    const trafficScope=admin?(body.qaMarker===true?'qa':'admin'):'public';
    const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/record_song_analytics_event`,{
      method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_actor:actor,p_song_id:body.songId,p_event_id:body.eventId,p_session_id:body.sessionId,p_playback_id:playbackType?body.playbackId:null,p_event_type:body.eventType,p_duration_seconds:duration,p_listened_seconds:listened,p_traffic_scope:trafficScope}),
      signal:AbortSignal.timeout(10000),
    });
    if(!response.ok){const message=(await response.text()).slice(0,1000);return json({error:message.includes('Rate limit exceeded')?'Interaction rate limit reached':'Interaction could not be saved'},message.includes('Rate limit exceeded')?429:503);}
    return json(await response.json());
  }catch{return json({error:'Interaction could not be saved'},503);}
}
