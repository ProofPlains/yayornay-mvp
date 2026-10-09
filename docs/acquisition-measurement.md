# Acquisition and activation measurement

Production rollout was authorized on 9 October 2026 after the owner confirmed there are no live customers. Use the phased process below: backend first, cleanup disabled, frontend next, controlled verification, cleanup last. Deployment status and recovery details are recorded in `docs/acquisition-rollout.md`.

## Verified baseline and drift

- GitHub `main`: `e02e3ecddc78ce0020458eb17ecc6e5135b99a47`, verified 9 October 2026. The initial local checkout was `7596ea5` with substantial staged, unstaged, and untracked work. That checkout was preserved. Implementation uses a separate `codex/acquisition-activation` worktree at verified main.
- Live Supabase project: `evediwsocfbalzbzdden` (display name HappySnap), PostgreSQL 17.6. Read-only inspection covered public columns, constraints, indexes, all public function definitions, triggers, public/storage policies, grants, bucket configuration, scheduled-job names, deployed Edge source, migration history, and security advisors.
- Production `submit-feedback` v3 was absent from GitHub. Its retrieved source is the baseline for the checked-in replacement; an exact rollback reference is in `tests/fixtures/submit-feedback.production-v3.ts`. No other existing Edge Function is replaced.
- The deployed support overview v57 and its shared fulfilment source differ from the partial checked-in backend. This change uses a new authenticated report RPC rather than replacing that deployed function with stale repository source.
- Live Stripe QR webhook v52 and Prodigi callback v33 were inspected. They persist payment/fulfilment state with service-role access. The new database trigger observes those writes; it does not call Stripe/Prodigi, alter webhook verification, replay fulfilment, or grant entitlements.
- Live migration history has only the three August 2026 Starter Pack/iOS entries. The repository baseline is incomplete. **Do not run a blind `db push`, reset, or replay historical migrations against production.** The schema-only test fixture is not a production baseline migration.
- Existing broad membership/analytics policies combine with newer policies using OR. This migration adds restrictive policies for initial membership, authorized owner/admin events, server-owned event kinds, and matching location/business IDs. It preserves existing policies rather than assuming a newer permissive policy overrides an older one.
- Existing advisor findings include security-definer views, mutable search paths, broad execution grants on older functions, and disabled leaked-password protection. Those pre-existing findings remain outside this change. New functions have fixed search paths, explicit grants, and private-schema storage; tests exercise access boundaries.

## Attribution policy (version 1)

**Capture:** `assets/js/measurement.js` runs before the SEO code and app navigation. Only `/` and `/index.html`, tracking-only query strings, and existing marketing anchors qualify. Customer location URLs, preview, demo/application parameters, unknown parameters, recovery hashes, team invites, checkout returns, internal pages, and already-authenticated arrivals do not create marketing landings.

The initial sanitized arrival is held in memory. Campaign persistence and delivery require affirmative consent. There was no existing marketing-consent implementation on verified main. The new control respects its saved decision, Global Privacy Control, and Do Not Track. Declining/revoking clears local acquisition state and unsent marketing events. It does not erase an already-associated business record. Operational owner events and short-lived customer visit/submission IDs are separate from optional marketing attribution.

Allowed values: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `gclid`, `dclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`. Values are bounded to 200 characters and a conservative character set (no `@`, URL separators, query strings, or HTML). Invalid values are omitted. Landing path is an allowlisted pathname; referrer is an external hostname only. No full referrer/current URL, auth token, customer email, feedback text, address, or arbitrary query parameter enters attribution. UTM values must not contain personal information, even if that text would pass the character filter.

Browser capture time is diagnostic and validated; received times and milestones use the server clock. IDs are random UUIDs. A separate random 256-bit journey capability is stored locally and only its SHA-256 hash is stored in the private journey table. IDs/capabilities never enter QR URLs or the cohort response.

**Expiry:** the browser attribution window is 90 days from first capture, not sliding. A new eligible arrival after expiry starts a new visitor journey. Session IDs expire after 30 minutes without an arrival/signup interaction; a different tagged campaign starts a new session so it can update latest touch. Within that window first touch is immutable; direct returns never overwrite latest non-direct touch. The business snapshot is immutable after successful association, including later logins and campaigns.

