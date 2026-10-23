import { getAdmin, json } from '../_lib/security.js';

export const PREVIEW_HOST = 'codex-dj-buang-2.dj-buang-song-site.pages.dev';
export async function onRequestGet(context) {
  // A separate review catalog never changes published song metadata or the release gate.
  if (new URL(context.request.url).hostname !== PREVIEW_HOST) return json({ tracks: [] });
  try {
    if (!await getAdmin(context)) return json({ tracks: [] }, 401);
    const object = await context.env.FILES.get('global-barangay-preview.json');
    if (!object) return json({ tracks: [] });
    const tracks = JSON.parse(await object.text());
    if (!Array.isArray(tracks) || tracks.some(song => song.albumId !== 'global-barangay' || song.visibility !== 'private' || song.status !== 'draft' || song.downloadable !== false)) throw Error('Invalid review catalog');
    return json({ tracks: tracks.map(song => ({ ...song, visibility: 'public', status: 'published', downloadable: false })), adminAlbumPreview: true });
  } catch { return json({ error: 'Album preview unavailable.' }, 503); }
}
