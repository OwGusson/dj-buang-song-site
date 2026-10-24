import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {voiceConsent,validateVoiceFile} from '../shared/voice-samples.js';
const agreed={own_adult_voice:true,request_use:true,retention_30:true,future_use:false,keep_90_days:false};
test('voice permissions are explicit and independent; signatures and size are checked',async()=>{
 assert.throws(()=>voiceConsent({...agreed,retention_30:false}));assert.throws(()=>voiceConsent({...agreed,keep_90_days:true}));assert.throws(()=>voiceConsent({...agreed,future_use:'true'}));assert.deepEqual(voiceConsent(agreed),agreed);
 const wave=new Uint8Array(44);wave.set(new TextEncoder().encode('RIFF'));wave.set(new TextEncoder().encode('WAVE'),8);
 assert.equal(await validateVoiceFile(new File([wave],'sample.wav',{type:'audio/wav'})),'audio/wav');
 await assert.rejects(validateVoiceFile(new File(['<script>bad</script>'],'sample.wav',{type:'audio/wav'})));
 await assert.rejects(validateVoiceFile(new File([new Uint8Array(10485761)],'sample.wav',{type:'audio/wav'})));
});
test('private voice lifecycle enforces ownership, fixed retention, quotas, withdrawal and maintenance authorization',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333',token='a'.repeat(64);
 try{
  await db.exec(await fs.readFile(new URL('./db-fixture.sql',import.meta.url),'utf8'));await db.exec('create table auth.users(id uuid primary key)');await db.query('insert into auth.users values($1),($2),($3)',[owner,other,admin]);
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261021073402_private_verified_conversations.sql',import.meta.url),'utf8'));
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261024104016_private_voice_samples.sql',import.meta.url),'utf8'));
  async function thread(){return (await db.query("insert into dj_private.contact_threads(owner_id,owner_email,nickname,kind,title) values($1,'private@example.test','Private','request','Private') returning id",[owner])).rows[0].id;}
  async function call(who,isAdmin,action,data={}){await db.exec('begin;set local role service_role');try{const r=await db.query('select public.voice_dispatch($1,$2,$3,$4::jsonb) as result',[who,isAdmin,action,JSON.stringify(data)]);await db.exec('commit');return r.rows[0].result;}catch(e){await db.exec('rollback');throw e;}}
  const t=await thread(),params={thread_id:t,...agreed,mime:'audio/wav',bytes:44};
  await assert.rejects(call(other,false,'reserve',params),/Unavailable/);await assert.rejects(call(owner,false,'reserve',{...params,own_adult_voice:false}),/permissions/);
  const a=await call(owner,false,'reserve',{...params,expires_at:'2099-01-01'});assert.equal(Math.round((Date.parse(a.expires_at)-Date.parse(a.uploaded_at))/86400000),30);
  await assert.rejects(call(owner,false,'read',{id:a.id}),/expired or removed/);await call(owner,false,'complete',{id:a.id});
  assert.equal((await call(admin,true,'read',{id:a.id})).id,a.id);await assert.rejects(call(other,false,'read',{id:a.id}),/Unavailable/);
  const listing=await call(owner,false,'list',{thread_id:t});assert.equal(listing.samples[0].object_key,undefined);assert.equal(listing.samples[0].owner_id,undefined);
  await assert.rejects(call(owner,false,'reserve',params),/One stored sample/);
  await call(owner,false,'remove',{id:a.id});await assert.rejects(call(owner,false,'read',{id:a.id}),/expired or removed/);await call(owner,false,'deleted',{id:a.id});
  const b=await call(owner,false,'reserve',{...params,future_use:true,keep_90_days:true});assert.equal(Math.round((Date.parse(b.expires_at)-Date.parse(b.uploaded_at))/86400000),90);await call(owner,false,'complete',{id:b.id});
  const t2=await thread();await assert.rejects(call(owner,false,'reserve',{...params,thread_id:t2,keep_90_days:true}),/Longer storage/);
  const c=await call(owner,false,'reserve',{...params,thread_id:t2});await assert.rejects(call(owner,false,'reserve',{...params,thread_id:await thread()}),/limit reached/);
  await db.query("update dj_private.voice_samples set expires_at=now()-interval '1 second' where id=$1",[b.id]);await assert.rejects(call(owner,false,'read',{id:b.id}),/expired or removed/);
  await db.query("insert into dj_private.voice_job_auth values(true,encode(sha256(convert_to($1,'UTF8')),'hex'))",[token]);
  await assert.rejects(db.query("select public.voice_retention_jobs('wrong','claim')"),/Unauthorized maintenance/);
  const due=(await db.query("select public.voice_retention_jobs($1,'claim') as result",[token])).rows[0].result;assert.deepEqual(due.map(v=>v.id),[b.id]);assert.equal(due[0].object_key,b.object_key);
  await db.query("select public.voice_retention_jobs($1,'deleted',$2)",[token,b.id]);assert.deepEqual((await db.query("select public.voice_retention_jobs($1,'claim') as result",[token])).rows[0].result,[]);
  const deleted=(await db.query('select * from dj_private.voice_samples where id=$1',[b.id])).rows[0];assert.equal(deleted.object_key,null);assert.equal(deleted.status,'deleted');assert.equal(deleted.future_use,true);
  await db.query("update dj_private.voice_samples set uploaded_at=now()-interval '2 hours' where id=$1",[c.id]);assert.equal((await db.query("select public.voice_retention_jobs($1,'claim') as result",[token])).rows[0].result[0].id,c.id);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from dj_private.voice_samples'),/permission denied/);await assert.rejects(db.query("select public.voice_retention_jobs($1,'claim')",[token]),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
