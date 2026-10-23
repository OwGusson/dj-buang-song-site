import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {merchOptions,validateMerchInterest} from '../shared/merch-interest.js';
import {onRequestGet,onRequestPost} from '../functions/api/merch-interest.js';
const id='11111111-1111-4111-8111-111111111111',origin='https://preview.example';
const payload={id,collection:'global-barangay',currency:'EUR',confirmed:true,choices:[{design:'night',item:'hoodie',price:45}]};
function context(body=payload){return {request:new Request(origin+'/api/merch-interest',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:JSON.stringify({...body,turnstileToken:'synthetic-token'})}),env:{CONTACTS_ENABLED:'true',CONTACT_TEST_MODE:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'synthetic-publishable',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',TURNSTILE_SITE_KEY:'synthetic-site',TURNSTILE_SECRET_KEY:'synthetic-secret',INTERACTION_HASH_SECRET:'synthetic-hash'}};}
test('survey validation bounds prices and allowlists selections without names or email',()=>{
 assert.equal(merchOptions('original').length,8);assert.equal(merchOptions('global-barangay').length,9);
 assert.deepEqual(validateMerchInterest({...payload,email:'ignored',choices:[{design:'night',item:'hoodie',price:null}]}).choices,[{design:'night',item:'hoodie',price:null}]);
 for(const patch of [{confirmed:false},{choices:[]},{currency:'XXX'},{choices:[...payload.choices,...payload.choices]},{choices:[{design:'night',item:'tote',price:4}]},{choices:[{design:'night',item:'hoodie',price:-1}]},{choices:[{design:'night',item:'hoodie',price:1.111}]},{choices:[{design:'night',item:'hoodie',price:10001}]},{website:'spam'}])assert.throws(()=>validateMerchInterest({...payload,...patch}));
});
test('survey config is public but summary requires verified administrator MFA',async t=>{
 const c=context();c.request=new Request(origin+'/api/merch-interest');const config=await (await onRequestGet(c)).json();assert.equal(config.enabled,true);assert.equal(config.siteKey,'synthetic-site');assert.equal(config.INTERACTION_HASH_SECRET,undefined);
 c.request=new Request(origin+'/api/merch-interest?summary=1');assert.equal((await onRequestGet(c)).status,401);
 t.mock.method(globalThis,'fetch',async()=>Response.json({id:'admin',app_metadata:{role:'admin'}}));c.request=new Request(origin+'/api/merch-interest?summary=1',{headers:{Authorization:'Bearer x.'+btoa(JSON.stringify({aal:'aal1'}))+'.x'}});assert.equal((await onRequestGet(c)).status,401);
});
test('survey rejects cross-origin and invalid bot checks before database calls',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async url=>{calls.push(url);return Response.json({success:false});});
 const c=context();c.request=new Request(c.request,{headers:{Origin:'https://other.example'}});assert.equal((await onRequestPost(c)).status,403);assert.equal(calls.length,0);
 assert.equal((await onRequestPost(context())).status,403);assert.equal(calls.length,1);
});
test('survey strips spoofed fields, hashes edge identity and separates test responses',async t=>{
 const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,body:options.body});if(url.includes('siteverify'))return Response.json({success:true,action:'contact',hostname:'preview.example'});return Response.json({success:true});});
 assert.equal((await onRequestPost(context({...payload,p_test:false,email:'not-saved'}))).status,200);
 const rpc=JSON.parse(calls[1].body);assert.equal(rpc.p_test,true);assert.match(rpc.p_actor,/^[a-f0-9]{64}$/);assert.equal(rpc.email,undefined);assert.deepEqual(rpc.p_choices,payload.choices);assert.ok(!calls[1].body.includes('192.0.2.1'));
 const missing=context();missing.request=new Request(missing.request,{headers:{Origin:origin}});assert.equal((await onRequestPost(missing)).status,503);
});
test('survey fails closed while disabled and maps cooldowns without returning database details',async t=>{
 const c=context();c.env.CONTACTS_ENABLED='false';assert.equal((await onRequestPost(c)).status,503);
 t.mock.method(globalThis,'fetch',async url=>url.includes('siteverify')?Response.json({success:true,action:'contact',hostname:'preview.example'}):Response.json({code:'P0001',message:'private database details'},{status:400}));const response=await onRequestPost(context());assert.equal(response.status,429);assert.ok(!(await response.text()).includes('private database details'));
});
test('survey database stays private, enforces idempotency and rates, and aggregates each currency separately',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();
 try{await db.exec(await fs.readFile(new URL('./db-fixture.sql',import.meta.url),'utf8'));await db.exec(await fs.readFile(new URL('../supabase/hardening.sql',import.meta.url),'utf8'));await db.exec(await fs.readFile(new URL('../supabase/merch-interest.sql',import.meta.url),'utf8'));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select public.merch_interest_summary(false)'),/permission denied/);await assert.rejects(db.query('select * from dj_private.merch_interest'),/permission denied/);await db.exec('reset role');}
 async function submit(key,actor,choices,currency='EUR',testMode=false){await db.exec('set role service_role');try{return await db.query('select public.merch_interest_submit($1,$2,$3,$4,$5::jsonb,$6)',[key,actor,'global-barangay',currency,JSON.stringify(choices),testMode]);}finally{await db.exec('reset role');}}
 await submit(id,'a'.repeat(64),payload.choices);await submit(id,'a'.repeat(64),payload.choices);
 await assert.rejects(submit('22222222-2222-4222-8222-222222222222','a'.repeat(64),payload.choices),/wait/);
 await submit('22222222-2222-4222-8222-222222222222','b'.repeat(64),[{design:'night',item:'hoodie',price:55}]);
 await submit('33333333-3333-4333-8333-333333333333','c'.repeat(64),[{design:'night',item:'hoodie',price:7000}],'ISK');
 await submit('44444444-4444-4444-8444-444444444444','d'.repeat(64),[{design:'night',item:'hoodie',price:null}]);
 await submit('55555555-5555-4555-8555-555555555555','e'.repeat(64),payload.choices,'EUR',true);
 await assert.rejects(submit('66666666-6666-4666-8666-666666666666','f'.repeat(64),[{design:'night',item:'tote',price:1}]),/Invalid item/);
 const result=(await db.query('select public.merch_interest_summary(false) as summary')).rows[0].summary;assert.equal(result.totalResponses,4);const eur=result.rows.find(row=>row.currency==='EUR');assert.equal(eur.responses,3);assert.equal(eur.priced,2);assert.equal(eur.median,50);assert.equal(result.rows.find(row=>row.currency==='ISK').median,7000);assert.equal((await db.query('select public.merch_interest_summary(true) as s')).rows[0].s.totalResponses,1);
 // Rate limit counts remain bounded after the cooldown.
 for(let i=0;i<4;i++){await db.exec("update dj_private.merch_interest set created_at=now()-interval '1 minute' where actor=repeat('a',64)");await submit(`77777777-7777-4777-8777-77777777777${i}`,'a'.repeat(64),payload.choices);}
 await db.exec("update dj_private.merch_interest set created_at=now()-interval '1 minute' where actor=repeat('a',64)");await assert.rejects(submit('88888888-8888-4888-8888-888888888888','a'.repeat(64),payload.choices),/wait/);
 }finally{await db.close();}
});
