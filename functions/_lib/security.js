export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}

export async function readLimitedText(request, limit) {
  if (Number(request.headers.get("Content-Length")) > limit) throw new RangeError("Request too large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RangeError("Request too large"); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function getAdmin(context, allowMediaCookie = false, requireMfa = true) {
  let authorization = context.request.headers.get("Authorization");
  if (!authorization && allowMediaCookie) {
    const token = context.request.headers.get("Cookie")?.split(";").map((c) => c.trim()).find((c) => c.startsWith("__Secure-dj-media="))?.slice(18);
    if (token) authorization = `Bearer ${token}`;
  }
  if (!authorization?.startsWith("Bearer ")) return null;
  const url = context.env.SUPABASE_URL || context.env.VITE_SUPABASE_URL;
  const key = context.env.SUPABASE_PUBLISHABLE_KEY || context.env.SUPABASE_ANON_KEY || context.env.VITE_SUPABASE_PUBLISHABLE_KEY || context.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Authentication is not configured");
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: key, Authorization: authorization }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429) throw new Error("Authentication unavailable");
    return null;
  }
  const user = await response.json();
  // app_metadata is set by trusted administrators; user_metadata is user-editable.
  if (!user.id || user.app_metadata?.role !== "admin") return null;
  // This payload is only inspected AFTER Auth has validated the same token.
  let claims;
  try {
    const payload = authorization.slice(7).split(".")[1];
    claims = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
  const mfaVerified = claims.aal === "aal2";
  if (requireMfa && !mfaVerified) return null;
  return { ...user, mfaVerified };
}

export function isPublicSong(song, env = {}) {
  return song.visibility === "public" && (song.status === "published" || !song.status) &&
    (song.albumId !== 'global-barangay' || env.GLOBAL_BARANGAY_RELEASED === 'true');
}

export async function readSongs(env) {
  const object = await env.FILES.get("data/songs.json");
  const songs = object ? JSON.parse(await object.text()) : [];
  if (!Array.isArray(songs)) throw new Error("Invalid song catalog");
  return songs;
}

export function fileKey(value, origin) {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || !url.pathname.startsWith("/files/")) return null;
    const key = decodeURIComponent(url.pathname.slice(7));
    if (!key || key.startsWith("data/") || key.includes("..") || key.includes("\\") || [...key].some((c) => c.charCodeAt(0) < 32)) return null;
    return key;
  } catch { return null; }
}
