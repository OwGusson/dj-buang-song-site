import { json } from "../_lib/security.js";
export function onRequest() {
  return json({ error: "Use Supabase account sign-in" }, 410);
}
