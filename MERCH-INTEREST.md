# Merch interest research and finished-song support

Merch concept viewers have separate interest forms for the original DJ-Buang / PHIL-ICE range and the Global Barangay Night / Island-Ice capsule. Respondents can select multiple design/item pairs and suggest a per-item price in EUR, USD, GBP, ISK or PHP. Prices are optional; null means unsure and zero explicitly means free-only interest. No names, email, free text or payment details are collected. This is research, not an order, reservation, deposit or commitment.

Responses are private in dj_private.merch_interest. Public/listener table and RPC access are revoked; only server-held service credentials can call the invoker RPCs. The survey API validates allowlisted data, same-origin browser requests, bounded body size and Turnstile action/hostname. A purpose-separated one-way connection hash limits repeated submissions (five per connection/day, 30-second cooldown); raw IPs are not stored. UUID retries are idempotent. Results require an administrator MFA session and expose only aggregates. Price statistics are separated by currency and include sample size, median, full range and middle 50%. Response counts are not unique people or sales forecasts.

Survey availability follows CONTACTS_ENABLED and required server configuration. Protected preview uses CONTACT_TEST_MODE and stores/queries test responses separately. Production frontend and release switches are unchanged. Local development allows form inspection with saves disabled.

Studio > Merch interest shows the private summary. SQL source: supabase/merch-interest.sql. Applied as an additive schema change through the connected Supabase SQL tool. Live RLS/grants checked; a synthetic live transaction was rolled back, leaving zero fabricated responses. Database advisors report only expected private-schema RLS-without-policy notices (service-only tables), plus the pre-existing leaked-password-protection warning; no new warning from this feature.

Completed linked song requests show a quiet optional-support note explaining that support helps pay for better tools and software. It never affects request handling or song access. Its button appears only when supportEnabled is true and opens the existing guarded PayPal flow. No message or email is automatically sent, and no payment was made during testing.

Validation: full 74-test suite, build, targeted lint, local survey form, and completed-request visual check. Deployment verification is recorded in the task conversation.
