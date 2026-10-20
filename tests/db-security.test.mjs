import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Set PGLITE_MODULE to the installed @electric-sql/pglite module URL.
// This keeps the embedded database test runtime out of the production dependencies.
test('database policies, private RPC and rate limits match the live schema', { skip: !process.env.PGLITE_MODULE }, async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE);
  const db = new PGlite();
  await db.exec(await fs.readFile(new URL('./db-fixture.sql', import.meta.url), 'utf8'));
  await db.exec(await fs.readFile(new URL('../supabase/hardening.sql', import.meta.url), 'utf8'));
  async function asRole(role, query, claims = {}) {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
      const result = await db.query(query);
      await db.exec('commit');
      return result.rows;
    } catch (error) { await db.exec('rollback'); throw error; }
  }
  try {
    await assert.rejects(asRole('anon', 'select * from public.private_messages'), /permission denied/);
    await assert.rejects(asRole('anon', 'select * from public.song_requests'), /permission denied/);
    assert.deepEqual(await asRole('authenticated', 'select * from public.private_messages'), []);
    assert.equal((await asRole('authenticated', 'select * from public.private_messages', { app_metadata: { role: 'admin' } })).length, 0);
    assert.equal((await asRole('authenticated', 'select * from public.private_messages', { app_metadata: { role: 'admin' }, aal: 'aal2' })).length, 1);
    assert.deepEqual(await asRole('anon', 'select song_id from public.songs_backup'), [{ song_id: 'public-song' }]);
    await asRole('anon', "insert into public.private_messages(sender_name,sender_email,message,status) values ('Visitor','','Hello','new')");
    await asRole('anon', "insert into public.song_requests(requester_name,song_name,details,email,notify,delivery,linked_song_id,status) values ('Visitor','Song','','',false,'public','','pending')");
    await assert.rejects(asRole('anon', "insert into public.private_messages(sender_name,message,status) values ('Visitor','Hello','done')"), /row-level security/);
    await assert.rejects(asRole('anon', "insert into public.song_likes(song_id,likes) values ('public-song',99999)"), /permission denied/);
    await assert.rejects(asRole('anon', "select public.record_interaction('public-song','like',repeat('a',64))"), /permission denied/);
    const first = await asRole('service_role', "select public.record_interaction('public-song','like',repeat('a',64)) as result");
    assert.equal(first[0].result.likes, 1);
    const again = await asRole('service_role', "select public.record_interaction('public-song','like',repeat('a',64)) as result");
    assert.equal(again[0].result.likes, 1);
    const opened = await asRole('service_role', "select public.record_interaction('public-song','open',repeat('b',64)) as result");
    assert.equal(opened[0].result.opens, 1);
    assert.equal(opened[0].result.unique_opens, 1);
    for (let i=0;i<60;i++) await asRole('service_role', "select public.record_interaction('rate-song','like',repeat('c',64))");
    await assert.rejects(asRole('service_role', "select public.record_interaction('rate-song','like',repeat('c',64))"), /Rate limit exceeded/);
    const functions = await db.query("select prosecdef from pg_proc where proname='record_interaction'");
    assert.equal(functions.rows[0].prosecdef, false);
  } finally { await db.close(); }
});
