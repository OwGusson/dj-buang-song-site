# DJ-Buang security review — 20 October 2026

## Confirmed infrastructure

- GitHub: OwGusson/dj-buang-song-site. Cloudflare Pages deploys `main` automatically.
- Pages project: dj-buang-song-site; production domain: dj-buang.com.
- R2 binding: FILES → dj-buang-files.
- Supabase project: oktnfawoyexhplbsjpzb, PostgreSQL 17, six public application tables.
- Existing Auth users: zero at initial inspection. Intended administrator: djbuang@dj-buang.com.
- Supabase Storage has no buckets. The recorded media URLs use dj-buang.com.

## Findings

1. Anonymous SELECT/UPDATE/DELETE policies expose song requests and private messages. Policy names saying “admin” do not restrict access when the role is `anon` and predicate is `true`.
2. Anonymous clients can overwrite aggregate likes/analytics. Raw event histories are publicly readable.
3. Two privileged analytics functions were publicly executable and four functions used mutable search paths.
4. All application tables granted unnecessary TRUNCATE/REFERENCES/TRIGGER privileges to client roles.
5. Auth site URL is still localhost:3000 and must be corrected before invitations.
6. Cloudflare Functions originally failed open when the free allowance was exhausted.
7. The local .env.local was empty. The new local configuration uses only the project's public publishable key; no server credentials are committed.

## Live fixes completed

- Restricted the two SECURITY DEFINER functions to internal use.
- Set explicit trusted function search paths.
- Removed unnecessary table privileges from anon/authenticated.
- Set Pages Functions to fail closed and verified the displayed setting.
- Applied private-data policies requiring trusted administrator claims and MFA. Anonymous requests/messages/history reads and aggregate overwrites are blocked.
- Stored the two runtime secrets as encrypted Cloudflare values, corrected the Auth site URL, sent the owner invitation, and disabled public/anonymous account signup.
- Protected historical Pages deployment URLs with Cloudflare Access. Verified unsigned requests to an old deployment redirect to sign-in, closing the old-code/storage bypass.
- Supabase advisor reports no security errors or warnings. Two informational no-policy notices are intentional deny-by-default tables in the unexposed dj_private schema.

## Recovery and verification

- A user-authorized private JSON recovery copy of all six application tables is stored outside this repository, under the task workspace's .security-backups directory. It contains personal data and must not be committed or shared.
- Restored all six tables in isolated local Postgres and verified exact row counts: requests 4, private messages 0, song backups 38, likes 28, analytics 48, events 1,140.
- Tested candidate policies and interaction RPC against synthetic and restored data. These are application-table restore checks, not a full managed-database or R2 audio restore.
- 21 endpoint/security tests pass, including MFA enforcement and QR SVG encoding; PostgreSQL policy/RPC/rate-limit checks pass.
- Production frontend and Cloudflare Functions compile. npm audit reports zero known vulnerabilities.
- Seven existing lint errors and one warning in App.jsx remain; newly added modules pass lint.

## Production verification

- The application and database access changes are deployed. Public catalog returns 33 songs with zero private tracks; unsigned admin APIs return 401, internal catalog/private audio return 404, and public audio returns 206 for range requests.
- Live transaction tests confirmed public form inserts and server-owned interaction writes work, with test records rolled back.
- The owner has set a password. End-to-end administrator sign-in verification is waiting on the owner's authenticator enrollment.
- Fixed the enrollment QR's SVG data-URL encoding, added a white scan area and a manual setup-key fallback, and added missing-email form validation.
- Existing private sharing links require administrator sign-in; recipient-scoped sharing remains separate future work.
