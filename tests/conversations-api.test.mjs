import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequestGet as read,onRequestPost as write} from '../functions/api/conversations.js';
import {deliverContactNotifications} from '../functions/_lib/contact-mail.js';
const id='11111111-1111-4111-8111-111111111111';
const jwt=aal=>'e30.'+Buffer.from(JSON.stringify({aal})).toString('base64url')+'.validated-by-auth';
function ctx(data={action:'create',data:{kind:'message',title:'Hello',body:'Private message',nickname:'Listener'},turnstileToken:'valid'}){
 return {request:new Request('https://dj-buang.com/api/conversations',{method:'POST',headers:{Authorization:'Bearer '+jwt('aal1'),'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(data)}),env:{CONTACTS_ENABLED:'true',TURNSTILE_SITE_KEY:'public',TURNSTILE_SECRET_KEY:'secret',INTERACTION_HASH_SECRET:'hash-secret',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-only'}};
}
function mock(t,{user={id,email:'listener@example.test',email_confirmed_at:'2026-10-21',app_metadata:{}},captcha={},rpc=Response.json({ok:true})}={}){
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{
   if(url.endsWith('/auth/v1/user'))return user?Response.json(user):new Response('',{status:401});
   if(url.includes('turnstile'))return Response.json({success:true,action:'contact',hostname:'dj-buang.com',...captcha});
   calls.push(JSON.parse(options.body));return rpc;
 });return calls;
}
test('anonymous, unverified and anonymous-auth users cannot access conversations',async t=>{
 for(const user of [null,{id,email:'x@example.test'},{id,email:'x@example.test',email_confirmed_at:'now',is_anonymous:true}]){
   mock(t,{user});const c=ctx();c.request=new Request('https://dj-buang.com/api/conversations',{headers:{Authorization:'Bearer '+jwt('aal1')}});assert.equal((await read(c)).status,401);
 }
});
test('spoofed owner, email and administrator fields never reach the database',async t=>{
 const calls=mock(t);const c=ctx({action:'create',data:{kind:'message',title:'Hi',body:'Text',nickname:'Name',email:'victim@example.test',owner_id:'victim',p_admin:true},turnstileToken:'valid'});
 assert.equal((await write(c)).status,200);assert.equal(calls[0].p_user,id);assert.equal(calls[0].p_admin,false);assert.equal(calls[0].p_data.email,'listener@example.test');assert.equal(calls[0].p_data.owner_id,undefined);assert.match(calls[0].p_actor,/^[0-9a-f]{64}$/);assert.equal(JSON.stringify(calls).includes('192.0.2.1'),false);
});
test('invalid, replay-rejected, wrong-host and wrong-action bot checks prevent database writes',async t=>{
 for(const captcha of [{success:false},{hostname:'other.example'},{action:'different'}]){const calls=mock(t,{captcha});assert.equal((await write(ctx())).status,403);assert.equal(calls.length,0);}
});
test('administrator user_metadata cannot grant moderation powers',async t=>{
 const calls=mock(t,{user:{id,email:'a@example.test',email_confirmed_at:'now',user_metadata:{role:'admin'}}});assert.equal((await write(ctx({action:'settings',data:{pause_requests:true}}))).status,403);assert.equal(calls.length,0);
});
test('password-only administrators cannot use the conversation endpoint',async t=>{
 mock(t,{user:{id,email:'admin@example.test',email_confirmed_at:'now',app_metadata:{role:'admin'}}});assert.equal((await write(ctx())).status,401);
});
test('verified MFA administrator can reply without bypassing listener authentication',async t=>{
 const calls=mock(t,{user:{id,email:'admin@example.test',email_confirmed_at:'now',app_metadata:{role:'admin'}}});const c=ctx({action:'reply',data:{id,body:'Artist reply'}});c.request=new Request(c.request,{headers:{Authorization:'Bearer '+jwt('aal2'),'Content-Type':'application/json'}});assert.equal((await write(c)).status,200);assert.equal(calls[0].p_admin,true);assert.equal(calls[0].p_actor,null);
});
test('cross-origin, oversized and missing-edge-identity requests fail closed',async t=>{
 mock(t);const c=ctx();c.request=new Request(c.request,{headers:{Origin:'https://evil.example'}});assert.equal((await write(c)).status,403);
 const huge=ctx({action:'create',data:{body:'x'.repeat(31000)}});assert.equal((await write(huge)).status,413);
 const noIp=ctx();noIp.request=new Request(noIp.request,{headers:{Authorization:'Bearer '+jwt('aal1'),'Content-Type':'application/json'}});assert.equal((await write(noIp)).status,503);
});
test('database rate-limit failures are returned as cooldowns',async t=>{
 mock(t,{rpc:Response.json({code:'P0001',message:'Internal SQL details'},{status:400})});const result=await write(ctx());assert.equal(result.status,429);assert.equal((await result.text()).includes('Internal SQL'),false);
});
test('feature stays unavailable until all server configuration is present',async()=>{
 const c=ctx();delete c.env.TURNSTILE_SECRET_KEY;assert.equal((await write(c)).status,503);
});
test('notification emails exclude private message contents and use only queued recipients',async t=>{
 let email;const calls=[];t.mock.method(globalThis,'fetch',async(_url,options)=>{const body=JSON.parse(options.body);calls.push(body);return Response.json(body.p_action==='claim'?[{id,recipient:'listener@example.test',thread_id:id}]:{ok:true});});
 const result=await deliverContactNotifications({...ctx().env,CONTACT_EMAIL_FROM:'no-reply@dj-buang.com',EMAIL:{send:async message=>email=message}});
 assert.equal(result.sent,1);assert.equal(email.to,'listener@example.test');assert.match(email.text,/https:\/\/dj-buang.com\/\?inbox=1/);assert.equal(email.text.includes('Private message'),false);assert.equal(calls[1].p_action,'sent');
});

test('Resend delivery uses queued recipients and a stable idempotency key before acknowledging the job',async t=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
   const body=JSON.parse(options.body);calls.push({url,body,headers:options.headers});
   return Response.json(url==='https://api.resend.com/emails'?{id:'receipt'}:body.p_action==='claim'?[{id,recipient:'listener@example.test'}]:{ok:true});
 });
 const result=await deliverContactNotifications({...ctx().env,CONTACT_EMAIL_FROM:'DJ-Buang <no-reply@mail.dj-buang.com>',RESEND_API_KEY:'synthetic-test-key'});
 assert.deepEqual(result,{enabled:true,sent:1});
 const delivery=calls.find(call=>call.url==='https://api.resend.com/emails');
 assert.equal(delivery.headers['Idempotency-Key'],'contact-notification-'+id);
 assert.equal(delivery.headers.Authorization,'Bearer synthetic-test-key');
 assert.equal(delivery.body.to,'listener@example.test');
 assert.match(delivery.body.text,/message contents are not included/);
 assert.equal(calls.at(-1).body.p_action,'sent');
});

