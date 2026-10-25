import {studioLease} from './studio-session-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getAdmin, fileKey } from '../functions/_lib/security.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { onRequestGet as catalog, onRequestPost as save } from '../functions/api/songs.js';
import { onRequestGet as media } from '../functions/files/[[key]].js';
import { onRequestPost as upload, onRequestDelete as remove } from '../functions/api/upload.js';
import { onRequestGet as session } from '../functions/api/session.js';
import { onRequestPost as interact } from '../functions/api/interactions.js';
import { authenticatorQrDataUrl } from '../src/authenticatorQr.js';

const adminToken = 'e30.' + Buffer.from(JSON.stringify({ aal: 'aal2', session_id:'test-session' })).toString('base64url') + '.signature';
const origin = 'https://dj-buang.com';
test('authenticator SVG data URIs safely encode colors and preserve the complete image', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#fff" d="M0 0h10v10z"/></svg>';
  const raw = 'data:image/svg+xml;utf-8,' + svg;
  const encoded = authenticatorQrDataUrl(raw);
  assert.equal(encoded.includes('#'), false);
  assert.equal(decodeURIComponent(encoded.split(',')[1]), svg);
  assert.equal(authenticatorQrDataUrl(encoded), encoded);
  assert.equal(authenticatorQrDataUrl(svg), encoded);
  assert.equal(authenticatorQrDataUrl('https://example.com/qr'), '');
});
const publicSong = { id: 'song-1', title: 'Published', visibility: 'public', status: 'published', audioUrl: `${origin}/files/123-track.mp3` };
const privateSong = { id: 'song-2', title: 'Unreleased', visibility: 'private', status: 'published', audioUrl: `${origin}/files/123-private.mp3` };
function context(path, options = {}) {
  const objects = new Map([['data/songs.json', JSON.stringify([publicSong, privateSong, { ...publicSong, id: 'draft', status: 'draft' }])], ['123-track.mp3', 'audio'], ['123-private.mp3', 'private']]);
  const writes = [];
  return {
    request: new Request(origin + path, options), data: {}, writes,
    env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-key', FILES: {
      async get(key) {
        const lease=studioLease(key);if(lease)return lease;
        const value = objects.get(key);
        if (value === undefined) return null;
        return { text: async () => value, body: new Response(value).body, size: value.length, httpEtag: 'etag', httpMetadata: { contentType: 'audio/mpeg' }, writeHttpMetadata: (h) => h.set('Content-Type', 'audio/mpeg') };
      },
      async put(key, value) { writes.push(key); objects.set(key, typeof value === 'string' ? value : await new Response(value).text()); },
      async delete(key) { writes.push('delete:' + key); objects.delete(key); },
    } },
    next: async () => new Response('ok'),
  };
}

