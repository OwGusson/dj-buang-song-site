# Verified private conversations

Visitor sessions are separate from the administrator Supabase client. Email OTP establishes mailbox control; it is not verification of a person's legal identity. The visitor never gains administrator access. Administrator conversations still require trusted app_metadata.role and AAL2 at the edge.

All conversation tables live in the unexposed dj_private schema with RLS enabled and no browser grants or policies. Only the service role may execute contact_dispatch and contact_notification_jobs. The edge validates the bearer through Supabase Auth, uses the returned user id and confirmed email, computes admin status itself, strips unexpected fields, validates Turnstile action/hostname and hashes the Cloudflare edge IP. Raw IPs are not stored.

Database transactions serialize user and network writes. Limits: five new conversations in 24 hours, two active requests, 60 seconds between new conversations, 30 seconds between replies, 20 listener posts in 24 hours, 30 new conversations/network/day, 120 replies/network/hour. Shared networks may reach those aggregate limits. Turnstile and email verification reduce abuse but do not establish one account per person.

Song publishing and nickname credit default off and are separate from private conversation data. Only the owner can change those consents; the studio displays them. Linking does not publish a song. Administrators must honor consent when publishing. Historical submissions are not automatically claimed by a new listener account, even if email addresses match.

Artist replies create notification jobs in the same transaction. Only the verified thread email receives notifications. Emails contain a fixed DJ-Buang inbox link and no message body. Resend uses a job-specific idempotency key. Failed sends remain in the outbox; /api/contact-notifications can retry up to five attempts after MFA administrator verification. It is not a public email relay. There is no scheduled retry worker yet.

## Completed song playback

After an administrator marks a song request done and links a published-status song, its owner can listen inside that conversation. A private song remains private; publication and nickname-credit consents are unchanged. Draft/hidden songs, blocked threads, unfinished requests and unreleased Global Barangay tracks do not deliver audio. Marking a request done is the explicit delivery step, so review its linked song before saving.

The conversation-song endpoint verifies the bearer with Auth and calls the same ownership-checked detail RPC on every metadata or media request. It returns only the currently linked R2 object, never a storage URL or general media credential. Anonymous users, other listeners, unapproved preview emails and administrators without MFA are denied. Audio is fetched with the listener bearer into a temporary browser object URL; closing the conversation stops playback and revokes that URL. The current player buffers the file before playback, so large WAV deliveries can take longer; prefer streaming MP3 copies. The browser can copy audio it receives—listening-only is an interface setting, not DRM.

The optional support hint follows the player, explaining that support helps fund better music tools/software. The support window is always reachable; PayPal checkout still requires SUPPORT_ENABLED=true. Linking/completing does not itself send email; send the artist's final reply after saving the link/status to trigger the notification.

## Coordinated release

1. Verify mail.dj-buang.com in Resend using its supplied DNS records, leaving root Gmail forwarding intact. Restrict the sending key to this domain. Configure it as Supabase SMTP password (smtp.resend.com, username resend, TLS port 465), sender no-reply@mail.dj-buang.com, display name DJ-Buang, and as Cloudflare's encrypted RESEND_API_KEY. Set CONTACT_EMAIL_FROM to DJ-Buang <no-reply@mail.dj-buang.com>.
2. Create a managed Turnstile widget for dj-buang.com and the protected Pages preview hostname if needed. Store its public site key and encrypted server secret in Cloudflare. Configure the same secret in Supabase Auth CAPTCHA at cutover.
3. Use email-code-template.html for Magic Link and Confirm Signup emails. Preserve Invite and Recovery templates. Set a short OTP lifetime and resend cooldown; leave rate limits in place.
4. The additive private_conversations migration is applied and verified in production. Existing public forms remain active until cutover. Supabase advisor reports the intentional private-table deny-default INFO notices and the pre-existing leaked-password-protection WARN; no new database WARN/ERROR findings.
5. Deploy the tested frontend and Functions before enabling Auth CAPTCHA, so administrator login has its bot-check UI. Enable verified listener signup only when CAPTCHA and reliable SMTP are ready; anonymous auth remains disabled.
6. Apply supabase/contact-cutover.sql during that release to remove direct legacy anonymous/authenticated insert policies. It preserves old records and MFA admin access. Enable AUTH_CAPTCHA_ENABLED and CONTACTS_ENABLED only after checks are complete.
7. Test a listener email code, a private request, a reply, consent defaults, status update, limits, blocking and notification delivery end to end. Neither UI previews nor mocked tests prove email delivery. Do not announce the feature before this passes.

