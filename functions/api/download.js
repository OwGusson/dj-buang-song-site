import { fileKey, getAdmin, isPublicSong, json, readSongs } from '../_lib/security.js';
export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const song = (await readSongs(context.env)).find(s => s.id === url.searchParams.get('id'));
    if (!song || (!isPublicSong(song) && !await getAdmin(context, true))) return json({ error: 'Song not found' }, 404);
    if (song.downloadable === false) return json({ error: 'This song is available for listening only' }, 403);
    const key = fileKey(song.audioUrl, url.origin);
    if (!key) return json({ error: 'Audio unavailable' }, 404);
    const object = await context.env.FILES.get(key);
    if (!object) return json({ error: 'Audio unavailable' }, 404);
    const extension = key.match(/\.(mp3|m4a|wav|flac|ogg)$/i)?.[1] || 'audio';
    const title = Array.from(song.title || 'DJ-Buang').filter(c => c.charCodeAt(0) >= 32 && c !== '/' && c !== '\\').join('').slice(0, 150);
    return new Response(object.body, { headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="DJ-Buang.${extension}"; filename*=UTF-8''${encodeURIComponent(title + '.' + extension).replace(/'/g, '%27')}`,
      'Content-Length': String(object.size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return json({ error: 'Download temporarily unavailable' }, 503); }
}
