# Private album review

The 18 owner-confirmed tracks are staged separately from the live catalog in the existing private R2 bucket. The uploaded review manifest is `global-barangay-preview.json`; each track remains a private draft with downloads disabled. The original WAV masters are preserved locally. Review media uses 256 kbps MP3 streaming copies and 1200px WebP covers.

`GET /api/album-preview` only reads this manifest on `codex-dj-buang-2.dj-buang-song-site.pages.dev`, after Supabase verifies the administrator role and MFA. The public domain and other deployment hostnames receive an empty list. The response is never cached. The frontend projects these review tracks into its listening UI only for this administrator review; Studio's normal catalog and the stored drafts are unchanged.

Private media continues to require the existing verified administrator media cookie. The frontend refreshes this cookie through `/api/session` before loading the review catalog. Sign into Studio on the protected preview, then close Studio to review the album. The review label says PRIVATE ALBUM PREVIEW, not OUT NOW. Ordinary listener accounts cannot access this album preview.

No production catalog, album settings, environment variables, Cloudflare Access policies, payment switch, or release switch are changed. `GLOBAL_BARANGAY_RELEASED` remains false. All 18 numbered tracks are confirmed. The review manifest and unreleased media are not committed to Git.

For launch, import the reviewed tracks into the normal catalog through an explicitly authorized release workflow, with the correct public-domain media URLs and final ordering, then coordinate the owner-controlled release switch after the first playthrough. Uploading the review does not perform that release.

Validation: 79 tests pass, production build and targeted ESLint pass. The new access test covers production/other hosts, no session, listener role, MFA level 1, verified administrator MFA, no-store responses and unchanged private draft metadata.