test('Resend failures keep the notification retryable instead of acknowledging delivery',async t=>{
 const actions=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
   if(url==='https://api.resend.com/emails')return new Response('Provider unavailable',{status:503});
   const body=JSON.parse(options.body);actions.push(body.p_action);
   return Response.json(body.p_action==='claim'?[{id,recipient:'listener@example.test'}]:{ok:true});
 });
 const result=await deliverContactNotifications({...ctx().env,CONTACT_EMAIL_FROM:'no-reply@mail.dj-buang.com',RESEND_API_KEY:'synthetic-test-key'});
 assert.deepEqual(result,{enabled:true,sent:0});assert.deepEqual(actions,['claim','failed']);
});


test('restricted test mode denies non-allowlisted and empty-allowlist listeners',async t=>{
 const calls=mock(t);const c=ctx();c.env.CONTACT_TEST_MODE='true';
 for(const allowed of ['', 'someone@example.test']){c.env.CONTACT_TEST_EMAILS=allowed;assert.equal((await write(c)).status,401);}
 assert.equal(calls.length,0);
 c.env.CONTACT_TEST_EMAILS='LISTENER@example.test';assert.equal((await write(c)).status,200);
});
test('restricted test notifications reject a public or missing inbox URL before claiming jobs',async t=>{
 const calls=mock(t);await assert.rejects(()=>deliverContactNotifications({...ctx().env,CONTACT_TEST_MODE:'true',RESEND_API_KEY:'synthetic',CONTACT_EMAIL_FROM:'test@example.test'}));assert.equal(calls.length,0);
});
