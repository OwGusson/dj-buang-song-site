import { getAdmin, isPublicSong, json, readSongs } from "../_lib/security.js";
async function saveSongs(env, songs) {
  const previous = await env.FILES.get("data/songs.json");
  if (previous) await env.FILES.put(`data/backups/${Date.now()}-${crypto.randomUUID()}.json`, previous.body);
  await env.FILES.put("data/songs.json", JSON.stringify(songs), { httpMetadata: { contentType: "application/json" } });
}
export async function onRequestGet(context) {
  const admin = await getAdmin(context);
  const songs = await readSongs(context.env);
  return json(admin ? songs : songs.filter(isPublicSong));
}
export async function onRequestPost(context) {
  if (!context.data.admin) return json({ error: "Administrator sign-in required" }, 401);
  const text = await context.request.text();
  if (text.length > 100000) return json({ error: "Song too large" }, 413);
  let song;
  try { song = JSON.parse(text); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!song || typeof song !== "object" || Array.isArray(song) || typeof song.id !== "string" || !/^[\w-]{1,100}$/.test(song.id)) return json({ error: "Invalid song id" }, 400);
  const strings = { title: 300, artist: 300, requestedBy: 300, coverUrl: 2048, audioUrl: 2048, lyrics: 80000, createdAt: 100 };
  const clean = { id: song.id };
  for (const [field, max] of Object.entries(strings)) if (song[field] !== undefined) {
    if (typeof song[field] !== "string" || song[field].length > max) return json({ error: `Invalid ${field}` }, 400);
    clean[field] = song[field];
  }
  for (const field of ["coverUrl", "audioUrl"]) if (clean[field]) {
    try { if (new URL(clean[field]).protocol !== "https:") throw new Error(); }
    catch { return json({ error: `Invalid ${field}` }, 400); }
  }
  if (song.visibility !== undefined && !["public", "private"].includes(song.visibility)) return json({ error: "Invalid visibility" }, 400);
  if (song.status !== undefined && !["published", "hidden", "draft"].includes(song.status)) return json({ error: "Invalid status" }, 400);
  for (const field of ["visibility", "status"]) if (song[field] !== undefined) clean[field] = song[field];
  if (song.featured !== undefined) {
    if (typeof song.featured !== "boolean") return json({ error: "Invalid featured" }, 400);
    clean.featured = song.featured;
  }
  for (const field of ["likes", "sortOrder"]) if (song[field] !== undefined) {
    if (!Number.isFinite(song[field]) || song[field] < 0) return json({ error: `Invalid ${field}` }, 400);
    clean[field] = song[field];
  }
  const songs = await readSongs(context.env);
  const index = songs.findIndex((s) => s.id === clean.id);
  if (index >= 0) songs[index] = { ...songs[index], ...clean };
  else {
    if (!clean.title?.trim()) return json({ error: "Title required" }, 400);
    songs.unshift({ visibility: "private", status: "draft", ...clean });
  }
  await saveSongs(context.env, songs);
  return json({ success: true });
}
export async function onRequestDelete(context) {
  if (!context.data.admin) return json({ error: "Administrator sign-in required" }, 401);
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) return json({ error: "Song id required" }, 400);
  const songs = await readSongs(context.env);
  await saveSongs(context.env, songs.filter((s) => s.id !== id));
  return json({ success: true });
}
