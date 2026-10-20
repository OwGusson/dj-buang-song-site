import { getAdmin, json } from "../_lib/security.js";

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname.replace(/\/+$/, "");
  const protectedRoute = (path === "/api/session" && context.request.method !== "DELETE") || path === "/api/upload" ||
    (path === "/api/songs" && !["GET", "HEAD"].includes(context.request.method));
  try {
    if (protectedRoute) {
      const origin = context.request.headers.get("Origin");
      if (origin && origin !== new URL(context.request.url).origin) return json({ error: "Forbidden origin" }, 403);
      context.data.admin = await getAdmin(context, false, path !== "/api/session");
      if (!context.data.admin) return json({ error: "Administrator sign-in required" }, 401);
    }
    const response = await context.next();
    const secured = new Response(response.body, response);
    secured.headers.set("Cache-Control", "no-store");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    return secured;
  } catch { return json({ error: "Service temporarily unavailable" }, 503); }
}