**Channel precedence:** paid search (CPC/PPC/paidsearch medium), paid social (explicit medium), display (display/CPM/banner), email, organic search, other paid (Google/Microsoft click IDs without a recognized medium), social (including `fbclid`, which alone is not proof of a paid ad), other tagged traffic, external referral, direct. A click ID alone does not establish search versus display. Recognized search referrer hosts map to organic search. Missing source/medium are derived from click ID/referrer/channel. Direct means an observed, consented arrival without external campaign/referrer evidence. Unknown means no eligible recorded attribution; it does not mean direct. All campaign claims remain client-supplied, not verified advertising-platform attribution.

**Approved server retention (9 October 2026).** The migration schedules `ff-measurement-retention` daily at 03:17 (verify pg_cron's timezone is UTC in staging). It deletes journeys at 90 days from server creation, cascading arrival/session/click records; deletes page-open visit records at 90 days from receipt; clears signup capability hashes and the original Auth metadata capability at 90 days from intent creation; strips all six click-ID keys and visitor IDs from business snapshots at 90 days from acquisition; and deletes rate buckets at two days from bucket start. Business campaign dimensions, signup recovery state, milestones, and feedback remain. Snapshot retention starts at acquisition, so a copied click ID may outlive its originating journey. Daily scheduling adds up to one day before deletion; outages can delay it further. This policy covers these live measurement records, not provider logs or database backups. Cleanup is idempotent, private, and unavailable to browser roles. No production job has been installed.

Anonymous prefunnel reports lose journey detail after cleanup; business cohort dimensions and milestones remain. Monitor this job in `cron.job` and `cron.job_run_details`; investigate failed or missed runs, correct the cause, then rerun `select ff_measurement.cleanup()` as the trusted database operator. Cleanup logs no identifiers. Scheduling fails the migration if the existing pg_cron prerequisite is unavailable; do not silently omit retention.

## Signup association and recovery

1. Signup begins from the existing signup interaction. Only consented anonymous journeys emit `signup_started`.
2. Auth signup includes `ff_setup`: bounded business/location form fields, selected plan, and the original journey capability. No password is copied into metadata. A database trigger snapshots this intent **only when an auth user is inserted**. Later user-metadata edits do not create acquisition intents. Pending team-invite addresses are excluded.
3. After confirmed authentication, `complete_acquisition_signup()` locks by user and creates the Free business, owner membership, initial location, default location, and acquisition snapshot in one transaction. It takes no caller-supplied business/user ID and derives identity using `auth.uid()`.
4. Concurrent retries return the same result. A login with no intent, an existing owned business, or an existing membership creates no new acquisition. Auth confirmation on another device still uses the captured server intent. The selected paid plan proceeds to the existing checkout path after base setup; Stripe remains authoritative for entitlement. Checkout-return queries never become marketing landings.
5. Navigation/network-interrupted arrival delivery can associate only through the immutable signup capability, within the 24-hour retry window. A verified signed-in actor must match that intent. This may make server arrival time later than signup; the report labels reverse ordering rather than inventing earlier times. Once linked, later delivery cannot replace attribution. If retry expires or storage is unavailable across navigation, the business remains honestly unknown.

The journey freezes at auth signup when it already exists. If its first arrival reaches the server only after signup, the first successfully recovered touch is the available evidence; additional undelivered campaign history is not reconstructed. Existing historical businesses are marked `historical_unknown`, without fabricated attribution or retroactive test classification.

## Event and milestone dictionary

Acquisition fields never replace `analytics_events.source`, which still means action origin. Existing events, including legacy `customer_events.learn_more_click`, remain intact.

| Contract | Producer / authoritative record | Meaning / deduplication |
| --- | --- | --- |
| `landing` | `track-acquisition` → private arrivals | Consented marketing landing; one per journey/session/kind, stable event UUID. |
| `signup_started` | Existing signup-screen interaction → private arrivals | Signup intent, not successful business creation; same deduplication. |
| Signup completed | Business insert trigger + atomic setup RPC | Successfully persisted business; exactly one acquisition row per business. |
| `qr_ready` | Existing `qr_generated` insert | Sign successfully prepared, not merely opening the QR UI. |
| `download_requested` | Existing `qr_deployed`, source `download`/`support_download` | Browser download requested; completion/physical possession unverified. |
| `print_requested` | Existing `qr_deployed`, source `print` | Print/PDF action requested, even if later cancelled; never placement. |
| `order_paid` | Trusted production QR-order persisted state | Paid Stripe session on a paid order; no payment inferred from redirect. Included Starter Packs do not count as paid orders. |
| `order_fulfilled` | Trusted production order completed + provider ID | Provider reports completion; neither confirmed delivery to a person nor physical placement is proven. Ambiguous/needs-attention states do not qualify. |
| `placement_confirmed` | Existing `onboarding_qr_placed_confirmed` | Owner's explicit existing placement confirmation. |
| `feedback_page_open` | Active location lookup → private page-opens table | Eligible opening of a customer QR URL; **scan proxy**, not proof of physical scanning. Unique per location/30-minute browser session. |
| `eligible_feedback` | Feedback AFTER INSERT trigger | First successfully persisted eligible response under the policy below. Browser success screens cannot create this milestone. |

Per-location milestone primary keys and conflict-safe minimum server timestamps make first milestones durable and idempotent. Business milestones are the earliest matching location milestone, never a sum of locations. Milestones need not form an ordered sequence. Payment and delivery are distinct; neither is treated as placement.

“Materials signal” is a report union of download requested, print requested, or order fulfilled. It is deliberately labelled a signal rather than “materials obtained”: the existing product has no verified DIY completion or physical-possession interaction. Its component stages remain visible separately.

## Eligible feedback (version 1)

- Explicit `ff_test=1` and demo continue to save nothing. The replacement endpoint also rejects an explicit preview payload.
- Authenticated owners and members of the target business are `staff_test`, using server-verified identity and membership, regardless of client-provided flags.
- The optional “Testing this QR code?” disclosure allows logged-out staff/owners to declare a test. Such responses remain stored, displayed, and eligible for existing operational handling; only acquisition reporting excludes them. Marking a visit as test can correct its page-open classification; subsequent ordinary retries cannot restore eligibility.
- Internal-admin-owned businesses and businesses in subscription/integration test mode are excluded. Reports re-evaluate current business exclusion state, so marking a business internal removes it from conversion denominators.
- Other responses are **`eligible_unverified`**, not verified customers. No claim is made that an anonymous respondent is a real customer. An owner testing anonymously without declaring it remains indistinguishable from a customer.
- Existing anomaly flags (`repeated_device_1h`, `repeated_device_24h`, location spikes and positive spikes) remain intact. Flagged responses stay eligible unless separately identified as tests; the report exposes their count.
- Historical responses and new legacy/direct database submissions without trusted endpoint classification are `legacy_unclassified` for measurement. They remain visible operationally and never silently become “first real feedback.” Public callers cannot forge trusted eligibility through the new feedback column.
- Stable random submission keys deduplicate a logical in-flight submission. A lost response can be retried safely. After confirmed success, a new deliberate submission gets a new key. The duplicate path does not send another normal alert.

## Delivery, security, and limitations

The local outbox holds at most 100 events for 24 hours and attempts at most 12 deliveries, with exponential delay capped at five minutes. It flushes on startup, online, visibility/pagehide, and a ten-second timer. `fetch(keepalive)` is best effort; queued persistence is the navigation fallback. Owner events are associated with the originating user and cannot be delivered under another account. The server still checks business/location authorization. Duplicate owner inserts are acknowledged through the existing unique idempotency-key index. Marketing events are dropped on consent withdrawal. Browser storage failure falls back to in-memory delivery; cross-navigation continuity then cannot be guaranteed.

Tracking ingress has method/origin/body/UUID/value validation and a transactional per-minute rate counter. It allows 60 tracking requests and 30 feedback submissions per gateway IP bucket per minute. IPs are hashed with a secret and daily salt; raw IPs are not stored. Shared-network traffic may encounter this limit; distributed bots are not eliminated. The gateway must supply a trustworthy `x-forwarded-for`; validate this in staging. Origin checks are not authentication. Anonymous callers cannot execute private ingress RPCs or read attribution/cohorts.

No service/provider keys enter frontend code. New tables live in unexposed `ff_measurement`, have RLS enabled, and deny public/client access. Service-only RPCs explicitly revoke public/anonymous/authenticated execute. The setup RPC requires confirmed identity; the report RPC requires membership in `internal_admins`. The existing UI additionally requires superuser access. Reports exclude click IDs, journey capabilities, raw contact data, and rate-limit hashes.

This work does not fix unrelated pre-existing database access weaknesses, authenticate physical scans, identify anonymous people across devices, or recover historical consent/campaign/test status. Separate browsers are deliberately separate visitors. Customer visit IDs do not inherit owner acquisition UTMs.

## Cohort report

Open **Support → Metrics Dashboard → Acquisition cohorts and activation** and choose a UTC date interval up to 367 days. Grouping uses first server-observed arrival date (or signup date if unknown), source, medium, campaign, and landing path. Latest non-direct source is visible in business detail.

- Primary conversion denominator: distinct non-internal businesses in the acquisition cohort. Each milestone is counted independently over that denominator.
- Location detail uses a separate location denominator and is never mixed with business totals.
- Pre-signup landings/starts/completions use anonymous journeys as a separate unit. They are consent-limited and cannot be added to business counts.
- Transition conversion: businesses with both stages / businesses with the starting stage. Median elapsed hours use chronological pairs only; reverse-order outcomes are counted separately. Missing stages are not imputed, and younger cohorts have less observation time.
- Unknown attribution, excluded businesses/tests, unclassified feedback, flagged eligible responses, and the deployment coverage boundary are explicit. Existing operational reports retain their original definitions.

## Validation and reproduction

Last local run on 9 October 2026: **13/13 tests passed**, all changed inline/external JavaScript and Edge TypeScript syntax checks passed, and `git diff --check` passed. The cohort panel was visually inspected at desktop and 390-pixel mobile widths; its wide tables scroll inside the panel.

Use Node 24+ and the pinned `pnpm-lock.yaml`: install dependencies with scripts disabled, then run `node --test tests/*.test.mjs` and `node tests/check-syntax.mjs`. Browser tests use installed Edge/Chrome when available, otherwise Playwright Chromium. Tests intercept all external browser requests and use no production keys for writes.

- `tests/fixtures/production-schema.sql`: schema-only read-only capture, no user rows. The runner creates primary/unique constraints before foreign keys to handle the live circular references. It intentionally models the legacy permissive policies before applying the new restrictions.
- PGlite executes the actual migration and checks atomic/confirmed/retried signup, first/latest/direct attribution, team invites, metadata tampering, delayed arrival recovery, owner/cross-account permissions, anonymous restrictions, page-open reclassification/deduplication, feedback deduplication, flagged eligibility, paid/fulfilled/sandbox/ambiguous order states, skipped stages, report authorization, and rate limiting. Cleanup tests cover expiry boundaries, cascades, all six click IDs, preserved business dimensions/feedback/milestones, repeat runs, and denied client execution. PGlite records the scheduling call through a fixture because it cannot run pg_cron; verify actual scheduling and execution in staging.
- HTTP browser tests cover marketing consent, SEO tracking variants, direct/different campaign returns, mobile layout, keyboard consent, signup metadata/email-confirmation handling, owner dashboard, normal feedback, declared tests, preview/demo/inactive routes, retries across navigation, unavailable storage, and internal report controls.
- Unit/Edge-handler tests cover sanitization/channel rules, cohort units/denominators/reverse ordering, trusted staff classification, preview rejection, preserved response storage, and no duplicate alerts on replay.
- Syntax checks cover every inline script in both changed HTML files, the new external JavaScript, and changed Edge TypeScript. Inspect `git diff --check` before committing.

Limitations of this validation: PGlite is a local single-connection PostgreSQL engine; scheduled competing requests test idempotency but do not reproduce independent database-session contention. Browser Auth/provider APIs are fixtures. Real email confirmation, real Supabase gateway/JWT behavior, remote Edge imports, PostgREST grants/schema cache, and Stripe/Prodigi sandbox callbacks still require staging verification. No real or sandbox orders were placed during this task.

## Deployment order — future approved rollout only

1. Retention code is approved for this PR, not production deployment. Review consent copy and privacy disclosure against the precise retention clocks above. Verify pg_cron is enabled, its timezone is UTC, and no unrelated job uses the new job name.
2. Reconcile live schema/migration history against the captured baseline in an isolated staging project. Do not mistake the schema-only fixture or incomplete historical repository migrations for a restorable production environment. Re-run the read-only policy/grant/trigger/function checks if production has changed since 9 October.
3. On staging first, apply **only** `20261009140004_acquisition_activation_measurement.sql` using a migration runner that records that exact version. Review the planned migration set before applying; do not force or repair history blindly. The migration is transactional and creates historical unknown-acquisition rows without rewriting feedback.
4. Configure a high-entropy `MEASUREMENT_HASH_SECRET` in the Edge secret store. Configure `MEASUREMENT_ALLOWED_ORIGINS` for the exact staging origin. Production defaults are `https://flashfeedback.co.uk,https://www.flashfeedback.co.uk`; do not leave localhost/staging origins in production configuration. Keep `ff_measurement` out of the exposed-schema list.
5. Deploy only `track-acquisition` and `submit-feedback` plus their `_shared/measurement.ts` dependency, using the function-specific configuration in `supabase/config.toml`. Both have `verify_jwt=false`: public requests are intentional and supplied bearer tokens are independently validated. Do not bulk-deploy stale repository functions. Verify secrets and rate-limit RPC execution before publishing the new feedback endpoint; missing configuration returns 503.
6. Deploy the two external scripts and HTML together, after database/functions are ready. Keep the existing PWA service worker: these JS paths are network-fetched rather than cached by its static-asset allowlist. Confirm frontend/Edge version compatibility before rolling out.
7. On staging, run a tagged arrival → confirmed signup → QR ready → download/print cancellation → placement → separate-browser open → eligible feedback. Repeat with a paid-plan checkout return and mocked/sandbox provider states, team invite, staff test, expired/blocked storage, delayed/duplicate requests and two independent database sessions. Check cohort timestamps and unknown coverage. Verify no UTMs/click IDs appear in generated customer QR URLs.
8. Run staging security/performance advisors and inspect query plans with realistic cohort sizes. Perform a reviewed production migration/function/frontend rollout only after the separate approval. Observe rate-limit/503 failures and support cohort coverage without seeding production analytics with tests.

## Rollback and recovery

- First revert the frontend HTML/external-script references to the prior release. This stops new browser capture and restores legacy client signup behavior; it does not change billing or orders.
- If necessary restore `submit-feedback` using the exact v3 reference in `tests/fixtures/submit-feedback.production-v3.ts` in an isolated deployment directory. Confirm no unrelated function source is included. Keep the new schema/columns: the old function remains compatible and its submissions are conservatively unclassified.
- Disable/unpublish the new tracking endpoint if needed. Preserve measurement tables and records for diagnosis; do not drop them or rewrite historical feedback. To suspend cleanup during an approved diagnostic recovery, run `select cron.unschedule('ff-measurement-retention')` as the database operator. Document and time-limit this pause in erasure; restore with the migration's schedule. Reverting code cannot recover deleted identifiers.
- New restrictive policies intentionally close invalid client write paths. Do not remove them automatically during rollback. Valid legacy owner/admin events and the original signup membership insertion remain supported.
- A failed atomic signup transaction leaves a resumable auth intent, not a half-created business. Confirmed users can retry login. Existing-user logins cannot replace original attribution. Missing or expired anonymous evidence remains unknown rather than blocking service.
- Review retention/recovery actions separately before running any deletion. Rollback does not entail replaying payments, orders, fulfilment requests, or alerts.
