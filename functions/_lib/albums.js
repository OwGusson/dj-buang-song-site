export const ALBUM_KEY = 'data/albums.json';
export const ALBUM_ID = 'global-barangay';
export const ALBUM_STATES = ['draft', 'available', 'platforms', 'hidden'];
export function defaultAlbum() {
  return { id: ALBUM_ID, title: 'Global Barangay', status: 'available', downloadable: false, coverUrl: '/global-barangay-cover.png', story: 'A meeting point for the Philippines and Iceland. Different places, shared stories, and the PHIL-ICE spirit—brought together in one global barangay.', links: {} };
}
export async function readAlbum(env) {
  const object = await env.FILES.get(ALBUM_KEY);
  if (!object) return defaultAlbum();
  const value = JSON.parse(await object.text());
  if (!value || value.id !== ALBUM_ID || !ALBUM_STATES.includes(value.status) || typeof value.downloadable !== 'boolean') throw Error('Invalid album settings');
  return { ...defaultAlbum(), ...value };
}
export function validateAlbum(value) {
  if (!value || value.id !== ALBUM_ID || !ALBUM_STATES.includes(value.status) || typeof value.downloadable !== 'boolean' || typeof value.story !== 'string' || value.story.length > 2000) throw Error('Check the album settings.');
  const coverUrl = value.coverUrl;
  if (typeof coverUrl !== 'string' || coverUrl.length > 2048 || !coverUrl || /[\\\s]/.test(coverUrl)) throw Error('Add a valid cover URL.');
  if (!coverUrl.startsWith('/') || coverUrl.startsWith('//')) { const url = new URL(coverUrl); if (url.protocol !== 'https:' || url.username || url.password) throw Error('Use an HTTPS cover URL.'); }
  const hosts = { spotify: 'open.spotify.com', apple: 'music.apple.com', youtube: 'music.youtube.com' }, links = {};
  for (const [name, host] of Object.entries(hosts)) {
    const link = value.links?.[name]?.trim(); if (!link) continue;
    const url = new URL(link); if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || link.length > 2048) throw Error('Check the '+name+' platform link.');
    links[name] = url.href;
  }
  if (value.status === 'platforms' && !Object.keys(links).length) throw Error('Add at least one live platform link before choosing platforms only.');
  return { ...defaultAlbum(), status: value.status, downloadable: value.downloadable, story: value.story.trim(), coverUrl, links };
}
