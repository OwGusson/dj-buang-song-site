import { isPublicSong, json, readLimitedText, readSongs } from "../_lib/security.js";

export async function onRequestPost(context) {
  const origin = context.request.headers.get("Origin");
  if (origin && origin !== new URL(context.request.url).origin) return json({ error: "Forbidden origin" }, 403);
  const SUPABASE_URL = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const { SUPABASE_SERVICE_ROLE_KEY, INTERACTION_HASH_SECRET } = context.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !INTERACTION_HASH_SECRET) return json({ error: "Interactions not configured" }, 503);
  if (Number(context.request.headers.get("Content-Length")) > 2048) return json({ error: "Request too large" }, 413);
  let body;
  try {
    const text = await readLimitedText(context.request, 2048);
    body = JSON.parse(text);
  } catch (error) { return json({ error: "Invalid or oversized request" }, error instanceof RangeError ? 413 : 400); }
  if (!body || typeof body.songId !== "string" || !["like", "open", "play_start", "play_25", "play_50", "play_75", "play_finished", "download_song", "download_lyrics"].includes(body.eventType)) return json({ error: "Invalid interaction" }, 400);
  const songs = await readSongs(context.env);
  if (!songs.some((song) => song.id === body.songId && isPublicSong(song, context.env))) return json({ error: "Song not found" }, 404);
  // CF supplies this header at the edge; never trust a forwarded client IP header.
  const ip = context.request.headers.get("CF-Connecting-IP");
  if (!ip) return json({ error: "Client identity unavailable" }, 503);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(INTERACTION_HASH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(ip));
  const actor = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/record_interaction`, {
    method: "POST", headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_song_id: body.songId, p_event_type: body.eventType, p_actor: actor }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return json({ error: "Interaction could not be saved" }, response.status === 400 ? 429 : 503);
  return json(await response.json());
}
