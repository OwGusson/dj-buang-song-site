# DJ-Buang 2.0 — review candidate

This change replaces the public landing page with the reviewed DJ-Buang / PHIL-ICE design, preserves the existing administrator account and MFA, and adds a new studio dashboard. Production deployment is not performed by building or viewing the local preview.

## Included

- Fluid desktop layout and mobile breakpoints, supplied logo/banner, Global Barangay concept feature and future merchandise sketches.
- Live catalog, persistent player, search, featured/download filters, shared song links, lyrics PDFs, likes and existing interaction tracking.
- Verified-email private conversations replace public submissions at coordinated cutover. Thread ownership, opt-in publishing/credit consent, Turnstile, atomic spam limits and an MFA-protected Studio inbox are implemented. Artist replies queue generic private-inbox notification emails. See PRIVATE-CONVERSATIONS.md for configuration and cutover requirements.
- Studio verifies the existing server session and MFA before reading songs, request/message inboxes or analytics. It supports uploading/editing songs, visibility/publishing, featured and download controls, completion/read status and linking a finished song to a request.
- Boolean `downloadable` is stored in the R2 song catalog. Missing fields retain the old download behavior. The download endpoint enforces explicit false, public publishing status and administrator authorization for private media. Streaming is still possible and remains recordable; this is not DRM.
- Classic administration remains at `/studio/classic`, including existing account setup/recovery. The old personal PayPal donation URL is removed from this fallback as well as omitted from the new site. The supplied PayPal hosted support button is integrated; the owner marked its live payment privacy check passed on 22 October 2026. Support remains disabled until the authorized Saturday launch. No merchandise checkout is active.
- An additive private conversation migration is applied. Legacy public insert policies remain until coordinated cutover. Resend SMTP and server credentials are configured; public signup and new contact features remain off. R2 content is preserved.

## Validation

- Production build passes.
- 44 tests pass, including endpoint/security regressions, isolated PGlite ownership/RPC/RLS tests, Turnstile and email verification, spam limits, notification privacy and download access checks.
- Targeted ESLint passes for the new frontend, entry point, download handler and tests. The legacy App retains pre-existing lint issues.
- Browser: real 33-song public catalog, filtering, protected Studio sign-in and request form render. Responsive layout inspected in a 390px iframe viewport. A physical phone has not been tested.
- Local preview blocks production mutations and interaction tracking. Classic admin is disabled locally for the same reason. Supabase authentication is real; administrators can review their existing inbox after signing in.
- The owner has signed in with password and authenticator; Studio section sizing and delete cancellation were verified. Production conversation submission, email delivery and media uploads still need coordinated release checks; local preview does not write to production.

## Release and rollback

Deploy the reviewed branch through the existing Cloudflare Pages project. Keep its existing R2 FILES binding, server-only secrets, auth settings, fail-closed mode, and restrictions on older preview deployments. Do not deploy the standalone early prototype or its local media proxy.

Rollback by redeploying the previous production commit. The new download field is additive; existing catalog entries and files are preserved. Song uploads retain replaced files rather than deleting them automatically. Concurrent catalog edits remain a known limitation of the existing R2 catalog design.

## Studio cleanup and listening polish — 21 October 2026

- Added the Studio Delete action with typed confirmation. The existing MFA-protected catalog endpoint snapshots the catalog and preserves audio/artwork; missing or malformed song IDs fail without writing. Deleting does not silently erase listening history. Studio analytics include only IDs still in the full catalog.
- Stabilized Studio dimensions across sections; the content panel scrolls within the shell. Conversations has a friendly disabled-state notice before coordinated release.
- Banner artwork fills the browser width with a shorter centered crop. Like controls appear on song cards and the player; downloads remain in Lyrics & more.
- Public music-stats endpoint returns only counts and IDs for published public songs. No visitor records, private IDs, or private totals are returned. Errors hide optional counts instead of inventing zero totals. Local preview can use an explicitly labeled public-only snapshot in ignored .preview/music-stats.json; production uses live server counts.
- Forty-four tests pass, including public-count privacy and recoverable song deletion. Build and targeted lint pass. Browser checks confirmed fixed dimensions across five Studio tabs, delete cancellation, visible likes and a 390px mobile layout.
- Authorized production cleanup completed separately from deployment: four existing legacy requests (IDs 5, 6, 9, 10), thirteen obsolete analytics rows and eighty-three related events were removed after matching IDs to the full R2 catalog. Current public and private song analytics were preserved. Recovery copies stay outside this repository in the task's private backup folder.

These UI/API changes remain on the local 2.0 branch; the current public website has not been redeployed. Public signup and private-conversation activation still await the coordinated release checks in PRIVATE-CONVERSATIONS.md.

## Album and listening release additions

See SATURDAY-LAUNCH.md for the Saturday feature set, explicit album release gate, private staging workflow and the owner's agreed post-launch roadmap. The new album page and announcement remain in coming-soon mode. No current work-in-progress audio was uploaded. The queue and discovery panels use the existing released public collection in the local preview.
