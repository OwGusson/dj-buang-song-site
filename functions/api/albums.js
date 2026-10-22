import { getAdmin, json, readLimitedText } from '../_lib/security.js';
import { ALBUM_KEY, readAlbum, validateAlbum } from '../_lib/albums.js';
export async function onRequestGet(context) {
  try {
    const album = await readAlbum(context.env), admin = await getAdmin(context);
    if (admin) return json({ album, releaseHeld: context.env.GLOBAL_BARANGAY_RELEASED !== 'true' });
    if (context.env.GLOBAL_BARANGAY_RELEASED !== 'true') return json({ album: { id: album.id, status: ['draft','hidden'].includes(album.status) ? album.status : 'available' } });
    if (['draft','hidden'].includes(album.status)) return json({ album: { id: album.id, status: album.status } });
    let tracks = [];
    if (album.status === 'platforms') {
      const object = await context.env.FILES.get('data/songs.json'), songs = object ? JSON.parse(await object.text()) : [];
      tracks = songs.filter(song => song.albumId === album.id && song.visibility === 'public' && (!song.status || song.status === 'published')).sort((a,b)=>(a.albumTrackNumber||999)-(b.albumTrackNumber||999)).map(song=>({ title: song.title, artist: song.artist, credits: song.credits, albumTrackNumber: song.albumTrackNumber, durationSeconds: song.durationSeconds }));
    }
    return json({ album: { ...album, tracks } });
  } catch { return json({ error: 'Album settings unavailable.' }, 503); }
}
export async function onRequestPost(context) {
  try {
    const origin = context.request.headers.get('Origin');
    if (origin && origin !== new URL(context.request.url).origin) return json({ error: 'Forbidden origin.' },403);
    if (!await getAdmin(context)) return json({ error: 'Administrator MFA sign-in required.' },401);
    let album; try { album = validateAlbum(JSON.parse(await readLimitedText(context.request,12000))); } catch (error) { return json({ error: error.message },400); }
    const previous = await context.env.FILES.get(ALBUM_KEY);
    if (previous) await context.env.FILES.put(`data/backups/albums-${Date.now()}-${crypto.randomUUID()}.json`,previous.body);
    await context.env.FILES.put(ALBUM_KEY,JSON.stringify(album),{httpMetadata:{contentType:'application/json'}});
    return json({success:true});
  } catch { return json({ error: 'Album settings could not be saved.' },503); }
}
