import test from 'node:test';
import assert from 'node:assert/strict';
import { ListeningQueue, albumTracks, rankTracks } from '../src/site2/listening-model.js';
import { onRequestGet as catalog, onRequestPost as save } from '../functions/api/songs.js';
import { onRequestGet as download } from '../functions/api/download.js';
import { onRequestGet as media } from '../functions/files/[[key]].js';
import { onRequestGet as stats } from '../functions/api/music-stats.js';
import { onRequestPost as interaction } from '../functions/api/interactions.js';
import { onRequestGet as releaseConfig } from '../functions/api/release-config.js';

test('album order uses metadata, excludes private/draft/standalone tracks and supports renamed songs', () => {
  const tracks = albumTracks([
    { id: 'two', title: 'Renamed second song', albumId: 'global-barangay', albumTrackNumber: 2, visibility: 'public', status: 'published' },
    { id: 'one', title: 'First song', albumId: 'global-barangay', albumTrackNumber: 1, visibility: 'public', status: 'published' },
    { id: 'private', albumId: 'global-barangay', visibility: 'private' },
    { id: 'draft', albumId: 'global-barangay', visibility: 'public', status: 'draft' },
    { id: 'single', title: 'Standalone', visibility: 'public' },
  ]);
  assert.deepEqual(tracks.map(song => song.id), ['one', 'two']);
});
test('discovery uses only current public tracks with positive counts', () => {
  const songs = [{ id: 'a', title: 'A', visibility: 'public' }, { id: 'b', title: 'B', visibility: 'public' }, { id: 'private', visibility: 'private' }, { id: 'draft', visibility: 'public', status: 'draft' }];
  assert.deepEqual(rankTracks(songs, [{ songId: 'a', plays: 3 }, { songId: 'b', plays: 9 }, { songId: 'private', plays: 100 }, { songId: 'deleted', plays: 200 }], 'plays').map(row => row.song.id), ['b', 'a']);
  assert.deepEqual(rankTracks(songs, [], 'likes'), []);
});
test('queue preserves album context and stops at the end instead of jumping to unrelated music', () => {
  const queue = new ListeningQueue(); queue.start(['one', 'two', 'three']);
  assert.equal(queue.next(), 'two'); assert.equal(queue.next(), 'three'); assert.equal(queue.next(), null);
  assert.equal(queue.previous(), 'two'); assert.equal(queue.choose(0), 'one'); assert.equal(queue.choose(99), null);
});
test('play-next additions preserve click order, move existing upcoming songs, and reject repeated clicks', () => {
  const queue = new ListeningQueue(); queue.start(['a', 'b', 'c', 'd']);
  assert.equal(queue.enqueue('c'), true); assert.equal(queue.enqueue('x'), true); assert.equal(queue.enqueue('c'), false); assert.equal(queue.enqueue('a'), false);
  assert.deepEqual(queue.ids, ['a', 'c', 'x', 'b', 'd']);
  assert.equal(queue.next(), 'c'); assert.equal(queue.enqueue('y'), true);
  assert.deepEqual(queue.ids, ['a', 'c', 'x', 'y', 'b', 'd']);
});
test('shuffle keeps current and played tracks fixed; turning it off restores remaining album order', () => {
  const queue = new ListeningQueue(); queue.start(['a', 'b', 'c', 'd', 'e'], 'b');
  assert.equal(queue.shuffle(() => 0), true);
  assert.deepEqual(queue.ids.slice(0, 2), ['a', 'b']); assert.equal(queue.current(), 'b');
  assert.deepEqual(new Set(queue.ids), new Set(['a', 'b', 'c', 'd', 'e']));
  assert.equal(queue.shuffle(), false); assert.deepEqual(queue.ids, ['a', 'b', 'c', 'd', 'e']);
});
test('unstarted queues, removal and catalog changes never leave unavailable songs queued', () => {
  const queue = new ListeningQueue(); queue.enqueue('a'); queue.enqueue('b');
  assert.equal(queue.current(), null); assert.equal(queue.next(), 'a');
  assert.equal(queue.remove(0), false); assert.equal(queue.remove(1), true);
  queue.start(['a', 'b', 'c'], 'b'); queue.reconcile(['a', 'c']);
  assert.equal(queue.current(), null); assert.deepEqual(queue.ids, ['c']); assert.equal(queue.next(), 'c');
});

