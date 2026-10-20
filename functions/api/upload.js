import { fileKey, json } from "../_lib/security.js";

const TYPES = new Map([
  ["image/jpeg", ["jpg", "jpeg"]], ["image/png", ["png"]], ["image/webp", ["webp"]],
  ["audio/mpeg", ["mp3"]], ["audio/wav", ["wav"]], ["audio/x-wav", ["wav"]],
  ["audio/flac", ["flac"]], ["audio/x-flac", ["flac"]], ["audio/ogg", ["ogg"]], ["audio/mp4", ["m4a"]],
]);
const MAX_AUDIO = 100 * 1024 * 1024;
const MAX_IMAGE = 10 * 1024 * 1024;
function signatureMatches(bytes, extension) {
  const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
  switch (extension) {
    case "jpg": case "jpeg": return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    case "png": return [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n);
    case "webp": return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    case "wav": return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
    case "mp3": return ascii(0, 3) === "ID3" || (bytes[0] === 255 && (bytes[1] & 224) === 224);
    case "flac": return ascii(0, 4) === "fLaC";
    case "ogg": return ascii(0, 4) === "OggS";
    case "m4a": return ascii(4, 4) === "ftyp";
    default: return false;
  }
}
export async function onRequestPost(context) {
  if (!context.data.admin) return json({ error: "Administrator sign-in required" }, 401);
  if (Number(context.request.headers.get("Content-Length")) > MAX_AUDIO + 65536) return json({ error: "Upload too large" }, 413);
  let size = 0;
  const bounded = context.request.body?.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > MAX_AUDIO + 65536) throw new RangeError("Upload too large");
      controller.enqueue(chunk);
    },
  }));
  if (!bounded) return json({ error: "Missing file" }, 400);
  let form;
  try { form = await new Response(bounded, { headers: context.request.headers }).formData(); }
  catch { return json({ error: "Invalid or oversized upload" }, size > MAX_AUDIO + 65536 ? 413 : 400); }
  const file = form.get("file");
  if (!file || typeof file === "string" || !file.size) return json({ error: "Missing file" }, 400);
  const extension = file.name.split(".").pop().toLowerCase();
  if (!TYPES.get(file.type)?.includes(extension)) return json({ error: "Unsupported file type" }, 415);
  if (file.size > (file.type.startsWith("image/") ? MAX_IMAGE : MAX_AUDIO)) return json({ error: "Upload too large" }, 413);
  if (!signatureMatches(new Uint8Array(await file.slice(0, 16).arrayBuffer()), extension)) return json({ error: "File content does not match its type" }, 415);
  const fileName = `media/${crypto.randomUUID()}.${extension}`;
  await context.env.FILES.put(fileName, file.stream(), { httpMetadata: { contentType: file.type } });
  return json({ success: true, fileName, fileUrl: `${new URL(context.request.url).origin}/files/${fileName}` });
}
export async function onRequestDelete(context) {
  if (!context.data.admin) return json({ error: "Administrator sign-in required" }, 401);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const key = typeof body?.url === "string" && fileKey(body.url, new URL(context.request.url).origin);
  if (!key || !/^(media\/[0-9a-f-]+|\d+-[^/]+)\.(jpg|jpeg|png|webp|mp3|wav|flac|ogg|m4a)$/i.test(key)) return json({ error: "Invalid media URL" }, 400);
  await context.env.FILES.delete(key);
  return json({ success: true });
}