Local development intentionally keeps verification disabled and blocks conversation writes. The browser can review the private-inbox sign-in design without sending email. Automated tests exercise the full RPC in isolated PostgreSQL (PGlite), endpoint authorization and bot validation with synthetic identities. A production database test created/read a synthetic thread inside a transaction and rolled it back.

Existing legacy administrator tools remain available only after verifying the new MFA studio session. Do not re-enable legacy browser inserts as a shortcut. Long-term conversation retention, user erasure and scheduled outbox retries still need product decisions before high-volume use.

## Configuration verified 21 October 2026

Resend verified mail.dj-buang.com (Ireland). The three supplied records were added under that subdomain; root Gmail forwarding was preserved. A domain-scoped sending key is stored encrypted in Supabase custom SMTP and Cloudflare production secrets. Supabase SMTP is enabled at smtp.resend.com:465 with sender DJ-Buang <no-reply@mail.dj-buang.com>. Its saved state was checked after reloading.

Managed Turnstile was created for dj-buang.com with preclearance off. Its server secret is encrypted in Cloudflare and its site key is configured. CONTACTS_ENABLED and AUTH_CAPTCHA_ENABLED remain false. These Cloudflare changes take effect on the next deployment. Supabase CAPTCHA enforcement and public signup remain unchanged until cutover. OTP templates and end-to-end delivery checks remain release tasks. An unused initial Resend setup key remains to be revoked after the working configuration is verified.

## Launch preparation — 21 October 2026

Magic Link / OTP and Confirm Signup email templates were saved and their rendered previews verified with the branded {{ .Token }} code template. The email OTP lifetime was set to 600 seconds; OTP length remains eight digits. Administrator invitation and recovery templates were preserved. Saved SMTP configuration remains enabled with the encrypted stored password.

Production PayPal loading now requires SUPPORT_ENABLED=true. Its default is false until a supporter receipt has been checked for unwanted legal-name disclosure. Local development retains the clearly labeled real-payment preview. A hosted product title alone does not establish receipt privacy.

The Resend notification path now has explicit tests for its recipient, idempotency key, successful acknowledgment and retryable failure. Forty-six tests pass. The remaining release test requires a separate listener email address entered privately by the owner; do not commit that address or any received code.

## Launch hold — Saturday, 24 October 2026

The owner clarified that the DIA exclusive first album playthrough comes before the website and album release. Do not merge the release PR, update the production branch, activate listener signup/CAPTCHA, apply the legacy-policy cutover, or publish album tracks before the owner confirms that the playthrough has finished and authorizes the launch. The earlier rollout approval question is superseded by this timing instruction.

Continue private preparation and tests where possible. Exact premiere time remains to be confirmed because the promotional poster lists 22:00 for both the Philippines and Iceland. These represent different instants: 22:00 PHT is 14:00 Iceland; 22:00 Iceland is 06:00 PHT the following day. Do not set a timer, automatic release or countdown from the inconsistent poster.

Final album audio, track order, publication/download preferences and launch timing still need confirmation. Treat the supplied DIA promotional poster separately from the approved album cover. Keep Spotify availability unannounced until links exist. The owner marked the live PayPal privacy check passed on 22 October 2026. Payments remain disabled until the authorized Saturday rollout.

### Confirmed premiere sequence

- First DIA playthrough: Saturday 24 October 2026, 22:00 Philippines (PHT / UTC+8), 14:00 Iceland (GMT / UTC).
- Website plus album release: AFTER the first playthrough has finished, on the owner's explicit go-ahead. Do not infer its end time or schedule an automatic deployment.
- Second DIA playthrough: Saturday 24 October 2026, 22:00 Iceland; Sunday 25 October 2026, 06:00 Philippines. This is a second airing, not an equivalent timezone label for the first slot.
- The owner is reworking two or three album songs and expects final files on Friday 23 October. Treat the existing folder as work in progress; no current audio has been uploaded or published.
- Read-only local preflight found 18 numbered WAV files, approximately 76.2 minutes / 877.6 MB, all stereo 48 kHz / 16-bit. Header inspection is not a complete audio-quality or final-master check. The private draft inventory stays outside Git. Re-check final files, credits, track order, streaming encodes and download permissions before staging the release.


## PayPal privacy check — passed, 22 October 2026

Owner confirmed the live low-value payment check as passed. Reviewed payer-facing confirmation and transaction details showed DJ-Buang, the artist contact email, and the DJ-Buang card statement descriptor. No legal name, residential address or personal phone was visible in those screens. Do not store transaction identifiers, card details or payer data in this repository. SUPPORT_ENABLED remains false until the authorized Saturday launch.
