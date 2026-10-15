# Public privacy policy

The static, unauthenticated policy URL is `https://flashfeedback.co.uk/privacy/`.
Use this URL for the Google Auth Platform application privacy-policy field after
the page is published. It contains no scripts, account lookups or tracking.

The same policy text remains in the existing privacy sheet in `index.html`.
Keep both copies aligned when updating the policy. Only heading levels differ:
the standalone document uses h1/h2, and the existing sheet uses h2/h3.
The homepage footer now has a real `/privacy/` href, while its existing
`data-sheet-open="privacy"` handler still opens the sheet. The signup checkbox,
helper text, Details link markup and click behaviour are unchanged.

## Google measurement release boundary

The 15 October 2026 disclosure explains the GCLID-only signup reports,
the Google recipient and data-use links, withdrawal limits, and the separate
operator OAuth connection. The original public-policy release labelled reporting
planned and inactive. The signup-reporting release updates both copies for the
implemented behavior; publish that wording together with the disclosure version
and activate only after the reporting checklist is complete. See
[google-ads-signup-reporting.md](google-ads-signup-reporting.md) for the exact live
deployment state. Publishing a policy alone never upgrades an older consent choice.

Before enabling reporting, verify durable disclosure-version evidence and
eligibility checks, a rollout boundary excluding historic signups, internal/test
exclusion, withdrawal cancellation of unsent reports, provider-safe idempotency,
and bounded retries. Recheck whether the approved consent presentation satisfies
the applicable Google and privacy requirements; publishing a policy alone does
not establish consent. Update the status wording only when actual behaviour
changes. Do not replace the existing consent mechanism or broaden consent from
the new URL alone.

The OAuth disclosure describes intended reporting-only use of the operator's
Google access and protected backend token storage. No credential belongs in this
repository, public page, screenshot, or test fixture.

## Release and rollback

Deploy through the normal GitHub main frontend release. The original public-policy
patch required no backend changes; the later signup-reporting implementation has
separate Supabase migrations and an Edge Function documented in its release guide.
Verify `/privacy/` returns 200 without authentication, and the homepage/footer
and signup Details actions show the same policy. Then enter the URL in Google
Auth Platform Branding; the Google console separately determines whether other
branding or domain verification is required.

Rollback is a revert of this frontend patch. Remove the URL from Google Branding
first if it would become unavailable. No stored consent or account data needs
restoring, and no previous consent is recreated by rollback.
