# Security hardening — rollout and recovery notes

The application and access-policy migration were deployed on 20 October 2026. See SECURITY-AUDIT.md for verified live results and the remaining owner authenticator setup step. The checklist below is retained for future deployments and recovery.

## Before deployment

1. Back up the live Supabase database and R2 bucket. Export current Cloudflare configuration and confirm which Git branch deploys production. Never commit exports containing secrets.
2. Create/invite a Supabase Auth administrator. Through a trusted admin API or SQL editor, set `app_metadata.role` to `admin`. Never use `user_metadata` for authorization. Refresh the session after assigning the role. Password-only shared admin login has been removed.
3. Set Cloudflare Functions runtime variables `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the existing VITE equivalents are also accepted). These must match the frontend project. No service-role key belongs in a VITE variable.
4. Run `supabase/security-audit.sql` read-only against the live project. Review table types/defaults, all existing policies, grants, public RPCs, storage policies, and public buckets. The repository contains no schema or deployed-policy snapshot.
5. Test `supabase/hardening.sql` against a staging database after confirming compatibility. This candidate replaces policies on six named tables; it does not secure unknown tables, storage, views, or security-definer functions. Apply together with frontend/Functions changes, not independently.
6. Configure server-only `SUPABASE_SERVICE_ROLE_KEY` and a strong random `INTERACTION_HASH_SECRET` in Cloudflare. The interaction endpoint uses the restricted `record_interaction` RPC, checks the public R2 catalog, hashes the edge-supplied IP, and limits writes to 60/minute/hash. Like counts increment atomically with one like per IP hash/song; shared networks can therefore share a like allowance. Analytics totals aggregate inside the database. Test the candidate SQL against actual column types before release. Review event-query indexes and retention; this first pass recomputes totals from event history, and large histories need incremental aggregation. IP-derived identifiers require an appropriate privacy/retention policy.
7. Enable Auth rate limits and account protections. This patch requires AAL2 (MFA) on administrative API access and database policies, includes TOTP enrollment/challenge during login, and handles invitation/recovery password setup. Set the Auth site URL to `https://dj-buang.com` before inviting the owner. The owner must choose their password and scan the authenticator QR code themselves.
8. Disable direct public R2 bucket/custom-domain access that bypasses `/files/`; verify every legacy media host. Purge previously cached private media/catalog responses at Cloudflare. No-store responses prevent future caching but cannot retract prior downloads or third-party caches.
9. Deploy a preview with an isolated storage binding/database first. Test anonymous, ordinary signed-in, and administrator access. Do not point preview mutations at production storage.
10. Deploy production only after these gates pass. Check mobile playback, range requests, forms, admin edits, deletion, logout, and an actual backup restoration. Remove obsolete `ADMIN_PASSWORD` once migrated.

## Behavior changes

- Every upload and catalog mutation requires a Supabase access token whose account is verified with Auth, has trusted `app_metadata.role=admin`, and has completed MFA (`aal2`).
- Public catalog/media only exposes explicit public, published songs. Private sharing links now require administrator authentication; recipient sharing needs a separate scoped-token feature.
- Admin media uses a Secure, HttpOnly, SameSite=Strict cookie scoped to `/files/`, refreshed by verified `/api/session`. API writes still require a bearer token. Local HTTP previews cannot preview private media with that secure cookie; test HTTPS preview deployments.
- Auth tokens can remain valid until their configured expiry after logout. Use a short JWT expiry, verify recovery/session settings, and demote compromised accounts in trusted app metadata to block Cloudflare API access immediately. RLS claims can remain stale until token renewal/expiry.
- Anonymous visitors no longer load requests/private messages or back up songs. Public forms insert without selecting private records back.
- Private catalogs are no longer persisted to localStorage or restored from an old browser cache. Existing caches are cleared on startup.
- Catalog mutations preserve previous JSON in R2 `data/backups/`. These are catalog-only snapshots, not database or audio backups. Configure lifecycle/retention separately. Existing read/modify/write catalog updates can race across concurrent admins; serialized database writes are still needed for multi-editor use.
- Uploads accept JPEG/PNG/WebP and MP3/WAV/FLAC/OGG/M4A, with extension/MIME/basic signature checks; images are limited to 10 MiB and audio to 100 MiB. Cloudflare plan request limits may be lower. Signature checks are not malware scanning.
- Security headers provide baseline protections; a complete script/connect/media Content Security Policy needs a media/provider inventory.

## Verification

`node --test tests/security.test.mjs`, `npm run build`, and `npm run lint`.
Live RLS, bucket access, WAF/rate limits, MFA, deployed configuration, and restore testing are not verified by local unit tests.
