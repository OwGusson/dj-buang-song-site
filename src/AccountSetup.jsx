import { useState } from "react";
import { supabase } from "./supabase";

export default function AccountSetup({ onComplete }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (password.length < 12 || password !== confirmation) {
      setError("Use at least 12 characters and enter the same password twice."); return;
    }
    setBusy(true); setError("");
    const result = await supabase.auth.updateUser({ password });
    if (result.error) { setError("Password setup failed. Please request a fresh invitation or recovery link."); setBusy(false); return; }
    await supabase.auth.signOut();
    setPassword(""); setConfirmation("");
    window.history.replaceState({}, "", window.location.pathname);
    onComplete();
  }
  return <form onSubmit={submit} style={{ display: "grid", gap: 16, maxWidth: 460, margin: "40px auto" }}>
    <h2>Set your administrator password</h2>
    <p>Choose a unique password. You’ll set up your authenticator app when you sign in.</p>
    <label>New password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
    <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
  </form>;
}
