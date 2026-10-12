# Signup campaign consent

## Status and verified baseline

This follow-up is implemented on `codex/signup-campaign-consent`, based on verified live main `8dca62581fd2900dd9e452f060967d3c00973495`. Read-only reconciliation on 11 October 2026 confirmed the original measurement migration and deployed tracker. The original retention job is active. The original dirty checkout remains untouched. **Production release approved on 11 October 2026.** Backend migration 20261011170128 and track-acquisition v2 are deployed; frontend release follows by merging PR #20. Supabase assigned the migration version, and this filename is aligned to prevent duplicate application. Original implementation/rollout history remains in acquisition-measurement.md and acquisition-rollout.md; their prospective status is historical.

## Signup-visit policy (version 2)

There is no landing-page consent banner, saved campaign consent, or returning-visitor campaign history. Signup has a separate optional checkbox, initially unchecked whenever the form opens. Terms acceptance is not campaign consent. Leaving the checkbox unchecked does not affect signup. Global Privacy Control/Do Not Track disable it.

No campaign parsing, acquisition identifiers, campaign storage or requests occur before the consenting signup submission. The initial page URL/referrer remain only in page memory through SEO cleanup. Only that document's eligible marketing entry supplies attribution: / or /index.html, tracking-only queries and existing marketing anchors. Customer QR, preview, unknown/application parameters, recovery hashes, invites, checkout returns, internal pages and authenticated arrivals do not qualify.

Allowed bounded campaign values remain the six UTM fields and gclid/dclid/gbraid/wbraid/fbclid/msclkid. No full URLs, emails, feedback, addresses or arbitrary parameters enter attribution. UTMs must not contain personal information even if the character filter accepts them. Sanitization and channel precedence remain unchanged.

Opening signup or checking the box alone emits nothing. The validated flow calls signupToken(true) immediately before Auth signup, creating fresh random IDs and a capability. The server stores its hash. Touch metadata includes attribution_policy=signup_visit_v2 and a validated diagnostic consented_at. Server receipt times remain authoritative. An Auth failure can leave a consented attempted signup without completion.

Both existing landing and signup_started records are emitted at consented submission, **not at initial page load or signup-screen opening**. They cannot measure all landing traffic or page dwell time. First/latest non-direct touch refer to the same current signup visit. Later campaigns do not update the business snapshot.

Campaign retries use sessionStorage.ff_signup_measurement_queue for at most 24 hours/12 attempts, solely to deliver the original consented signup. Once Auth returns a user, pending items bind to that user. Only bound items survive navigation and only deliver under the same authenticated account; anonymous unbound retries are discarded on reload. Retry state never attributes another visit/signup. Reload/return starts with no consent or previous campaign history. Storage failure falls back to memory. Startup retires old consent/history keys and legacy acquisition retries while preserving operational owner/customer queues.

## Withdrawal

Account Settings → Campaign measurement → Turn off campaign measurement clears unsent marketing events. Signed-in users also call withdraw_campaign_measurement(), which derives identity from auth.uid(), removes their campaign snapshots, claimed journeys/arrivals and intent/Auth capability, and records withdrawal time. It preserves accounts, completed signup recovery, feedback and activation milestones. Other owners' records remain untouched. Sign in first to remove already-linked account information.

Withdrawal is idempotent, denies anonymous execution and has no caller-supplied user/business ID. The intent lock shared with delayed authenticated delivery prevents reassociation after withdrawal. A backend failure is displayed with a retry action; local cancellation alone is not reported as successful account withdrawal. An already in-flight anonymous request can leave an orphan journey, but the cleared immutable intent prevents linking it back; original retention removes orphan journeys.

## Reporting and retention

The former browser_journey_v1 policy used a banner, locally saved consent and a fixed 90-day browser journey with return/session attribution. Historical records are preserved. The report RPC adds attribution_policy and separates v1/v2/unknown cohorts without renaming existing fields/events. The feedback policy_version remains 1. These scopes are not comparable as all-visitor conversion denominators; the UI labels journeys and explains the boundary. Withdrawal moves businesses to unknown attribution/signup-date cohorts, which can change historical campaign totals.

Original server retention is unchanged: daily cleanup removes journeys/arrivals after 90 days from server creation, signup capability/Auth token after 90 days from intent creation, snapshot click IDs/visitor IDs after 90 days from acquisition, page-opens after 90 days and rate buckets after two days. Business campaign dimensions remain until account withdrawal/deletion. Daily scheduling/outages can delay deletion; this policy does not describe provider logs/backups. Ordinary operational measurement remains separate from optional campaign association.

## Validation

11 October 2026: **17/17 local tests pass**, all inline/external JavaScript and changed Edge TypeScript parse, and git diff --check passes. HTTP browser tests intercept all external requests; no production writes occur. Mobile signup layout and keyboard checkbox/withdrawal controls were checked. Tests cover unchecked/checked signup metadata, no landing banner/requests, retired browser history, no return attribution reuse, account-bound retry and cross-account rejection, privacy signals, withdrawal success/error, unavailable storage, dashboard/support, customer feedback, declared tests, preview/demo/inactive routes.

