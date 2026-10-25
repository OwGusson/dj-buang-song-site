import { supabase } from "./supabase";
import {trackStudioSession} from "./site2/studio-session-ui";

export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(options.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  return fetch(path, { ...options, headers, cache: "no-store" });
}

export async function verifyAdmin() {
  const response = await apiFetch("/api/session");
  if (!response.ok) throw new Error("Administrator access could not be verified. Please sign in again.");
  let access=await response.json();
  if(access.reauthRequired){const started=await apiFetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(started.ok)access=await started.json();}
  if(!access.authenticated)throw new Error('Sign in again and verify your authenticator if requested.');
  trackStudioSession(access);
}
