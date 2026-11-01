import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createSiteEventPayload, deviceGroup, firstEntryAttribution, normalizePageKey, sanitizeReferrerHostname, sourceLabel } from '../shared/site-analytics.js';
import { onRequestPost } from '../functions/api/site-analytics.js';
import { onRequestPost as recordSongEvent } from '../functions/api/interactions.js';

test('external Instagram attribution survives same-site navigation and API referrer', async () => {
  globalThis.crypto ||= webcrypto;
  const entries=new Map();
  const storage={getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value)};
  const sessionId='4bb6a3a4-13bf-45d7-98bc-d548c49d8e8e';
  const first=firstEntryAttribution({sessionId,documentReferrer:'https://l.instagram.com/?u=https%3A%2F%2Fdj-buang.com%2F%3Fsecret%3Dhidden',search:'',hostname:'dj-buang.com',storage});
  assert.deepEqual(first,{referrerDomain:'l.instagram.com',campaign:{source:null,medium:null,campaign:null}});

  const afterNavigation=firstEntryAttribution({sessionId,documentReferrer:'https://dj-buang.com/albums/global-barangay?private=ignored',search:'',hostname:'dj-buang.com',storage});
  assert.deepEqual(afterNavigation,first);

  let rpc;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url,init)=>{
    assert.match(String(url),/record_site_analytics_event$/);
    rpc=JSON.parse(init.body);
    return new Response(JSON.stringify({recorded:true}),{status:200});
  };
  try {
    const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service-key',INTERACTION_HASH_SECRET:'test-secret'};
    const eventPayload=createSiteEventPayload('page_view',{pageKey:'/',referrerDomain:afterNavigation.referrerDomain,campaign:afterNavigation.campaign},{sessionId,eventId:'f3e0bcb2-2da6-4d2f-ad60-807d28576169'});
    const request=new Request('https://dj-buang.com/api/site-analytics',{
      method:'POST',headers:{Origin:'https://dj-buang.com',Referer:'https://dj-buang.com/', 'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.9','User-Agent':'Mozilla/5.0 (iPhone) Mobile'},body:JSON.stringify(eventPayload),
    });
    const response=await onRequestPost({request,env});
    assert.equal(response.status,200);
    assert.equal(rpc.p_referrer_domain,'l.instagram.com');
    assert.equal(rpc.p_source_key,'instagram');
    assert.equal(JSON.stringify(rpc).includes('secret'),false);
  } finally { globalThis.fetch=originalFetch; }
});

test('Suno Global Barangay launch UTMs survive first entry and remain allowlisted', () => {
  const entries=new Map();
  const storage={getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value)};
  const attribution=firstEntryAttribution({sessionId:'b21f2ceb-17ce-46e8-9fbd-f1a2d2938b33',documentReferrer:'',search:'?utm_source=suno&utm_medium=post&utm_campaign=global-barangay-launch',hostname:'dj-buang.com',storage});
  assert.deepEqual(attribution,{referrerDomain:null,campaign:{source:'suno',medium:'post',campaign:'global-barangay-launch'}});
});

test('referrer payload accepts only a hostname and normalizes social hosts',()=>{
  assert.equal(sanitizeReferrerHostname('m.facebook.com','dj-buang.com'),'m.facebook.com');
  assert.equal(sourceLabel({source:null},'m.facebook.com'),'facebook');
  assert.equal(sourceLabel({source:null},'l.instagram.com'),'instagram');
  assert.equal(sanitizeReferrerHostname('https://instagram.com/path?private=1','dj-buang.com'),null);
  assert.equal(sanitizeReferrerHostname('www.dj-buang.com','dj-buang.com'),null);
  assert.equal(normalizePageKey('/','','?inbox=1'),null);
  assert.equal(normalizePageKey('/studio'),null);
  assert.equal(deviceGroup('Mozilla/5.0 (Linux; Android 15)'),'tablet');
  assert.equal(deviceGroup('Mozilla/5.0 (Linux; Android 15; Mobile)'),'mobile');
});

test('new public song-detail analytics use the versioned RPC and public scope',async()=>{
  globalThis.crypto ||= webcrypto;
  let rpc;const originalFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>{
    assert.match(String(url),/record_song_analytics_event$/);
    rpc=JSON.parse(init.body);
    return new Response(JSON.stringify({recorded:true}),{status:200});
  };
  try{
    const request=new Request('https://dj-buang.com/api/interactions',{
      method:'POST',headers:{Origin:'https://dj-buang.com','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.10'},
      body:JSON.stringify({songId:'buang-after-dark',eventType:'song_detail_open',eventId:'7719224c-6a41-4eba-991e-e347711b32a5',sessionId:'4bb6a3a4-13bf-45d7-98bc-d548c49d8e8e'}),
    });
    const response=await recordSongEvent({request,env:{FILES:{get:async()=>null},SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service-key',INTERACTION_HASH_SECRET:'test-secret'}});
    assert.equal(response.status,200);
    assert.equal(rpc.p_event_type,'song_detail_open');
    assert.equal(rpc.p_traffic_scope,'public');
    assert.equal(rpc.p_playback_id,null);
    assert.match(rpc.p_actor,/^[0-9a-f]{64}$/);
  }finally{globalThis.fetch=originalFetch;}
});
