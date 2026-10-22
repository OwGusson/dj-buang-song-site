# Saturday launch checklist

Launch remains held until the owner confirms the first DIA playthrough has finished on Saturday, 24 October 2026. The first airing is 14:00 Iceland / 22:00 Philippines; the second is 22:00 Iceland / 06:00 Sunday Philippines. There is no automatic deployment, timer or scheduled album release.

## Prepared in the preview

- Shareable album page: /albums/global-barangay, with the approved cover, draft album story, ordered track rows, credits, lyric details and Play album.
- A session-only listening queue, play-next additions/removal, previous/next and shuffle of upcoming tracks. Playing an album keeps its own queue context and stops at its end instead of jumping into unrelated songs.
- Most played and Most loved discovery panels, based only on actual counts for currently public songs. Zero-count entries and missing/deleted/private songs are not presented as popular.
- A coming-soon announcement that becomes an out-now announcement only when the manual release flag is enabled AND published album tracks exist.
- Studio fields for album assignment, track number and featured-artist credits. The album cover is used when a Global Barangay track has no individual artwork. Standalone songs are unchanged.

## Album preparation on Friday

The source folder is work in progress. Do not upload its current versions. Confirm final songs/replacements, titles, track order, lyrics, artist credits and listening/download preferences with the owner. Check the finished masters and create web streaming copies while preserving originals. Use individual artwork where supplied, otherwise use the album cover.

Stage songs with albumId=global-barangay, albumTrackNumber=1..99, credits, lyrics and the chosen download setting. Keep them private drafts while reviewing. Do not commit unreleased titles, private notes, masters or credentials to the repository.

## Manual release protection

GLOBAL_BARANGAY_RELEASED defaults to false. The server gate applies to public catalog responses, direct media, downloads, interactions and public statistics. The frontend release-config is presentation only; hiding the album in the browser is not the security boundary. Administrator MFA access is preserved.

When the final album has been reviewed and the first playthrough is complete, obtain the owner's launch go-ahead, coordinate the album's public/published metadata and explicit server release flag, then deploy. Verify the album page, complete album playback order, individual lyric/credit views, chosen downloads and anonymous media access. Confirm no private drafts are exposed. Do not announce Spotify availability until a real release link exists.

Private inbox signup, CAPTCHA, delivery checks and legacy policy cutover still follow PRIVATE-CONVERSATIONS.md. PayPal privacy check passed on 22 October 2026, confirmed by the owner after a live low-value payment and review of payer-facing screens. Seller details showed DJ-Buang and the artist email, with no legal name, home address or personal phone visible in the reviewed screens. Keep SUPPORT_ENABLED=false until the authorized Saturday rollout; enable it as part of that release. This records the tested flow, not a guarantee of anonymity in all PayPal processes.

## Agreed next phase after launch

- Favourites: a private saved collection, distinct from public like counts; decide account storage and retention before implementation.
- Request progress: a clear Received / In progress / Ready view inside each verified listener's private conversation, using the existing request statuses.
- A short DJ-Buang / PHIL-ICE story using the artist identity and Philippines–Iceland connection. Keep the owner's legal name and personal contact details private.

## Validation

56 tests pass, including album order, queue/shuffle behavior, preserving album metadata and server-side pre-release isolation. Production build and targeted ESLint pass. Browser checks cover real public-song queue playback, next/pause/shuffle, pre-release album routing, discovery counts and a 390px phone viewport without horizontal overflow. The released album UI was exercised with synthetic tracks only; real album listening and final-master checks remain pending Friday's files. No application tables or R2 catalog/audio have been modified for these features.
