import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('six-month expiry keeps reviewed summaries only, cascades private content, and protects archive access',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE),db=new PGlite();
 const owner='11111111-1111-4111-8111-111111111111',admin='33333333-3333-4333-8333-333333333333';
 try{
  await db.exec(await fs.readFile(new URL('./db-fixture.sql',import.meta.url),'utf8'));
  await db.exec('create table auth.users(id uuid primary key)');await db.query('insert into auth.users values($1),($2)',[owner,admin]);
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261021073402_private_verified_conversations.sql',import.meta.url),'utf8'));
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261024101641_conversation_retention.sql',import.meta.url),'utf8'));
  async function call(user,isAdmin,action,data={}){await db.exec('begin;set local role service_role');try{const r=await db.query('select public.contact_dispatch($1,$2,$3,$4::jsonb,$5) as result',[user,isAdmin,action,JSON.stringify(data),'a'.repeat(64)]);await db.exec('commit');return r.rows[0].result;}catch(e){await db.exec('rollback');throw e;}}
  async function create(){await db.exec("update dj_private.contact_threads set created_at=now()-interval '2 minutes'");return (await call(owner,false,'create',{kind:'message',nickname:'Private nickname',email:'private@example.test',title:'Private title',body:'Private message with identity'})).id;}
  const id=await create();
  await assert.rejects(call(owner,false,'archive_list',{kind:'message'}),/Forbidden/);
  await assert.rejects(call(owner,false,'archive_summary',{id,summary:'Unauthorized',reviewed:true}),/Forbidden/);
  await assert.rejects(call(admin,true,'archive_summary',{id,summary:'Unchecked',reviewed:false}),/Review the summary/);
  await call(admin,true,'reply',{id,body:'Private artist reply'});
  await call(admin,true,'update',{id,status:'closed',linked_song_id:'a-song'});
  await call(owner,false,'consent',{id,publish_song:true});
  await call(admin,true,'archive_summary',{id,summary:'A listener requested a cheerful birthday song. Completed.',reviewed:true});
  assert.equal((await call(owner,false,'detail',{id})).thread.archive_summary,undefined);
  assert.equal((await call(owner,false,'list')).threads[0].archive_summary,undefined);
  await assert.rejects(call(admin,true,'reply',{id,body:'Closed reply'}),/Reopen/);
  assert.ok((await call(admin,true,'detail',{id})).thread.closed_at);
  assert.equal((await db.query('select dj_private.expire_contact_conversations() as n')).rows[0].n,0);
  const recent=await create();await call(admin,true,'update',{id:recent,status:'closed'});
  const withoutSummary=await create();await call(admin,true,'update',{id:withoutSummary,status:'closed'});
  const reopened=await create();await call(admin,true,'update',{id:reopened,status:'closed'});
  // Time travel only inside this isolated test database.
  await db.exec('alter table dj_private.contact_threads disable trigger contact_retention_clock');
  await db.query("update dj_private.contact_threads set closed_at=now()-interval '6 months 1 day' where id in ($1,$2,$3)",[id,withoutSummary,reopened]);
  await db.exec('alter table dj_private.contact_threads enable trigger contact_retention_clock');
  await call(admin,true,'update',{id:reopened,status:'waiting'});
  assert.equal((await call(admin,true,'detail',{id:reopened})).thread.closed_at,null);
  assert.equal((await db.query('select dj_private.expire_contact_conversations() as n')).rows[0].n,2);
  assert.equal((await db.query('select dj_private.expire_contact_conversations() as n')).rows[0].n,0);
  const archives=await call(admin,true,'archive_list',{kind:'message'});assert.equal(archives.archives.length,2);assert.equal(archives.total,2);
  assert.ok(archives.archives.some(a=>a.summary===''));assert.ok(archives.archives.some(a=>a.summary.includes('cheerful birthday')));
  for(const archive of archives.archives){assert.deepEqual(Object.keys(archive).sort(),['id','kind','status','created_at','closed_at','archived_at','summary'].sort());assert.equal(archive.status,'closed');}
  assert.equal(JSON.stringify(archives).includes('private@example.test'),false);assert.equal(JSON.stringify(archives).includes('Private nickname'),false);assert.equal(JSON.stringify(archives).includes(owner),false);
  await assert.rejects(call(owner,false,'detail',{id}),/Conversation not found/);
  assert.equal((await db.query('select count(*)::int as n from dj_private.contact_posts where thread_id=$1',[id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from dj_private.contact_notifications where thread_id=$1',[id])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int as n from dj_private.contact_song_permissions')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,2);
  for(const role of ['anon','authenticated','service_role']){await db.exec('set role '+role);await assert.rejects(db.query('select dj_private.expire_contact_conversations()'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from dj_private.contact_archives'),/permission denied/);await db.exec('reset role');
  // Summary review is invalidated when the underlying conversation changes.
  await call(admin,true,'archive_summary',{id:reopened,summary:'General outcome',reviewed:true});
  await call(admin,true,'reply',{id:reopened,body:'A new detail'});
  assert.equal((await call(admin,true,'detail',{id:reopened})).thread.archive_summary,'');
 }finally{await db.close();}
});
