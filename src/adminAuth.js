import { supabase } from "./supabase";

export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(path, { ...options, headers, cache: "no-store" });
}

export async function verifyAdmin() {
  const response = await apiFetch("/api/session");
  if (!response.ok) throw new Error("Administrator access could not be verified. Please sign in again.");
  if (!(await response.json()).authenticated) throw new Error("Verify your authenticator code to access administration.");
}