test('anonymous mutations fail before storage is touched', async () => {
  for (const [path, method] of [['/api/upload', 'POST'], ['/api/upload/', 'DELETE'], ['/api/songs', 'POST'], ['/api/songs', 'DELETE']]) {
    const ctx = context(path, { method });
    let called = false;
    ctx.next = async () => { called = true; return new Response(); };
    assert.equal((await middleware(ctx)).status, 401);
    assert.equal(called, false);
    assert.deepEqual(ctx.writes, []);
  }
});
test('forged browser admin flags do not authorize writes', async () => {
  const ctx = context('/api/upload', { method: 'POST', headers: { Cookie: 'djbuang_admin_logged_in=true', 'X-Admin': 'true' } });
  assert.equal((await middleware(ctx)).status, 401);
});
test('user-editable metadata cannot grant admin', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'user', user_metadata: { role: 'admin' } }));
  assert.equal(await getAdmin(context('/api/session', { headers: { Authorization: String("Bearer " + adminToken) } })), null);
});
test('verified admin token allows a mutation; invalid token fails', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => init.headers.Authorization === String("Bearer " + adminToken) ? Response.json({ id: 'admin', app_metadata: { role: 'admin' } }) : new Response('', { status: 401 }));
  assert.equal((await middleware(context('/api/songs', { method: 'DELETE', headers: { Authorization: String("Bearer " + adminToken) } }))).status, 200);
  assert.equal((await middleware(context('/api/songs', { method: 'DELETE', headers: { Authorization: 'Bearer invalid' } }))).status, 401);
});
test('auth outage fails closed', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('network down'); });
  assert.equal((await middleware(context('/api/upload', { method: 'POST', headers: { Authorization: String("Bearer " + adminToken) } }))).status, 503);
});
test('password-only admin session cannot mutate or read private data', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'admin', app_metadata: { role: 'admin' } }));
  const token = 'e30.' + Buffer.from(JSON.stringify({ aal: 'aal1' })).toString('base64url') + '.signature';
  const headers = { Authorization: `Bearer ${token}` };
  assert.equal((await middleware(context('/api/upload', { method: 'POST', headers }))).status, 401);
  assert.equal((await (await catalog(context('/api/songs', { headers }))).json()).length, 1);
  const ctx = context('/api/session', { headers });
  ctx.next = async () => session(ctx);
  const response = await middleware(ctx);
  assert.deepEqual(await response.json(), { authenticated: false, mfaRequired: true });
  assert.equal(response.headers.get('Set-Cookie'), null);
});
test('cross-origin mutations rejected', async () => {
  assert.equal((await middleware(context('/api/upload', { method: 'POST', headers: { Origin: 'https://attacker.example' } }))).status, 403);
});
test('public catalog excludes private and draft songs', async () => {
  const response = await catalog(context('/api/songs'));
  assert.deepEqual((await response.json()).map((s) => s.id), ['song-1']);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
test('admin catalog includes private songs', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'admin', app_metadata: { role: 'admin' } }));
  assert.equal((await (await catalog(context('/api/songs', { headers: { Authorization: String("Bearer " + adminToken) } }))).json()).length, 3);
});
test('private media and internal catalog cannot be read anonymously', async () => {
  for (const path of ['/files/123-private.mp3', '/files/data/songs.json', '/files/data%2Fsongs.json', '/files/data/backups/one.json']) assert.equal((await media(context(path))).status, 404);
  const publicResponse = await media(context('/files/123-track.mp3'));
  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.headers.get('Cache-Control'), 'no-store');
});
test('media cookie is HttpOnly and authorizes only media', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'admin', app_metadata: { role: 'admin' } }));
  const ctx = context('/api/session', { headers: { Authorization: String("Bearer " + adminToken) } });
  ctx.data.admin = { id: 'admin', mfaVerified: true, authClaims:{session_id:'test-session'} };
  const cookie = (await session(ctx)).headers.get('Set-Cookie');
  assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await media(context('/files/123-private.mp3', { headers: { Cookie: cookie.split(';')[0] } }))).status, 200);
  assert.equal((await middleware(context('/api/upload', { method: 'POST', headers: { Cookie: cookie.split(';')[0] } }))).status, 401);
});
test('file keys reject external origins and internal metadata', () => {
  assert.equal(fileKey('https://attacker.example/files/test.mp3', origin), null);
  assert.equal(fileKey(origin + '/files/data%2Fsongs.json', origin), null);
  assert.equal(fileKey(origin + '/files/%5Csecret', origin), null);
});
test('delete cannot remove catalog or arbitrary remote media', async () => {
  for (const url of [origin + '/files/data/songs.json', 'https://attacker.example/files/123-track.mp3']) {
    const ctx = context('/api/upload', { method: 'DELETE', body: JSON.stringify({ url }) });
    ctx.data.admin = { id: 'admin', mfaVerified: true };
    assert.equal((await remove(ctx)).status, 400);
    assert.deepEqual(ctx.writes, []);
  }
});
test('uploads reject executable files and forged image signatures', async () => {
  for (const [name, type] of [['bad.svg', 'image/svg+xml'], ['fake.png', 'image/png']]) {
    const form = new FormData(); form.append('file', new File(['<script>bad</script>'], name, { type }));
    const ctx = context('/api/upload', { method: 'POST', body: form }); ctx.data.admin = { id: 'admin', mfaVerified: true };
    assert.equal((await upload(ctx)).status, 415);
    assert.deepEqual(ctx.writes, []);
  }
});
test('valid image gets an opaque media key', async () => {
  const form = new FormData(); form.append('file', new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'art.png', { type: 'image/png' }));
  const ctx = context('/api/upload', { method: 'POST', body: form }); ctx.data.admin = { id: 'admin', mfaVerified: true };
  const response = await upload(ctx);
  assert.equal(response.status, 200);
  assert.match((await response.json()).fileName, /^media\/[0-9a-f-]+\.png$/);
});
test('oversized upload rejected before parsing', async () => {
  const ctx = context('/api/upload', { method: 'POST', headers: { 'Content-Length': String(110 * 1024 * 1024) }, body: 'x' }); ctx.data.admin = { id: 'admin', mfaVerified: true };
  assert.equal((await upload(ctx)).status, 413);
});
test('catalog edit snapshots previous catalog and rejects script URLs', async () => {
  const bad = context('/api/songs', { method: 'POST', body: JSON.stringify({ id: 'song-1', audioUrl: 'javascript:alert(1)' }) }); bad.data.admin = { id: 'admin' };
  assert.equal((await save(bad)).status, 400);
  assert.deepEqual(bad.writes, []);
  const good = context('/api/songs', { method: 'POST', body: JSON.stringify({ ...publicSong, title: 'Updated' }) }); good.data.admin = { id: 'admin' };
  assert.equal((await save(good)).status, 200);
  assert.match(good.writes[0], /^data\/backups\//);
  assert.equal(good.writes[1], 'data/songs.json');
});
test('interaction endpoint fails closed without server secrets', async () => {
  assert.equal((await interact(context('/api/interactions', { method: 'POST' }))).status, 503);
});

test('interaction endpoint validates catalog and hashes the edge IP before calling private RPC', async (t) => {
  let saved;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://example.supabase.co/rest/v1/rpc/record_interaction');
    saved = JSON.parse(options.body);
    assert.equal(options.headers.apikey, 'server-only');
    return Response.json({ likes: 12 });
  });
  const ctx = context('/api/interactions', { method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify({ songId: 'song-1', eventType: 'like', likes: 9999 }) });
  Object.assign(ctx.env, { SUPABASE_SERVICE_ROLE_KEY: 'server-only', INTERACTION_HASH_SECRET: 'test-only-secret' });
  const response = await interact(ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { likes: 12 });
  assert.match(saved.p_actor, /^[a-f0-9]{64}$/);
  assert.equal(saved.p_song_id, 'song-1');
  assert.equal(saved.likes, undefined);
  assert.equal(JSON.stringify(saved).includes('192.0.2.1'), false);
});

