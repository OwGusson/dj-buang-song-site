import { json } from "../_lib/security.js";
export function onRequestGet(context) {
  if (!context.data.admin) return json({ error: "Administrator sign-in required" }, 401);
  if (!context.data.admin.mfaVerified) return json({ authenticated: false, mfaRequired: true });
  const response = json({ authenticated: true });
  const token = context.request.headers.get("Authorization").slice(7);
  response.headers.set("Set-Cookie", `__Secure-dj-media=${token}; Path=/files/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
  return response;
}

export function onRequestDelete() {
  const response = json({ success: true });
  response.headers.set("Set-Cookie", "__Secure-dj-media=; Path=/files/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
  return response;
}
