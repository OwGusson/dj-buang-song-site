# Studio analytics

Administrator-only Analytics provides Today, Last 7 days, Last 30 days and All time, using UTC calendar days (Iceland time). Rankings include only songs currently in the administrator's catalog, including private tracks. Album rankings group those tracks by albumId; standalone songs remain in song rankings only.

Dated periods count timestamped song_events: play_start, open, download_song and download_lyrics. play_25 does not count as another play. All-time totals retain song_analytics counters. The all-time daily chart shows only the last 90 days of dated events; it is not a reconstruction of lifetime counters. Missing old event history is not backfilled. Likes remain explicitly lifetime totals because historical likes lack per-like timestamps.

Reads retain the existing administrator MFA and database RLS checks. No schema, policies, credentials, public analytics endpoint or tracking events were changed. Queries select only event ID, song ID, type and timestamp; listener IDs are not loaded. Ordered pages prevent the default 1,000-row limit from silently truncating results. Ranges exceeding 50,000 rows show an error asking for a shorter period rather than partial totals.

Validation: analytics model tests cover UTC boundaries, zero days, deleted songs, milestones, album aggregation, lifetime counter separation, pagination and incomplete-read errors. Build and targeted lint pass. Real administrator reads verified against existing data in local Studio. Public production and album release remain held.