const origin = 'https://dj-buang.com';
const single = { id: 'single', title: 'Current single', visibility: 'public', status: 'published', audioUrl: origin + '/files/single.mp3' };
const albumSong = { id: 'album-song', title: 'Synthetic album fixture', albumId: 'global-barangay', albumTrackNumber: 1, credits: 'Synthetic credit', visibility: 'public', status: 'published', audioUrl: origin + '/files/album.mp3' };
function context(path = '/api/songs', options = {}) {
  const objects = new Map([['data/songs.json', JSON.stringify([single, albumSong])], ['album.mp3', 'album audio'], ['single.mp3', 'single audio']]);
  const writes = [];
  return { request: new Request(origin + path, options), data: {}, writes, objects, env: {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key', INTERACTION_HASH_SECRET: 'synthetic-secret', FILES: {
      async get(key) { const text = objects.get(key); return text === undefined ? null : { text: async () => text, body: new Response(text).body, size: text.length, httpMetadata: { contentType: 'audio/mpeg' }, writeHttpMetadata: headers => headers.set('Content-Type', 'audio/mpeg') }; },
      async put(key, body) { writes.push(key); objects.set(key, typeof body === 'string' ? body : await new Response(body).text()); },
    },
  } };
}
test('unreleased album remains absent from public catalog, media, downloads and interactions', async () => {
  assert.deepEqual((await (await catalog(context())).json()).map(song => song.id), ['single']);
  assert.equal((await media(context('/files/album.mp3'))).status, 404);
  assert.equal((await download(context('/api/download?id=album-song'))).status, 404);
  assert.equal((await interaction(context('/api/interactions', { method: 'POST', body: JSON.stringify({ songId: 'album-song', eventType: 'like' }) }))).status, 404);
  assert.deepEqual(await releaseConfig(context()).json(), { globalBarangayReleased: false });
});
test('release switch must be literal true and still respects private visibility and drafts', async () => {
  for (const value of [undefined, 'false', 'TRUE', true]) { const c = context(); c.env.GLOBAL_BARANGAY_RELEASED = value; assert.equal((await (await catalog(c)).json()).length, 1); }
  const c = context(); c.env.GLOBAL_BARANGAY_RELEASED = 'true';
  assert.equal((await (await catalog(c)).json()).length, 2);
  c.request = new Request(origin + '/api/download?id=album-song'); assert.equal((await download(c)).status, 200);
  c.objects.set('data/songs.json', JSON.stringify([{ ...albumSong, visibility: 'private' }, { ...albumSong, id: 'draft', status: 'draft' }]));
  c.request = new Request(origin + '/api/songs'); assert.deepEqual(await (await catalog(c)).json(), []);
});
test('public music totals do not query or return unreleased album IDs', async t => {
  const calls = []; t.mock.method(globalThis, 'fetch', async url => { calls.push(new URL(url)); return Response.json([]); });
  const response = await stats(context()); assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).tracks.map(track => track.songId), ['single']);
  assert.ok(calls.every(url => url.searchParams.get('song_id') === 'in.(single)'));
});
test('album metadata and credits survive unrelated edits; invalid track ordering is rejected', async () => {
  const c = context(); c.data.admin = { id: 'verified-admin' };
  c.request = new Request(origin + '/api/songs', { method: 'POST', body: JSON.stringify({ id: 'album-song', title: 'Renamed song', albumTrackNumber: 4, credits: 'Updated featured artist' }) });
  assert.equal((await save(c)).status, 200);
  const stored = JSON.parse(c.objects.get('data/songs.json')).find(song => song.id === 'album-song');
  assert.equal(stored.albumId, 'global-barangay'); assert.equal(stored.albumTrackNumber, 4); assert.equal(stored.credits, 'Updated featured artist');
  for (const albumTrackNumber of [0, -1, 100, 1.5, '1']) { const invalid = context(); invalid.data.admin = c.data.admin; invalid.request = new Request(origin + '/api/songs', { method: 'POST', body: JSON.stringify({ id: 'album-song', albumTrackNumber }) }); assert.equal((await save(invalid)).status, 400); assert.deepEqual(invalid.writes, []); }
});