PGlite applies both actual migrations and verifies private grants, anonymous denial, atomic signup/recovery, self-service owner scope, repeat withdrawal, metadata tampering/late delivery rejection, preserved feedback/milestones/other snapshots, and separate legacy/new report groups. Existing billing/provider-state and eligibility tests remain passing. Local single-connection PGlite does not prove independent-session contention. Real Supabase gateway/Auth/PostgREST behavior remains a staging/live release check.

Reproduce with node --test tests/*.test.mjs and node tests/check-syntax.mjs, then git diff --check. Browser tests use installed Edge/Chrome and do not contact production. No payments/orders are needed for this change.

## Approved deployment sequence

1. Reconcile GitHub main, live function definitions/grants and migration history again. The original 20261009151423 migration is already deployed. Do not replay it or run blind db push against the incomplete repository baseline.
2. Apply **only 20261011170128_signup_campaign_consent.sql** using a runner recording that exact version. It adds withdrawal audit state/RPC and replaces arrival/report functions while retaining existing grants. It performs no automatic historical deletion and changes no billing, feedback, retention or cron behavior.
3. Deploy **only track-acquisition** with the updated _shared/measurement.ts, keeping existing secrets/origins and verify_jwt=false configuration. This accepts the new consent/scope metadata. No submit-feedback or unrelated function redeployment is needed.
4. Verify authenticated withdrawal/grants, denied anonymous access and internal-admin report authorization, then publish HTML and both external scripts together. The existing PWA worker network-fetches these scripts.
5. Check a tagged landing causes no campaign request/storage/banner; declined signup remains unknown; checked signup records only that document and correct scope; return does not reuse it; withdrawal removes only that account's campaign link. Use controlled internal accounts and avoid accidental production analytics. Check offline/expired retries and independent-session contention.
6. Verify migration history, deployed Edge source and frontend release separately, and confirm original retention remains active.

## Rollback

Revert only this frontend/script follow-up if required. That restores the old banner/browser policy and must be a deliberate privacy decision; retired local history cannot be recovered. Prefer retaining the compatible tracker sanitizer, because older code drops new scope metadata. Leave the withdrawal RPC, revoked intent state and arrival locking in place to honor withdrawal and prevent reassociation. Do not restore withdrawn data, drop measurement tables, replay analytics or disable retention during ordinary rollback. This change does not replace feedback, billing or fulfilment endpoints.

## Live backend verification (11 October 2026)

Migration history, arrival intent locking, report scope and tracker v2 source were verified. Anonymous withdrawal is denied; authenticated withdrawal is granted; arrival ingress remains service-only. A live transaction called withdrawal twice as the designated internal test user and proved revoked intent, cleared campaign snapshot, unchanged other owners’ snapshots and unchanged feedback/business/milestone counts, then rolled back all changes. Original retention remains active. The security advisor continues to report deliberately policy-free private measurement tables and existing baseline findings. Original source is saved locally in ignored test-results/track-acquisition-before-consent.json, with main 8dca625 preserving the prior frontend.

## Account Settings follow-up (12 October 2026)

The public measurement modal and its footer/privacy links are removed. Signup Details still opens the privacy policy, which explains how to withdraw in Account Settings. The account section shows On with one withdrawal action, Off with a persistent withdrawn message, or Off for no recorded signup consent. There is no re-enable control. Failed reads show Unavailable with Try again; failed withdrawals leave the last saved status in place and permit retry. Changes do not require a separate Save step. Demo accounts cannot change consent.

A private signup-intent boolean preserves the original consent choice after identifier expiry. Existing consent evidence (immutable capability, withdrawal record or acquired campaign snapshot) is backfilled; new signup intent creation records whether a valid capability was supplied. campaign_measurement_status() derives identity from auth.uid(), returns only that account’s status, and denies anonymous access. No campaign identifiers or other users’ information are exposed. Withdrawal and retention semantics are unchanged. Apply only the new account_campaign_consent migration before publishing the HTML and measurement script. No Edge Function deployment is required. Previous frontend versions remain compatible with the additive schema; retain the status column/RPC if reverting the UI.

Backend deployed as 20261012102422_account_campaign_consent.sql; the filename is aligned to Supabase’s assigned version. Live checks confirm anonymous status access is denied, authenticated access is granted, the designated test account reports withdrawn, and retention remains active.

## Restaurant route follow-up (12 October 2026)

The restaurant acquisition page uses a narrow root navigation bridge and transports supported campaign parameters in the link URL. The root document keeps the restaurant path and CTA entry dimensions in page memory and records them only at an explicitly consenting signup submission. There is no saved visitor/campaign state, banner, page-view tracker or standalone CTA event. Unsupported/mixed application queries cannot be attributed through the bridge. Existing QR/recovery/invitation/authenticated arrivals keep priority. External search-referrer provenance is lost across navigation; tagged campaigns survive. The shared track-acquisition sanitizer must be deployed before the frontend or the path falls back to `/`. See [restaurant implementation and experiment report](restaurants-experiment.md) for the accepted measurement limits and release sequence. This source change is prepared, not deployed.
