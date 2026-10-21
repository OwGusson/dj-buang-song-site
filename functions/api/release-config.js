import { json } from '../_lib/security.js';
export function onRequestGet({ env }) {
  // Explicit owner-controlled switch. No clock, countdown or automatic release.
  return json({ globalBarangayReleased: env.GLOBAL_BARANGAY_RELEASED === 'true' });
}
