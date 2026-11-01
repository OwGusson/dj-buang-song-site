import { getAdmin, json, readLimitedText } from '../_lib/security.js';
import { normalizeDestination, sanitizeCampaign, sanitizeReferrerHostname, sourceLabel, deviceGroup } from '../../shared/site-analytics.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_KEYS=new Set(['/','/#music','/#requests','/#merch','/#faq','/#privacy','/shared-song','/albums/global-barangay','/albums/buang-after-dark','/other-public-page']);

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
  try{body=JSON.parse(await readLimitedText(context.request,4096));}catch{return json({error:'Invalid analytics event'},400);}
  if(!body||!['page_view','outbound_click'].includes(body.eventType)||!UUID.test(body.eventId||'')||!UUID.test(body.sessionId||''))return json({error:'Invalid analytics event'},400);
  const pageKey=body.pageKey;
  if(typeof pageKey!=='string'||!PAGE_KEYS.has(pageKey))return json({error:'Invalid analytics page'},400);
  const destination=body.eventType==='outbound_click'?normalizeDestination(body.destination):null;
  if(body.eventType==='outbound_click'&&!destination)return json({error:'Invalid analytics destination'},400);
  const campaign=sanitizeCampaign(body.campaign||{});
  // Referer belongs to this same-origin API fetch; attribute from the page's
  // sanitized hostname only, never the incoming URL or its query string.
  const referrerDomain=sanitizeReferrerHostname(body.referrerDomain||'',new URL(context.request.url).hostname);
  const source=sourceLabel(campaign,referrerDomain);
  const countryHeader=context.request.cf?.country;
  const country=/^[A-Z]{2}$/.test(countryHeader||'')?countryHeader:'ZZ';
  const ua=context.request.headers.get('User-Agent')||'';
  const authorization=context.request.headers.get('Authorization');
  let admin=null;
  if(authorization?.startsWith('Bearer ')){
    try{admin=await getAdmin(context,false,false,false);}catch{return json({error:'Analytics is temporarily unavailable'},503);}
  }
  const trafficScope=admin?(body.qaMarker===true?'qa':'admin'):'public';
  const ip=context.request.headers.get('CF-Connecting-IP');
  const secret=context.env.INTERACTION_HASH_SECRET;
  const url=context.env.SUPABASE_URL||context.env.VITE_SUPABASE_URL;
  const serviceKey=context.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!ip||!secret||!url||!serviceKey)return json({error:'Analytics is not configured'},503);
  try{
    const actor=await actorHash(ip,secret);
    const response=await fetch(`${url.replace(/\/$/,'')}/rest/v1/rpc/record_site_analytics_event`,{
      method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        p_actor:actor,p_event_id:body.eventId,p_session_id:body.sessionId,p_event_type:body.eventType,
        p_page_key:pageKey,p_referrer_domain:referrerDomain,p_source_key:source,
        p_campaign_source:campaign.source,p_campaign_medium:campaign.medium,p_campaign_name:campaign.campaign,
        p_country_code:country,p_device_group:deviceGroup(ua),p_destination:destination,p_traffic_scope:trafficScope,
      }),signal:AbortSignal.timeout(8000),
    });
    if(response.status===429)return json({error:'Analytics rate limit reached'},429);
    if(!response.ok){const message=(await response.text()).slice(0,1000);return json({error:message.includes('Rate limit exceeded')?'Analytics rate limit reached':'Analytics event could not be stored'},message.includes('Rate limit exceeded')?429:503);}
    const result=await response.json();
    return json({recorded:result?.recorded===true,qa:trafficScope==='qa'});
  }catch{return json({error:'Analytics event could not be stored'},503);}
}
