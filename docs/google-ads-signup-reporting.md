# Google Ads completed-signup reporting

## Qualification and release boundary

Only a confirmed, completed new-business signup qualifies. The immutable signup
intent must record campaign consent under `google_signup_v1`, have no withdrawal,
and have been created/completed after the private settings rollout timestamp.
The business must still have its owner membership and default location, a measured
`signup_visit_v2` snapshot with a bounded GCLID, and no authoritative internal/test
classification. No historic intents are upgraded. Later Auth metadata edits do
not upgrade consent. The checkbox/helper/Details link presentation is unchanged.

`index.html` supplies the disclosure version only alongside the existing accepted
journey token. The database freezes it when the intent is inserted. This records
the declaration under the served disclosure; it is not cryptographic proof of
what a browser displayed. Client submissions are still subject to the existing
signup-visit consent model. Terms acceptance is not measurement consent.

## State and idempotency

`ff_measurement.google_ads_signup_conversions` has one row per business for signup,
a stable opaque transaction UUID, the original intent completion timestamp and
the immutable Google destination used on enrolment. GCLID is read from the
existing acquisition snapshot at dispatch, never copied to the integration table.
Its existing 90-day cleanup and withdrawal therefore remain authoritative.

The worker reconciles completed intents every five minutes, including attribution
delivered after signup. A per-user advisory lock and intent lock coordinate with
signup/withdrawal; a three-minute lease prevents concurrent workers claiming the
same event. Expired leases retain transaction ID and timestamp. A stale result
cannot finish a newer lease. Changed account/action configuration puts the old
event into needs_attention rather than sending it to another conversion action.

Google `transactionId` and the fixed event time provide provider deduplication
when acceptance was ambiguous or database persistence failed after acceptance.
Google acceptance is `accepted`/`uploaded_at`; final successful diagnostics are
`uploaded`/`processed_at`. The two are not interchangeable or proof that a campaign
report already displays the conversion. Each Google request contains one event.

## Consent, withdrawal and scope

Only eligible rows send `adUserData=CONSENT_GRANTED`; advertising personalisation
is explicitly denied. The payload includes only GCLID, completion time, opaque
transaction ID, WEB source, consent and the destination IDs. No Enhanced
Conversions, email, name, phone, IP, address, feedback, audiences or browser tag.
The worker refreshes Google credentials before claiming a job, then rechecks
eligibility immediately before dispatch. Withdrawal cancels unsent/leased/accepted
work. An HTTP request already dispatched may still be accepted after withdrawal;
its safe acceptance reference is recorded without re-enqueueing it. Local
withdrawal does not retract a report already received by Google. Account deletion
cascades integration state; other campaign dimensions/retention are unchanged.

## Retry and recovery

Transient HTTP 408/425/429/5xx and ambiguous network outcomes retry with the same
identity, exponential delay from two minutes to six hours plus jitter, at most
12 upload attempts and seven days from completion. Permanent validation failures
stop. Authorisation/permission failures require attention; a permanent OAuth
refresh error disables the integration. Missing configuration does not claim work.
There is no Google call in the signup transaction.

Accepted requests are not uploaded again. Diagnostics start after 30 minutes,
repeat hourly, and stop after 24 checks/24 hours with needs_attention if unresolved.
Provider failures are retained for manual inspection rather than blindly replayed.
Duplicate-transaction/GCLID diagnostics are treated as already uploaded. Safe
categories, request IDs and warning counts are stored, not raw provider payloads.

Inspect state as the database administrator:

```sql
select status,count(*) from ff_measurement.google_ads_signup_conversions group by status;
select business_id,status,attempt_count,diagnostic_count,last_attempt_at,
       uploaded_at,processed_at,last_error_category,warning_count
from ff_measurement.google_ads_signup_conversions order by created_at desc;
select enabled,rollout_at,last_error_category,last_error_at
from ff_measurement.google_ads_settings;
```

Do not manually clear request IDs or change destinations to retry accepted work.
Fix configuration errors, review the existing row and Google diagnostics, and use
the same conversion identity if an authorised recovery is necessary. There is no
customer-accessible mutation or new support dashboard.

## Security and deployment

The new tables are in the private measurement schema with RLS and no browser
grants. Worker RPCs are service-role-only; private scheduler helpers have no
PUBLIC/browser/service-role EXECUTE. The Edge Function uses custom HMAC-SHA256
authentication plus an expiring, single-use ticket created in the private schema.
Gateway JWT checking is disabled for this endpoint because the reusable service
JWT must not be staged in pg_net. The worker verifies the signature with its
built-in backend key and consumes the ticket through a service-only RPC; the stored
ticket determines the permitted mode, regardless of caller body. Replays and
expired tickets are denied. No CORS access is provided.

