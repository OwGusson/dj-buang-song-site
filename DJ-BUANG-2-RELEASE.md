# DJ-Buang 2.0 — review candidate

This change replaces the public landing page with the reviewed DJ-Buang / PHIL-ICE design, preserves the existing administrator account and MFA, and adds a new studio dashboard. Production deployment is not performed by building or viewing the local preview.

## Included

- Fluid desktop layout and mobile breakpoints, supplied logo/banner, Global Barangay concept feature and future merchandise sketches.
- Live catalog, persistent player, search, featured/download filters, shared song links, lyrics PDFs, likes and existing interaction tracking.
- Verified-email private conversations replace public submissions at coordinated cutover. Thread ownership, opt-in publishing/credit consent, Turnstile, atomic spam limits and an MFA-protected Studio inbox are implemented. Artist replies queue generic private-inbox notification emails. See PRIVATE-CONVERSATIONS.md for configuration and cutover requirements.
- Studio verifies the existing server session and MFA before reading songs, request/message inboxes or analytics. It supports uploading/editing songs, visibility/publishing, featured and download controls, completion/read status and linking a finished song to a request.
- Boolean `downloadable` is stored in the R2 song catalog. Missing fields retain the old download behavior. The download endpoint enforces explicit false, public publishing status and administrator authorization for private media. Streaming is still possible and remains recordable; this is not DRM.
- Classic administration remains at `/studio/classic`, including existing account setup/recovery. The old personal PayPal donation URL is removed from this fallback as well as omitted from the new site. Financial support remains inactive until supporter-visible identity has been verified. No shop checkout or payment account is created.
- An additive private conversation migration is applied. Legacy public insert policies remain until coordinated cutover. Resend SMTP and server credentials are configured; public signup and new contact features remain off. R2 content is preserved.

## Validation

- Production build passes.
- 40 tests pass, including endpoint/security regressions, isolated PGlite ownership/RPC/RLS tests, Turnstile and email verification, spam limits, notification privacy and download access checks.
- Targeted ESLint passes for the new frontend, entry point, download handler and tests. The legacy App retains pre-existing lint issues.
- Browser: real 33-song public catalog, filtering, protected Studio sign-in and request form render. Responsive layout inspected in a 390px iframe viewport. A physical phone has not been tested.
- Local preview blocks production mutations and interaction tracking. Classic admin is disabled locally for the same reason. Supabase authentication is real; administrators can review their existing inbox after signing in.
- Remaining acceptance check: the owner signs in with password + authenticator and reviews the authenticated studio. Successful production form submission and media uploads still need post-deployment checks; local preview does not write to production.

## Release and rollback

Deploy the reviewed branch through the existing Cloudflare Pages project. Keep its existing R2 FILES binding, server-only secrets, auth settings, fail-closed mode, and restrictions on older preview deployments. Do not deploy the standalone early prototype or its local media proxy.

Rollback by redeploying the previous production commit. The new download field is additive; existing catalog entries and files are preserved. Song uploads retain replaced files rather than deleting them automatically. Concurrent catalog edits remain a known limitation of the existing R2 catalog design.
