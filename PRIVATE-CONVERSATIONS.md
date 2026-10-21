# Verified private conversations

Visitor sessions are separate from the administrator Supabase client. Email OTP establishes mailbox control; it is not verification of a person's legal identity. The visitor never gains administrator access. Administrator conversations still require trusted app_metadata.role and AAL2 at the edge.

All conversation tables live in the unexposed dj_private schema with RLS enabled and no browser grants or policies. Only the service role may execute contact_dispatch and contact_notification_jobs. The edge validates the bearer through Supabase Auth, uses the returned user id and confirmed email, computes admin status itself, strips unexpected fields, validates Turnstile action/hostname and hashes the Cloudflare edge IP. Raw IPs are not stored.

Database transactions serialize user and network writes. Limits: five new conversations in 24 hours, two active requests, 60 seconds between new conversations, 30 seconds between replies, 20 listener posts in 24 hours, 30 new conversations/network/day, 120 replies/network/hour. Shared networks may reach those aggregate limits. Turnstile and email verification reduce abuse but do not establish one account per person.

Song publishing and nickname credit default off and are separate from private conversation data. Only the owner can change those consents; the studio displays them. Linking does not publish a song. Administrators must honor consent when publishing. Historical submissions are not automatically claimed by a new listener account, even if email addresses match.

Artist replies create notification jobs in the same transaction. Only the verified thread email receives notifications. Emails contain a fixed DJ-Buang inbox link and no message body. Resend uses a job-specific idempotency key. Failed sends remain in the outbox; /api/contact-notifications can retry up to five attempts after MFA administrator verification. It is not a public email relay. There is no scheduled retry worker yet.

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