test('private song interactions and untrusted forwarded IP are rejected', async () => {
  const ctx = context('/api/interactions', { method: 'POST', headers: { 'X-Forwarded-For': '192.0.2.1' }, body: JSON.stringify({ songId: 'song-2', eventType: 'like' }) });
  Object.assign(ctx.env, { SUPABASE_SERVICE_ROLE_KEY: 'server-only', INTERACTION_HASH_SECRET: 'test-only-secret' });
  assert.equal((await interact(ctx)).status, 404);
  const publicCtx = context('/api/interactions', { method: 'POST', headers: { 'X-Forwarded-For': '192.0.2.1' }, body: JSON.stringify({ songId: 'song-1', eventType: 'like' }) });
  Object.assign(publicCtx.env, { SUPABASE_SERVICE_ROLE_KEY: 'server-only', INTERACTION_HASH_SECRET: 'test-only-secret' });
  assert.equal((await interact(publicCtx)).status, 503);
});
test('chunked interaction payloads are bounded even without Content-Length', async () => {
  const ctx = context('/api/interactions', { method: 'POST', body: JSON.stringify({ songId: 'song-1', eventType: 'like', padding: 'x'.repeat(3000) }) });
  Object.assign(ctx.env, { SUPABASE_SERVICE_ROLE_KEY: 'server-only', INTERACTION_HASH_SECRET: 'test-only-secret' });
  assert.equal(ctx.request.headers.has('Content-Length'), false);
  assert.equal((await interact(ctx)).status, 413);
});
