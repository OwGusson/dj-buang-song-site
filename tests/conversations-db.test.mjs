import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
test('private conversation ownership, consent, blocking, atomic limits and legacy cutover',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();
 await db.exec(await fs.readFile(new URL('./db-fixture.sql',import.meta.url),'utf8'));
 await db.exec("create table auth.users(id uuid primary key);");
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
 await db.query('insert into auth.users values($1),($2),($3)',[a,b,admin]);
 await db.exec(await fs.readFile(new URL('../supabase/hardening.sql',import.meta.url),'utf8'));
 await db.exec(await fs.readFile(new URL('../supabase/migrations/20261021073402_private_verified_conversations.sql',import.meta.url),'utf8'));
 async function call(user,artist,action,data={},actor='a'.repeat(64)){
   await db.exec('begin;set local role service_role;');
   try{const r=await db.query('select public.contact_dispatch($1,$2,$3,$4::jsonb,$5) as result',[user,artist,action,JSON.stringify(data),actor]);await db.exec('commit');return r.rows[0].result;}
   catch(error){await db.exec('rollback');throw error;}
 }
 try{
   await db.exec('set role anon');await assert.rejects(db.query('select public.contact_dispatch($1,false,$2)',[a,'list']),/permission denied/);await db.exec('reset role');
   await db.exec('set role authenticated');await assert.rejects(db.query('select * from dj_private.contact_threads'),/permission denied/);await db.exec('reset role');
   const first=await call(a,false,'create',{kind:'request',title:'A private song',body:'Private story',nickname:'Listener',email:'a@example.test'});
   const mine=await call(a,false,'detail',{id:first.id});assert.equal(mine.thread.publish_song,false);assert.equal(mine.thread.credit_name,false);assert.equal(mine.posts[0].body,'Private story');assert.equal(mine.posts[0].author_role,'listener');
   assert.equal((await call(b,false,'list')).threads.length,0);
   await assert.rejects(call(b,false,'detail',{id:first.id}),/Conversation not found/);
   await assert.rejects(call(b,false,'reply',{id:first.id,body:'Intruder'}),/Conversation not found/);
   await assert.rejects(call(a,false,'settings',{pause_requests:true}),/Forbidden/);
   await assert.rejects(call(a,false,'update',{id:first.id,status:'done'}),/Forbidden/);
   await assert.rejects(call(admin,true,'consent',{id:first.id,publish_song:true}),/Only the requester/);
   await call(a,false,'consent',{id:first.id,publish_song:true,credit_name:false});
   assert.equal((await call(admin,true,'detail',{id:first.id})).thread.publish_song,true);
   await call(admin,true,'reply',{id:first.id,body:'DJ-Buang reply'});
   assert.equal((await call(a,false,'detail',{id:first.id})).posts[1].author_role,'artist');
   const notices=await db.query('select recipient,status from dj_private.contact_notifications');assert.deepEqual(notices.rows,[{recipient:'a@example.test',status:'pending'}]);
   await assert.rejects(call(a,false,'reply',{id:first.id,body:'Too fast'}),/Please wait/);
   await db.exec("update dj_private.contact_posts set created_at=now()-interval '2 minutes';update dj_private.contact_threads set created_at=now()-interval '2 minutes';");
   await call(a,false,'reply',{id:first.id,body:'Follow-up'});
   await call(a,false,'create',{kind:'request',title:'Second',body:'Story two',nickname:'Listener',email:'a@example.test'});
   await db.exec("update dj_private.contact_threads set created_at=now()-interval '2 minutes'");
   await assert.rejects(call(a,false,'create',{kind:'request',title:'Third',body:'Story three',nickname:'Listener',email:'a@example.test'}),/Two active requests/);
   await call(admin,true,'block',{id:first.id,blocked:true});
   await assert.rejects(call(a,false,'create',{kind:'message',title:'Blocked',body:'Blocked',nickname:'Listener',email:'a@example.test'}),/Submissions unavailable/);
   await call(admin,true,'block',{id:first.id,blocked:false});
   await call(admin,true,'settings',{pause_messages:true});
   await assert.rejects(call(b,false,'create',{kind:'message',title:'Paused',body:'A message',nickname:'Visitor',email:'b@example.test'}),/Submissions paused/);
   await call(admin,true,'settings',{pause_messages:false});
   await call(b,false,'create',{kind:'message',title:'First',body:'A message',nickname:'Visitor',email:'b@example.test'});
   for(let i=1;i<5;i++){await db.exec("update dj_private.contact_threads set created_at=now()-interval '2 minutes' where owner_id='"+b+"'");await call(b,false,'create',{kind:'message',title:'More',body:'A message',nickname:'Visitor',email:'b@example.test'});}
   await db.exec("update dj_private.contact_threads set created_at=now()-interval '2 minutes' where owner_id='"+b+"'");
   await assert.rejects(call(b,false,'create',{kind:'message',title:'Limit',body:'A message',nickname:'Visitor',email:'b@example.test'}),/Daily conversation/);
   await db.exec(await fs.readFile(new URL('../supabase/contact-cutover.sql',import.meta.url),'utf8'));
   await db.exec('set role anon');await assert.rejects(db.query("insert into public.song_requests(requester_name,song_name,status) values('Bypass','No','pending')"),/permission denied/);await db.exec('reset role');
   await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claims','{\"sub\":\""+a+"\",\"aal\":\"aal1\"}',false)");await assert.rejects(db.query("insert into public.private_messages(sender_name,message,status) values('Bypass','No','new')"),/row-level security/);await db.exec('reset role');
   assert.equal((await db.query('select count(*)::int as n from public.song_requests')).rows[0].n,1);
 }finally{await db.close();}
});

