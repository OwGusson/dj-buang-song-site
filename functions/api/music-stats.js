import { isPublicSong, json, readSongs } from '../_lib/security.js';

// Expose only counts for currently published, public songs. Never return event
// records, listener identifiers, private song IDs, or private song totals.
export async function onRequestGet({ env }) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: 'Music counts unavailable' }, 503);
  try {
    const songs = (await readSongs(env)).filter(song => isPublicSong(song, env));
    if (!songs.length) return json({ songs: 0, plays: 0, likes: 0, tracks: [] });
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    // Fetch only public IDs and count fields; no raw event or visitor data.
    const ids = songs.map(song => song.id);
    if (ids.some(id => !/^[\w-]{1,100}$/.test(id))) throw new Error('Invalid catalog');
    const filter = encodeURIComponent(`in.(${ids.join(',')})`);
    const responses = await Promise.all([
      fetch(`${url}/rest/v1/song_analytics?select=song_id,plays&song_id=${filter}`, { headers, signal: AbortSignal.timeout(10000) }),
      fetch(`${url}/rest/v1/song_likes?select=song_id,likes&song_id=${filter}`, { headers, signal: AbortSignal.timeout(10000) }),
    ]);
    if (responses.some(response => !response.ok)) throw new Error('Counts unavailable');
    const [analytics, likes] = await Promise.all(responses.map(response => response.json()));
    if (!Array.isArray(analytics) || !Array.isArray(likes)) throw new Error('Invalid counts');
    const count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
    const tracks = ids.map(songId => ({ songId, plays: count(analytics.find(row => row.song_id === songId)?.plays), likes: count(likes.find(row => row.song_id === songId)?.likes) }));
    return json({ songs: tracks.length, plays: tracks.reduce((sum, row) => sum + row.plays, 0), likes: tracks.reduce((sum, row) => sum + row.likes, 0), tracks });
  } catch { return json({ error: 'Music counts unavailable' }, 503); }
}
