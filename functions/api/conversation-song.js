import { json, fileKey, readSongs } from '../_lib/security.js';
import { contactConfig, verifiedContactUser, contactRpc } from '../_lib/contacts.js';

const audioTypes = /^audio\/(mpeg|wav|x-wav|flac|x-flac|ogg|mp4)$/;
const imageTypes = /^image\/(jpeg|png|webp)$/;
const unavailable = () => json({ error: 'Finished song unavailable.' }, 404);
export async function onRequestGet(context) {
  try {
    if (!contactConfig(context.env).enabled) return unavailable();
    const url = new URL(context.request.url), id = url.searchParams.get('id'), asset = url.searchParams.get('asset') || 'info';
    if (!/^[0-9a-f-]{36}$/i.test(id || '') || !['info', 'audio', 'cover'].includes(asset)) return unavailable();
    const user = await verifiedContactUser(context); if (!user) return unavailable();
    // The same ownership-checked RPC used by the inbox authorizes every media request.
    const result = await contactRpc(context.env, { p_user: user.id, p_admin: user.admin, p_action: 'detail', p_data: { id } });
    if (!result.ok) return unavailable();
    const { thread } = await result.json();
    if (thread?.kind !== 'request' || thread.status !== 'done' || !thread.linked_song_id || thread.blocked) return unavailable();
    const song = (await readSongs(context.env)).find(value => value.id === thread.linked_song_id);
    if (!song || (song.status && song.status !== 'published') || (song.albumId === 'global-barangay' && context.env.GLOBAL_BARANGAY_RELEASED !== 'true')) return unavailable();
    const keyFor = value => {
      if (!value) return null;
      const source = new URL(value, url.origin);
      if (source.protocol !== 'https:' || ![url.origin, 'https://dj-buang.com', 'https://www.dj-buang.com'].includes(source.origin)) return null;
      return fileKey(source.href, source.origin);
    };
    if (asset === 'info') {
      if (!keyFor(song.audioUrl)) return unavailable();
      return json({ title: song.title, artist: song.artist || 'DJ-Buang', hasCover: Boolean(keyFor(song.coverUrl)), durationSeconds: song.durationSeconds || null });
    }
    const key = keyFor(asset === 'audio' ? song.audioUrl : song.coverUrl); if (!key) return unavailable();
    const object = await context.env.FILES.get(key, { range: context.request.headers }); if (!object) return unavailable();
    const type = object.httpMetadata?.contentType || '';
    if (!(asset === 'audio' ? audioTypes : imageTypes).test(type)) return unavailable();
    const headers = new Headers({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Accept-Ranges': 'bytes' });
    headers.set('Content-Length', String(object.range ? object.range.length : object.size));
    if (object.range) headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    return new Response(object.body, { status: object.range ? 206 : 200, headers });
  } catch { return json({ error: 'Finished song temporarily unavailable.' }, 503); }
}
