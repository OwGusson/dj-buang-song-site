import { fileKey, getAdmin, isPublicSong, readSongs } from "../_lib/security.js";
export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const key = fileKey(url.href, url.origin);
    if (!key) return new Response("File not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const songs = await readSongs(context.env);
    const publicMedia = songs.some((song) => isPublicSong(song, context.env) &&
      [song.coverUrl, song.audioUrl].some((value) => value && fileKey(value, url.origin) === key));
    if (!publicMedia && !(await getAdmin(context, true))) return new Response("File not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const object = await context.env.FILES.get(key, { range: context.request.headers });
    if (!object) return new Response("File not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("accept-ranges", "bytes");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    if (!/^(audio\/(mpeg|wav|x-wav|flac|x-flac|ogg|mp4)|image\/(jpeg|png|webp))$/.test(object.httpMetadata?.contentType || "")) {
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Disposition", "attachment");
    }
    if (object.range) {
      headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
      headers.set("content-length", String(object.range.length));
      return new Response(object.body, { status: 206, headers });
    }
    headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  } catch { return new Response("Service temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