The scheduler obtains the existing project URL and service key from Vault but
stages only a signature and nonce, never the key. The first migration attempts to
revoke browser SELECT on `net.http_request_queue`; on the hosted instance this
platform-owned ACL could not be changed by the project role. The second migration
replaces bearer-based scheduling with the signed-ticket design. Normal browser
access to private ticket tables and RPCs remains denied. A party able to read a
pending pg_net request can at most race that same one-use invocation; it cannot
mint invocations, change their mode, extract secrets or supply arbitrary events.

Required Edge secrets:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_ADS_OPERATING_ACCOUNT_ID`
- `GOOGLE_ADS_SIGNUP_CONVERSION_ACTION_ID`
- optional `GOOGLE_ADS_LOGIN_ACCOUNT_ID`, only for a manager-account access path

Use Data Manager API `POST /v1/events:ingest` and
`GET /v1/requestStatus:retrieve`, OAuth scope `auth/datamanager`.
The older Google Ads UploadClickConversions API is restricted for new adopters.

Release:

1. Reconcile GitHub main/live Supabase again. Apply only the two new migrations; never
   replay the earlier measurement migrations or blindly push the partial baseline.
2. Deploy only `upload-google-ads-conversions` and `_shared/google-ads.ts`, with
   verify_jwt=false with its HMAC/ticket authentication. Keep reporting disabled while validating configuration.
3. Call `select ff_measurement.invoke_google_ads_signup('health');` and then
   `...('validate');`. Read only that request's `net._http_response`; do not print
   queued request headers. Validation uses a synthetic ID and validateOnly=true,
   recording no conversion. Verify anonymous/authenticated denial and grants.
4. Publish the frontend version field and consistent privacy text together.
5. Set a fresh rollout boundary and enable only after the reviewed checks:
   `update ff_measurement.google_ads_settings set enabled=true,rollout_at=clock_timestamp(),last_error_category=null,last_error_at=null;`
6. Check cron and queue health. Do not manufacture a real Google conversion to
   make the UI active. Review the first genuine eligible signup's diagnostics.
   Unpause only `ff-google-ads-signup` with `cron.alter_job` when enabling it;
   the prepared deployment deliberately leaves that job paused.

Rollback/disable immediately:
`update ff_measurement.google_ads_settings set enabled=false;`
Optionally pause only the `ff-google-ads-signup` cron job. Retain state, disclosure
evidence, cancellation and deduplication records; do not replay signups. Reverting
the frontend version field stops new eligibility but does not itself stop already
pending work. Keep privacy disclosures accurate for reports already sent. Existing
acquisition, consent withdrawal, retention, QR, feedback and billing stay enabled.

## Validation and limitations

Release state on 15 October 2026: migrations
`20261015112707_google_ads_signup_reporting.sql` and
`20261015134030_google_ads_signed_worker_invocations.sql` are deployed. Worker v2
uses signed tickets and is deployed. Live signed-ticket health request 2165
returned HTTP 200 with configured=true; validation request 2166 returned HTTP 200
with validation=validated and conversions_recorded=false. Browser RPC grants are
denied. All 35 automated tests and JavaScript/TypeScript syntax checks passed.
The integration settings remain disabled, the signup cron is paused and the
conversion queue is empty. No real conversions have been uploaded. The reviewed
frontend/disclosure changes still require publication and a fresh rollout boundary
before activation. Do not reapply the deployed migrations or unpause unrelated jobs.

Automated tests apply the actual migrations in PGlite and exercise eligible
signup/replay, missing click/consent, old consent, internal/test, incomplete signup,
late attribution, temporary/permanent errors, successful retry, stable identity,
lease recovery/stale acknowledgements, withdrawal and denied browser access.
Mocked provider calls inspect payload fields and never contact Google. Existing
HTTP browser journeys test unchecked/checked consent and disclosure metadata.
PGlite is single-connection; it does not prove independent-session contention.
The live gateway/grants/scheduler and validateOnly check are separate release
checks. No controlled live conversion is authorised or required for this release.

## Before launching restaurants_search_test_01

- [ ] Correct customer and UPLOAD_CLICKS action, category Sign-up.
- [ ] Secondary/observe only; no campaign custom-goal inclusion; Maximize Clicks.
- [ ] Count One, no value, 30-day click window, selected attribution model checked.
- [ ] Auto-tagging enabled; restaurant navigation preserves the ad click ID.
- [ ] Operator Google app published, credentials valid, Data Manager API enabled.
- [ ] Backend secrets and live validation succeed without a recorded conversion.
- [ ] Migration, service-only worker, scheduler, disclosure version and privacy text deployed.
- [ ] Fresh rollout boundary enabled, no historic signup queue, cron/retention active.
- [ ] Founder knows how to disable reporting and inspect needs_attention/errors.

Sources: https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events
and https://developers.google.com/data-manager/api/devguides/diagnostics .
