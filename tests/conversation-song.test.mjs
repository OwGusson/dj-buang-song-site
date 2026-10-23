import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/conversation-song.js';
const id='11111111-1111-4111-8111-111111111111', otherId='22222222-2222-4222-8222-222222222222';
const origin='https://preview.example';
const token=(sub='owner',aal='aal1')=>'e30.'+Buffer.from(JSON.stringify({sub,aal})).toString('base64url')+'.signature';
function fixture(t){
  const state={role:'listener',thread:{id,kind:'request',status:'done',linked_song_id:'private-song',blocked:false},song:{id:'private-song',title:'Private delivery',artist:'DJ-Buang',visibility:'private',status:'published',audioUrl:'https://dj-buang.com/files/private.mp3',coverUrl:'https://dj-buang.com/files/private.png'},reads:[],range:false};
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(url.endsWith('/auth/v1/user')){const claims=JSON.parse(Buffer.from(options.headers.Authorization.slice(7).split('.')[1],'base64url'));return Response.json({id:claims.sub,email:'listener@example.com',email_confirmed_at:'2026-01-01',app_metadata:{role:state.role}});}
    const body=JSON.parse(options.body);assert.equal(body.p_action,'detail');
    if(body.p_user!=='owner'||body.p_data.id!==id)return Response.json({code:'42501'},{status:403});
    return Response.json({thread:state.thread,posts:[]});
  });
  const env={CONTACTS_ENABLED:'true',TURNSTILE_SITE_KEY:'test',TURNSTILE_SECRET_KEY:'test',INTERACTION_HASH_SECRET:'test',SUPABASE_SERVICE_ROLE_KEY:'server-only-test',SUPABASE_ANON_KEY:'test',SUPABASE_URL:'https://auth.example',GLOBAL_BARANGAY_RELEASED:'false',FILES:{async get(key){state.reads.push(key);if(key==='data/songs.json')return {text:async()=>JSON.stringify([state.song])};if(key==='private.mp3'||key==='private.png')return {body:'test',size:4,httpMetadata:{contentType:key.endsWith('.mp3')?'audio/mpeg':'image/png'},...(state.range?{range:{offset:0,length:4}}:{})};return null;}}};
  const context=(asset='info',sub='owner',threadId=id)=>({env,request:new Request(origin+'/api/conversation-song?'+new URLSearchParams({id:threadId,asset}),{headers:sub?{Authorization:'Bearer '+token(sub)}:{}})});
  return {state,env,context};
}
test('only the verified conversation owner can read linked private metadata or audio',async t=>{
  const {state,context}=fixture(t);
  for(const asset of ['info','audio','cover']){
    assert.equal((await onRequestGet(context(asset,null))).status,404);
    assert.equal((await onRequestGet(context(asset,'other'))).status,404);
    assert.equal((await onRequestGet(context(asset,'owner',otherId))).status,404);
  }
  assert.equal(state.reads.length,0);
  const result=await onRequestGet(context());assert.equal(result.status,200);const body=await result.json();assert.equal(body.title,'Private delivery');assert.equal(body.audioUrl,undefined);assert.equal(body.id,undefined);
  const audio=await onRequestGet(context('audio'));assert.equal(audio.status,200);assert.equal(audio.headers.get('Cache-Control'),'no-store');assert.equal(await audio.text(),'test');
});
test('draft, blocked, incomplete, non-request and unreleased album links never deliver audio',async t=>{
  const {state,context}=fixture(t);
  for(const patch of [{status:'pending'},{status:'in_progress'},{kind:'message'},{linked_song_id:null},{blocked:true}]){
    const old={...state.thread};Object.assign(state.thread,patch);assert.equal((await onRequestGet(context('audio'))).status,404);state.thread=old;
  }
  for(const patch of [{status:'draft'},{status:'hidden'},{albumId:'global-barangay'},{audioUrl:'https://evil.example/files/private.mp3'},{audioUrl:'https://dj-buang.com/files/data/songs.json'}]){
    const old={...state.song};Object.assign(state.song,patch);assert.equal((await onRequestGet(context('audio'))).status,404);state.song=old;
  }
});
test('test allowlist, service disablement and administrator MFA are enforced',async t=>{
  const {state,env,context}=fixture(t);
  env.CONTACTS_ENABLED='false';assert.equal((await onRequestGet(context())).status,404);env.CONTACTS_ENABLED='true';
  env.CONTACT_TEST_MODE='true';env.CONTACT_TEST_EMAILS='different@example.com';assert.equal((await onRequestGet(context())).status,404);
  env.CONTACT_TEST_EMAILS='listener@example.com';assert.equal((await onRequestGet(context())).status,200);
  state.role='admin';assert.equal((await onRequestGet(context())).status,404);
});
test('only the linked file is served, including protected cover and range headers',async t=>{
  const {state,context}=fixture(t);state.range=true;
  const audio=await onRequestGet(context('audio'));assert.equal(audio.status,206);assert.equal(audio.headers.get('Content-Range'),'bytes 0-3/4');assert.equal(audio.headers.get('Content-Disposition'),'inline');
  assert.equal((await onRequestGet(context('cover'))).headers.get('Content-Type'),'image/png');
  assert.equal((await onRequestGet(context('arbitrary-file'))).status,404);
  assert.ok(state.reads.every(key=>['data/songs.json','private.mp3','private.png'].includes(key)));
});
