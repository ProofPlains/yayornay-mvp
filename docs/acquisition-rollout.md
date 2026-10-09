# Acquisition rollout — 9 October 2026

## Authorization and current status

The owner authorized production deployment instead of staging, with cleanup disabled until verification. No customer rollout or real payment/fulfilment transaction is part of the tests. At preparation time, main is `e02e3ecddc78ce0020458eb17ecc6e5135b99a47`, Supabase is `evediwsocfbalzbzdden`, and submit-feedback is v3. GitHub Pages deploys main automatically. The original dirty checkout remains untouched.

Backend deployed at approximately 15:14–15:15 UTC: migration `20261009151423_acquisition_activation_measurement`, track-acquisition v1, submit-feedback v5. Supabase assigned the migration version; the checked-in filename was aligned to it to avoid a duplicate future application. The hashing secret was configured in the dashboard. Cleanup is registered and **inactive**. Existing scheduled jobs are unchanged. Browser roles cannot use the private schema, and all three restrictive policies are present.

Live gateway smoke checks passed: allowed-origin invalid tracking payload → 400 (configuration/rate RPC reached), disallowed origin → 403, preview tracking → 400; feedback invalid rating → 400, explicit preview → 400, nonexistent location → 404. These checks saved no feedback. Frontend release and full signup/confirmation verification are pending.

A live database transaction verified confirmed-account setup, repeat-call idempotency, initial owner membership, and staff page-open exclusion. Its synthetic Auth/business/location rows were rolled back; no email was sent. This does not verify the real confirmation-email journey. Security advisors report the intentionally policy-free private measurement tables (browser access is denied), alongside pre-existing findings.

Frontend merge was initially blocked by automatic approval review. The owner chose to wait for the email/signup test and supplied a fresh test inbox. The real signup endpoint immediately confirmed the account and issued a session: this project's current configuration does not require an email-confirmation link. Password login then passed. Two concurrent real PostgREST setup calls returned one business/location (created flags true/false); attribution retained the test source/campaign. This verifies current immediate-confirmation behavior, not an email-delivery flow with confirmation enabled.

The designated test business `184e6484-5c0e-4f87-80f4-db19ea4157b5` was marked integration-test mode and alerts disabled before feedback testing. One explicit test feedback submission returned 201; the same submission key returned 200 with the identical feedback ID and replay=true. Anonymous cohort-report access returned 401. This resolves the requested signup test gate; frontend release is next and cleanup remains inactive.

## Recovery material

The isolated worktree's ignored `test-results` directory contains `frontend-e02e3ec.zip`, `submit-feedback-v3.json`, and `database-definitions.json`, captured before deployment. The database capture contains function/trigger/policy definitions and feedback-column metadata, **not a full data backup**. The exact former feedback source is also tracked at `tests/fixtures/submit-feedback.production-v3.ts`; the Git main commit above preserves the former frontend.

## Phased deployment

1. Configure `MEASUREMENT_HASH_SECRET` through the Supabase secret store. Keep its value out of source, logs, and this document. Production origins are already explicitly defaulted to the apex and www domains.
2. Apply the single reviewed acquisition migration. It registers `ff-measurement-retention` then sets `active=false` in the same transaction. Verify that inactive state, private-schema grants, restrictive policies, and existing jobs.
3. Deploy track-acquisition and submit-feedback from the reviewed branch with their shared dependency. Check real gateway authentication, rate-limit RPC configuration, and non-writing rejection cases before frontend deployment.
4. Merge the reviewed PR, verify GitHub Pages build success and the actual public asset contents.
5. Verify signup/recovery, QR preparation, preview isolation, feedback persistence/replay, staff/test exclusions, owner access and support reporting using designated test records. Record exactly which checks ran; do not treat fixture results as live email or provider validation.
6. Only after checks pass, enable the job with `select cron.alter_job(jobid, active := true) from cron.job where jobname='ff-measurement-retention';`. Verify the job state and inspect its execution history. No existing job is modified.

## Operational rollback

- Stop cleanup first: `select cron.alter_job(jobid, active := false) from cron.job where jobname='ff-measurement-retention';`.
- Restore frontend files from the recorded main commit through a new reviewed Git commit; wait for Pages and verify live content. Do not reset or clean the user's original checkout.
- If feedback fails, redeploy the exact captured v3 source with its original `verify_jwt=false` configuration. It remains compatible with the additive columns.
- Disable the new tracking endpoint if it is producing failures or invalid data. Keep the additive tables and stored records; no automated schema down migration is provided.
- If the Auth insert trigger itself blocks signup, a database operator can temporarily disable only `ff_capture_signup_intent` on `auth.users`, documenting the resulting attribution gap. Re-enable after repair. Do not disable unrelated Auth triggers.
- Restrictive policies need targeted diagnosis; removing them blindly reopens known write vulnerabilities. Database rollback is not equivalent to frontend rollback.
- Deleted identifiers cannot be recovered by reverting code. Never replay payments, orders, or alerts as a recovery action.
