# Studio album controls

Studio > Albums manages Global Barangay separately from individual songs. Assigned tracks remain editable under Songs and through the album track list.

- Draft or Hidden removes the album and its tracks from public view.
- Available allows website playback once the separate GLOBAL_BARANGAY_RELEASED server switch is literally true.
- Streaming platforms only keeps the album page and published public track metadata, with real Spotify, Apple Music, or YouTube Music links. Website audio, downloads, interactions, and listening statistics exclude its tracks.
- Album downloads default off. Allowing them also requires each track to permit downloads.

Settings are stored in data/albums.json. Each update requires verified administrator MFA, validates destinations, backs up the previous settings, and leaves song records and media intact. Save confirmation identifies the number of assigned tracks affected. These controls cannot override the Saturday release hold. Existing browser buffers or previously downloaded files cannot be recalled.

The local preview remains read-only. Its eight confirmed album tracks are local fixtures; they have not been uploaded by this change. Production publication remains held for the owner's explicit go-ahead after the first playthrough.

Validation: 63 automated tests passed, production build passed, local Studio form and confirmation checked with eight assigned tracks.
