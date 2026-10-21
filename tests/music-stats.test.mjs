import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as stats } from '../functions/api/music-stats.js';
import { onRequestDelete as removeSong } from '../functions/api/songs.js';

const songs = [
  { id: 'song-current', title: 'Current', visibility: 'public', status: 'published' },
  { id: 'song-private', title: 'Private', visibility: 'private', status: 'published' },
  { id: 'song-draft', title: 'Draft', visibility: 'public', status: 'draft' },
];
function setup() {
  const objects = new Map([['data/songs.json', JSON.stringify(songs)], ['audio.mp3', 'retained audio']]);
  const writes = [];
  return { request: new Request('https://dj-buang.com/api/songs?id=song-current', { method: 'DELETE' }), data: {}, writes, objects,
    env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only', FILES: {
      async get(key) { const text = objects.get(key); return text === undefined ? null : { text: async () => text, body: new Response(text).body }; },
      async put(key, body) { writes.push(key); objects.set(key, typeof body === 'string' ? body : await new Response(body).text()); },
    } },
  };
}
test('public music counts exclude private, draft and deleted tracks even if the database returns them', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return Response.json(url.includes('song_analytics') ? [
      { song_id: 'song-current', plays: 7, listener_id: 'never-return-this' },
      { song_id: 'song-private', plays: 100 }, { song_id: 'song-draft', plays: 100 }, { song_id: 'song-deleted', plays: 100 },
    ] : [{ song_id: 'song-current', likes: 3 }, { song_id: 'song-private', likes: 99 }]);
  });
  const response = await stats(setup());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { songs: 1, plays: 7, likes: 3, tracks: [{ songId: 'song-current', plays: 7, likes: 3 }] });
  for (const call of calls) {
    const url = new URL(call.url);
    assert.equal(url.searchParams.get('song_id'), 'in.(song-current)');
    assert.equal(call.init.headers.Authorization, 'Bearer server-only');
    assert.doesNotMatch(url.searchParams.get('select'), /listener|\*/);
  }
});
test('failed counts return an unavailable response instead of false totals or database details', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('sensitive database diagnostic', { status: 500 }));
  const response = await stats(setup());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Music counts unavailable' });
});
test('song deletion requires administrator authorization and validates the exact song', async () => {
  const context = setup();
  assert.equal((await removeSong(context)).status, 401);
  assert.deepEqual(context.writes, []);
  context.data.admin = { id: 'verified-admin' };
  context.request = new Request('https://dj-buang.com/api/songs?id=missing', { method: 'DELETE' });
  assert.equal((await removeSong(context)).status, 404);
  context.request = new Request('https://dj-buang.com/api/songs?id=../data', { method: 'DELETE' });
  assert.equal((await removeSong(context)).status, 400);
  assert.deepEqual(context.writes, []);
});
test('deleting a song backs up its catalog entry, preserves other songs and keeps media recoverable', async () => {
  const context = setup(); context.data.admin = { id: 'verified-admin' };
  assert.equal((await removeSong(context)).status, 200);
  const backup = context.writes.find(key => key.startsWith('data/backups/'));
  assert.ok(backup);
  assert.deepEqual(JSON.parse(context.objects.get(backup)), songs);
  assert.deepEqual(JSON.parse(context.objects.get('data/songs.json')), songs.slice(1));
  assert.equal(context.objects.get('audio.mp3'), 'retained audio');
});
