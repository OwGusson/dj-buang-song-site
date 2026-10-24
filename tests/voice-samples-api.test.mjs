import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet as read,onRequestPost as upload,onRequestDelete as remove} from '../functions/api/voice-samples.js';
const owner='11111111-1111-4111-8111-111111111111',sample='22222222-2222-4222-8222-222222222222';
const env={CONTACTS_ENABLED:'true',TURNSTILE_SITE_KEY:'public',TURNSTILE_SECRET_KEY:'secret',INTERACTION_HASH_SECRET:'hash',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only'};
const jwt=aal=>'e30.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.verified';
const consent={own_adult_voice:true,request_use:true,retention_30:true,future_use:false,keep_90_days:false};
const key='samples/'+sample+'.wav';
function context(method='GET',body,path='/api/voice-samples?id='+sample,aal='aal1'){return {env,request:new Request('https://dj-buang.com'+path,{method,headers:{Authorization:'Bearer '+jwt(aal),'CF-Connecting-IP':'192.0.2.1',...(method==='DELETE'?{'Content-Type':'application/json'}:{})},...(body?{body}:{} )})};}
function form(data={...consent,thread_id:owner}){const bytes=new Uint8Array(44);bytes.set(new TextEncoder().encode('RIFF'));bytes.set(new TextEncoder().encode('WAVE'),8);const f=new FormData();f.set('data',JSON.stringify(data));f.set('file',new File([bytes],'private-person-name.wav',{type:'audio/wav'}));f.set('turnstileToken','valid');return f;}
function mock(t,{user={id:owner,email:'listener@example.test',email_confirmed_at:'now',app_metadata:{}},denied=false,storeFail=false,captcha={}}={}){const calls=[];t.mock.method(globalThis,'fetch',async(url,options={})=>{
 calls.push({url,options});if(url.endsWith('/auth/v1/user'))return user?Response.json(user):new Response('',{status:401});if(url.includes('turnstile'))return Response.json({success:true,action:'contact',hostname:'dj-buang.com',...captcha});
 if(url.endsWith('/voice_dispatch')){const body=JSON.parse(options.body);if(denied)return Response.json({code:'42501'},{status:403});if(body.p_action==='complete')return Response.json({id:sample,expires_at:'2026-11-24'});return Response.json({id:sample,object_key:key,mime:'audio/wav',status:'active'});}
 if(url.endsWith('/contact_dispatch'))return Response.json({id:owner});
 if(url.includes('/storage/'))return storeFail?new Response('',{status:503}):new Response(new Uint8Array(44),{headers:{'Content-Type':'audio/wav'}});
 throw Error('Unexpected URL');});return calls;}

test('voice files require verified email, owner authorization, and administrator MFA',async t=>{
 let calls=mock(t,{user:null});assert.equal((await read(context())).status,401);assert.equal(calls.length,1);
 calls=mock(t,{user:{id:owner,email:'admin@example.test',email_confirmed_at:'now',app_metadata:{role:'admin'}}});assert.equal((await read(context())).status,401);assert.equal(calls.some(c=>c.url.includes('/storage/')),false);
 calls=mock(t,{denied:true});assert.equal((await read(context())).status,404);assert.equal(calls.some(c=>c.url.includes('/storage/')),false);
});
test('private voice upload validates permissions and bot checks before storage and returns no private key',async t=>{
 let calls=mock(t);assert.equal((await upload(context('POST',form({...consent,request_use:false,thread_id:owner})))).status,400);assert.equal(calls.some(c=>c.url.includes('/storage/')),false);
 calls=mock(t,{captcha:{hostname:'wrong.example'}});assert.equal((await upload(context('POST',form()))).status,403);assert.equal(calls.some(c=>c.url.includes('/storage/')),false);
 calls=mock(t);const response=await upload(context('POST',form()));assert.equal(response.status,201);const text=await response.text();assert.equal(text.includes(key),false);assert.equal(text.includes('server-only'),false);
 const reserve=calls.find(c=>c.url.endsWith('/voice_dispatch')&&JSON.parse(c.options.body).p_action==='reserve');assert.equal(JSON.parse(reserve.options.body).p_data.future_use,false);assert.equal(JSON.stringify(calls.filter(c=>c.url.endsWith('/voice_dispatch'))).includes('private-person-name'),false);
 const stored=calls.find(c=>c.url.includes('/storage/'));assert.equal(stored.url,'https://example.supabase.co/storage/v1/object/dj-buang-voices/'+key);assert.equal(stored.options.headers['x-upsert'],'false');
});
test('voice playback is proxied without cache and removal targets only the authorized object',async t=>{
 let calls=mock(t);const response=await read(context());assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 calls=mock(t);assert.equal((await remove(context('DELETE',JSON.stringify({id:sample,key:'arbitrary/other-file'})))).status,200);
 const deletion=calls.find(c=>c.url.includes('/storage/'));assert.deepEqual(JSON.parse(deletion.options.body),{prefixes:[key]});
 const actions=calls.filter(c=>c.url.endsWith('/voice_dispatch')).map(c=>JSON.parse(c.options.body).p_action);assert.deepEqual(actions,['remove','deleted']);
 const cross=context('DELETE',JSON.stringify({id:sample}));cross.request=new Request(cross.request,{headers:{Origin:'https://evil.example'}});assert.equal((await remove(cross)).status,403);
});
test('failed storage after request creation preserves the request and cleans the sample reservation',async t=>{
 const calls=mock(t,{storeFail:true});const response=await upload(context('POST',form({...consent,request:{kind:'request',title:'A song',body:'A short idea',nickname:'Listener',publish_song:false,credit_name:false}})));
 assert.equal(response.status,201);const data=await response.json();assert.equal(data.id,owner);assert.ok(data.voiceError);assert.equal(calls.filter(c=>c.url.endsWith('/contact_dispatch')).length,1);assert.ok(calls.some(c=>c.url.endsWith('/voice_dispatch')&&JSON.parse(c.options.body).p_action==='remove'));
});
