# Internal campaign reporting: first saved feedback

This scorecard is separate from the Google Ads conversion worker and the existing
acquisition reports. No new feedback event or external conversion is sent.
Collection ships off and must stay off until the controller approves the design
and the notice is live. Nothing backfills source labels.

## How to read it

- Source means a completed email signup through an enabled, verified dedicated
  route, not proof of a paid click. Shared links can contribute. Other signups,
  including Google sign-in, cross-visit arrivals and objections, are Unknown.
  No campaign label is put into Google OAuth state or saved in browser storage.
- Count one conversion per completed business when any saved feedback falls in
  its first 14 days. An owner's submission on the live QR counts. No-write
  previews do not. The existing internal-business classifier excludes staff-owned
  businesses and flagged integration/subscription tests. Review known unflagged
  tests before closing a cohort; do not use this metric as evidence of a
  customer-originated submission, physical placement, or repeat use.
- Use UTC signup months; count conversions against the signup month. Open
  cohorts can gain conversions; only compare settled cohorts. Manually enter GBP
  spend and clicks for the same campaign and period. Do not mix Google Ads account
  time zones or currencies without reconciling the period and conversion. Cost
  per conversion is a directional cohort ratio, not click-level attribution.

## Launch checklist for every campaign

1. In Support → Ad campaigns and first feedback, save a new label with its actual
   Google Ads campaign ID. Copy its canonical signup URL. Do not recycle labels.
2. Open the actual final URL from the Google Ads ad (without placing a test ad
   click or a live signup). Confirm signup and the internal attribution notice
   open. Check each ad URL if they differ. Paste that exact final URL and campaign
   ID into **Verify tracking**. The console checks the same-origin route response,
   validates the mapping and saves the verification time. It does not read Google Ads.
3. Before enabling spend, require **Tracking verified** and **Campaign capture is on**.
   When changing an ad URL, mark it unverified first, then repeat the check.
   A changed verified campaign ID requires a new label, so old totals cannot be
   moved to a different campaign. Google Ads status and spend are never modified.
4. After real traffic arrives, check coverage and Unknown counts. Wait for the
   first genuine event; a route check alone cannot prove paid attribution.

## Lawful basis assessment for controller review

- **Purpose:** rank paid-acquisition routes by business activation and cost,
  rather than optimising for signups that never submit feedback.
- **Necessity:** aggregate clicks and all-channel feedback do not connect a route
  to first feedback. A shared route label linked temporarily to one signup provides
  the necessary join without a unique ad click ID, browser token, fingerprint or
  cross-visit matching. Self-reporting would be a lower-coverage alternative.
- **Balance:** the label is personal data while linked to a business account.
  Keep private, restrict reports to superusers, disclose before signup with an
  objection option, and offer removal in account settings. Do not reuse for
  individual targeting, provider upload or eligibility decisions. Never export
  account-level records. Confirm the exact browser storage/access and request
  trace for the release, including redirects, referrers and infrastructure logs.
  The assessment does not cover a future Google sign-in attribution handoff.
- **Retention:** the email signup metadata is stripped by the signup transaction
  after the label is copied into the private link table. Uncompleted links expire
  after seven days on daily cleanup. Whole UTC cohort months close 21 days after
  month end: 14 days for the observation window and seven for reconciliation.
  Links are deleted in the same transaction as closure. An objection before
  closure removes its campaign link; anonymous totals cannot later be edited to
  remove a person. Existing account and feedback retention are unchanged.
  Historical totals omit counts below five and omit conversion counts when either
  outcome has fewer than five. This is a floor, not proof of anonymity: assess
  linkability with retained business records, exports, prior totals and ad reports
  before authorising permanent retention. If necessary use broader aggregation or
  do not retain the affected breakdown. No overlapping rollups are written.

Reference: [ICO device-access guidance](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/),
[legitimate interests](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/legitimate-interests),
and [anonymisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/how-do-we-ensure-anonymisation-is-effective/).

## Release and disable

After approval, reconcile live main/Supabase, apply the migration and publish the
frontend/notice. Test in staging with the Google checkbox off, use the existing
auth/signup contract, and verify owner live feedback, preview exclusion, and
objections. Register verified URLs before use. Schedule the retention function
only with approval; verify the named job and alert/escalate if it fails.

```sql
-- Only after controller and schedule approval (UTC daily).
select cron.schedule('ff-internal-campaign-retention','29 3 * * *',
  'select ff_measurement.close_internal_campaign_months()');
select ff_measurement.close_internal_campaign_months();
update ff_measurement.internal_campaign_settings
set enabled_at=coalesce(enabled_at,clock_timestamp()), capture_enabled=true
where singleton;
```

Capture fails closed if cleanup has not run in 36 hours. This does not clean
existing links during an outage: recover the retention job and reconcile the
backlog. Disable with `capture_enabled=false`, keep retention running, and do
not reset `enabled_at` or change the Google Ads worker. Roll back UI separately.
