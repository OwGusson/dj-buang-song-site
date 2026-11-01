# DJ-Buang Studio analytics

Studio reports anonymous website sessions and listening activity in Today, Last 7 days, Last 30 days, and Last 90 days. Calendar boundaries and peak listening hours use UTC, which is Iceland time. Song reports cover tracks currently in the Studio library, including hidden and draft tracks; they are not public-catalog totals. Deleted songs are omitted. Administrator activity is excluded. An owner may opt to include events marked as QA.

## Website activity

- Page views and distinct browser-tab sessions for the home page, main sections, song-share view, and album pages.
- First-entry referral source and allowlisted campaign tags, carried through internal navigation for that tab session.
- Approximate country, broad device type, and clicks on supported music/social links or listening actions.
- Destination clicks indicate a click only. They do not confirm a completed stream, follow, save, or pre-save.
- Session IDs are random and held in `sessionStorage`; they do not verify a person or join activity across devices. Studio receives aggregates only.
- The client sends only a referring hostname (no URL path or query), a restricted page key, allowed UTM values, and coarse device/country values. Raw IP addresses and full user-agent strings are not stored in the analytics rows.
- Private inbox pages and Studio are not tracked. Owner/admin events are excluded; QA-tagged admin activity is excluded unless “Include marked QA checks” is selected.

## Campaign tags

Supported sources are facebook, instagram, tiktok, youtube, dia, google, spotify, suno, and other. Supported media and campaign values are allowlisted in `shared/site-analytics.js` and the database validation. Use `global-barangay-launch` for platform-level Global Barangay launch links, including Suno. Ready-to-use links live in the Manager workspace at `output/analytics/CAMPAIGN-LINKS.md`. Do not put names, email addresses, or other personal information in UTM tags.

## Listening activity

- Playback starts count only after the browser's `audio.play()` promise succeeds.
- New 25%, 50%, and 75% milestones measure plausibly advancing media time, not a seek position. A “Finished” event is sent only after natural audio end and at least 95% counted listening time.
- Milestones are deduplicated per playback in both the client and database. A playback that seeks forward does not receive credit for time skipped.
- Estimated listening sessions use a random browser-tab ID for newly measured events. They are not verified people. Album reach is an intersection of sessions that started track 1 and each later track during the selected period; it does not prove order or one continuous listen.
- Dated playback starts and downloads include retained legacy events and new public events. The new session and listened-time milestone measures are available only from the analytics rollout onward and do not backfill older plays.
- Historical distinct-listener estimates are counted from legacy network hashes only. New tab sessions are counted separately; do not add or compare the two measures as if they identified the same people.
- New detailed song events and site page/click rows have 90-day reporting history. New session/playback IDs and listening-time details are cleared after 90 days while deidentified song-event counts remain. Existing pre-update network-hash history is unchanged.
- “Last 90 days” is a dated event window. Its playback-start/download figures are date-filtered; the lifetime playback/download counters and likes are labelled separately and may predate that window. They reflect available counters for current Studio-library tracks, not public-catalog-only totals. The old opens counter is mixed because the earlier client also recorded play starts as opens; it is labelled separately and must not be compared with new song-detail opens. Legacy progress positions are omitted from the new listened-time milestone totals.

## Access and validation

Aggregated website reports are read by the authenticated Studio server using service-role access; the public browser cannot query raw website analytics rows. Song event rows retain the existing RLS policy. The write endpoints validate event, session and playback UUIDs, restricted page/destination/source values, listening thresholds, same-origin requests, and per-IP HMAC rate limits. A scheduled database task prunes site event rows after 90 days and clears new playback identifiers after 90 days.

Run focused checks with:

```sh
node --test tests/analytics.test.mjs tests/site-analytics.test.mjs tests/playback-progress.test.mjs
```
