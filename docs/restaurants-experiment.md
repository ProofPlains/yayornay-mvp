# Restaurant acquisition experiment — implementation report

Implemented on `codex/restaurants-acquisition` in the managed restaurants-acquisition worktree, based on live GitHub main `ba42f8244b78248ba362d1f1063cee414fa35b2d` (12 October 2026). Original dirty checkout at `7596ea5` is untouched. GitHub fetch succeeded despite an existing repository maintenance/repack error about an unrelated missing tree; no repository repair was attempted. Current checkout and touched source were readable and verified.

## Page and implementation

- Route/file: `/restaurants/` → `restaurants/index.html`; actual static HTML, not an application view. Local HTTP 200 verified. Production route is not deployed yet.
- H1: **A simple customer feedback system for restaurants** (one visible H1).
- Title: **Restaurant Customer Feedback System | FlashFeedback**.
- Description: **Collect quick, private restaurant customer feedback with QR codes. Catch problems early, see responses in one dashboard and start free with FlashFeedback.**
- Canonical and OG URL: `https://flashfeedback.co.uk/restaurants/`, unchanged by campaign parameters. No noindex. Existing root/application indexing rules remain in place; root bridge URLs are noindex/nofollow.
- Social metadata uses the existing 512×512 bolt, with truthful dimensions and summary card. A proper 1200×630 social image is a non-blocking follow-up.
- WebPage structured data relates to the existing WebSite/Organization. No FAQ rich-result schema, ratings, invented testimonials or offers.
- Sitemap retains homepage and adds the restaurant URL, with no invented lastmod. robots.txt is unchanged and allows the route.
- Homepage's existing Restaurants & cafés audience item becomes a crawlable link. Restaurant header/footer link back to `/`.
- Illustrative customer/recent-feedback components reuse the homepage's product language and five sentiment choices; visible captions identify example data. They are demonstrations, not screenshots or testimonials. Dashboard distribution is described and available in the interactive demo, not fabricated as usage statistics.
- Pricing copy promises the existing Free entry without duplicating prices/limits or Stripe logic. Existing plan selection runs during signup. Existing homepage already claims setup in minutes; this page uses the more conservative 'get your restaurant QR ready'.
- How-it-works, physical placement, private feedback, dashboard, customer ease, public-review relationship, Free entry, FAQ and final CTA are included. No integrations, technical anonymity, review gating or restaurant-specific app features are introduced.

Changed files: admin-support.html, assets/js/acquisition-report.js, restaurants/index.html, restaurants/restaurant.css, assets/js/restaurant-links.js, assets/js/marketing-entry.js, assets/js/measurement.js, index.html, sitemap.xml, supabase/functions/_shared/measurement.ts, tests/browser.test.mjs, tests/measurement.test.mjs, tests/check-syntax.mjs, docs/restaurants-experiment.md, docs/restaurants-experiment-review.sql, docs/signup-campaign-consent.md.

## Navigation and attribution

Static signup links use `/?ff_entry=restaurants&ff_action=signup&ff_cta=hero` (also pricing/final); demo links use action=demo (hero/product). A tiny landing helper transports the supported query verbatim into these same-origin links without recording a click, storing campaign state or creating IDs. Unsupported query keys are not forwarded into auth or customer routes; signup still works but attribution is disabled.

The app loads marketing-entry.js before measurement.js. The bridge accepts only the exact entry/action/position values, single control parameters, supported campaign keys, a root path and no hash. QR, recovery, invitations, checkout/unknown parameters cannot form a bridge. The existing bootstrap retains QR/recovery/invitation/authenticated-session precedence; its final anonymous fallback calls the existing showSignup()/showDemo(). Existing owners arrive at their dashboard and do not become acquisition signups. Signup, Auth, onboarding, Stripe and demo implementations are reused.

Measurement reconstructs the restaurant landing path in current-document memory. At explicit consenting signup submission, existing `landing` and `signup_started` events retain the original campaign query and add bounded `entry_action` and `cta_location` dimensions. These dimensions describe the entry leading to that signup, not independently counted CTA clicks. They remain in stored touch data; existing cohort UI groups by landing path, campaign and policy, not CTA position.

All six UTM keys plus gclid/dclid/gbraid/wbraid/fbclid/msclkid are preserved and use the existing sanitization. Invalid values still drop out. URLs/campaigns must contain no personal information. No analytics script is loaded on the static restaurant page. Consent stays optional/unchecked; DNT/GPC, authenticated-arrival exclusion, retry ownership, withdrawal and retention remain unchanged. No second analytics system or new event name is added.

### Explicitly accepted measurement limits

The founder chose to preserve signup-only consent during this task. Production policy v2 emits landing/signup_started only at consenting form submission. Consequently:

- All landing page views, qualified visits, CTA clicks (including demo clicks), signup-screen openings and nonconsenting signup attribution are **not measured**. Missing data is not zero behavior.
- The requested primary metric, businesses with first genuine feedback per qualified restaurant visitor, is **not computable** with this policy. Do not label consenting signup journeys or Google Ads clicks as qualified visitors.
- Google Ads impressions, clicks, CTR, CPC and spend are platform measures. Clicks are only a separate traffic proxy; bots, repeats, failed loads and returning owners prevent equivalence to qualified visitors. Ads-side counts cannot establish a deduplicated product conversion rate or represent unconsented outcomes.
- Navigation replaces the external referrer with the restaurant page. Untagged organic restaurant arrivals preserve landing path after consent but can be classified direct. There is no hidden referrer storage or inferred search attribution. The tagged Search Ads experiment retains campaign/source/medium/click IDs.
- Feedback page opens remain a scan proxy; eligible feedback is unverified customer activity after known staff/test/internal exclusions, not proof of a physical scan or a genuine diner. Inspect flagged rows and conduct founder follow-up.
- Existing internal/test exclusions remain authoritative. Audit Paul's test/comped classifications before reviewing results; do not assume every comped business is internal or every bot is perfectly filtered. Returning owners do not create new signup cohorts.

Reuse server-owned completed signup association, qr_ready, download_requested, print_requested, order_paid, order_fulfilled, placement_confirmed, feedback_page_open and eligible_feedback. Existing owner events, idempotency, timing and historical scopes are unchanged. Paid orders are payment intent; accepted/fulfilled material paths and page opens are partial evidence; persisted eligible feedback is stronger.

For an early review, use the support acquisition report grouped by `/restaurants/`, campaign restaurants_search_test_01 and signup_visit_v2. The dashboard now provides Campaign and Landing page filters plus a combined first-feedback activation summary for completed consenting businesses. Filters apply to all report tables; the summary always counts distinct businesses, independent of the detail unit. Select restaurants_search_test_01 and /restaurants/ to view the experiment. Zero qualifying signups shows an explicit empty state, not a 0% rate. The read-only docs/restaurants-experiment-review.sql calls the authenticated internal-admin RPC and provides per-business milestone times, time-to-open/feedback, 14-day observation maturity and feedback within 14 days. Keep all later outcomes. Review conversion against distinct completed consenting signups, with mature 14-day cohorts and unknown attribution reported separately. Small samples cannot establish scalable CAC/LTV.

## Production reconciliation and release

Read-only live Supabase inspection confirmed track-acquisition v2 source matches checked-in baseline, allowlisted arrival kinds, private measurement tables with RLS and no browser grants/policies, service-only arrival ingress, internal-admin cohort authorization, current signup/report RPC definitions, measurement triggers/stages and active daily 03:17 retention. No customer data was read and no production analytics/accounts/feedback were created. No schema, policies, grants, triggers, storage, cron, billing/provider or retention changes are required.

The deployed tracker currently reduces restaurant landing_path to `/`. The checked-in shared sanitizer now accepts only the exact `/restaurants/` path and bounded signup-entry dimensions. **This backend change is prepared, not deployed.** The unchanged track-acquisition entrypoint imports it. Deploy only track-acquisition with the updated shared source, keeping its secrets, allowed origins and verify_jwt=false setting, BEFORE publishing the frontend. Do not redeploy submit-feedback or run db push/migrations for this task.

Then merge/publish the static page, links and both bridge/measurement scripts together through the existing GitHub Pages process. Verify live 200/canonical/sitemap, real CDN dependencies, browser and installed-PWA navigation, and controlled internal consenting signup attribution without counting test data as experiment results. Existing worker network-fetches HTML/noncached scripts and requires no cache-version change. Installed mode is not independently verified in this task.

Rollback: revert this change's page, homepage link, bridge, measurement path/dimensions and sitemap. Leaving the compatible server sanitizer deployed is safe and preserves existing cohort data. Do not delete restaurant cohorts, withdraw consent on behalf of users, alter retention or revert the signup-only privacy policy.

## Validation and performance

- `node tests/check-syntax.mjs`: all root/support/restaurant inline JS and JSON-LD, external scripts and changed Edge TypeScript parse.
- `node --test tests/*.test.mjs`: 21/21 pass (including dashboard filter/summary follow-up). Tests include actual local HTTP rendering, no-JS static content, SEO/canonical, all signup/demo CTA positions, all supported campaign IDs reaching consenting Auth setup token, declined consent, unknown-parameter exclusion, QR-route precedence, demo no-write behavior, mobile overflow at 320/390/768/1440, keyboard skip/FAQ and consent, original customer/preview/inactive/owner/support modes, offline/account-bound retries, blocked storage, privacy signals, account withdrawal and existing database security/eligibility/idempotency checks.
- `git diff --check`: passes. Final scoped diff inspected; original dirty checkout preserved.
- Desktop/mobile full-page screenshots visually inspected in test-results/restaurants-desktop.png and restaurants-mobile.png. No layout overflow or clipped controls found. FAQ uses native keyboard-accessible details; CTA targets are at least 48px high; focus outlines are explicit. Default foreground/background and CTA contrast exceed WCAG AA normal-text contrast; font fallbacks preserve layout when external fonts are unavailable.
- HTML about 11.7KB; CSS about 6.1KB; link helper about 0.7KB. Main app HTML about 642.9KB. New root bridge adds about 1.2KB. Landing does not load Supabase, Chart.js, PDF or QR generation dependencies. Logo dimensions are explicit; there are no large screenshot downloads, animation libraries or lower-page image assets requiring lazy loading. No Lighthouse/Web Vitals or live performance score is claimed.
- Browser tests block/mock every external request, so real Supabase gateway/Auth delivery, production CDN execution, installed PWA and released production routing remain release checks. All backend inspection was read-only; no Stripe/Prodigi end-to-end test is needed for untouched payment code.

## Copyable Google Ads setup (no account changes made)

Campaign: `restaurants_search_test_01`
Purpose: research UK operator intent and consenting-signup activation, not scaling.
Total maximum: £150–£300. Choose an explicit cap before launch; review spend regularly and stop at that cap (a daily budget alone is not this experiment's lifetime cap).
Network: Google Search only; Display expansion off. Keep search partners off initially for interpretable traffic.
Geography: United Kingdom, Presence (people in or regularly in the targeted location), rather than Presence or interest. Language: English.
Match: Exact/Phrase only; no Broad/AI expansion initially. Review actual search terms frequently, since both types include semantic/close variants.

Budget emphasis: Direct solution 60%, Private feedback 30%, Problem-aware 10%. These are review/allocation targets, not guaranteed spend splits within one campaign; Google doesn't provide fixed ad-group budget shares. If strict independent caps are needed, separate campaigns deliberately; do not add that complexity merely to enforce an approximate weighting.

Direct solution keywords:
```
[restaurant feedback software]
"restaurant feedback software"
[restaurant feedback system]
"restaurant feedback system"
[restaurant customer feedback software]
"restaurant customer feedback software"
[restaurant feedback qr code]
"restaurant feedback qr code"
"customer feedback system for restaurants"
```
Private feedback keywords:
```
[private restaurant feedback]
"private restaurant feedback"
"private customer feedback restaurant"
```
Hold anonymous keywords initially: the product promises private feedback, not guaranteed technical anonymity.

Problem-aware keywords:
```
"collect restaurant customer feedback"
"restaurant customer feedback"
"restaurant customer feedback form"
```
Only test complaint terms if actual searches establish operator intent.

Starting negatives (review match types/context; do not blindly exclude useful commercial traffic):
```
job
jobs
career
careers
salary
interview
assignment
coursework
dissertation
thesis
"research paper"
"questionnaire template"
"survey questions"
pdf
"printable template"
"example questionnaire"
"complaint letter"
refund
"phone number"
"contact number"
"customer service number"
"delete review"
"remove google review"
"remove tripadvisor review"
"fake review"
```
Do NOT exclude 'free' globally. Review PDF/printable-template searches before applying those exclusions, because print materials can also have legitimate buying intent.

Suggested responsive-search-ad copy (headlines ≤30 characters; descriptions ≤90):

Direct solution headlines:
- Restaurant Customer Feedback
- Simple Restaurant Feedback
- QR Feedback for Restaurants
- Start Free with FlashFeedback
Description 1: Give diners a quick private way to share feedback. No app or customer account. Start free.
Description 2: Scan, rate and optionally comment. See feedback privately in your restaurant dashboard.

Private feedback headlines:
- Private Restaurant Feedback
- Hear What Diners Really Think
- Feedback Without Long Surveys
Description 1: Give customers a quick private way to tell you about their experience. Start free.
Description 2: Scan a QR, choose a rating and optionally comment. No customer account required.

Problem-aware headlines:
- Catch Restaurant Issues Early
- Hear What Goes Unsaid
- Start Free with FlashFeedback
Description 1: Hear what diners enjoyed and what could be better. Quick private feedback with QR codes.
Description 2: Put your QR where diners see it. Read their ratings and comments in one dashboard.

Final URL example:
```
https://flashfeedback.co.uk/restaurants/?utm_source=google&utm_medium=cpc&utm_campaign=restaurants_search_test_01&utm_term={keyword}&utm_content=ag-{adgroupid}_cr-{creative}_mt-{matchtype}&utm_id={campaignid}
```
Prefer Final URL=https://flashfeedback.co.uk/restaurants/ and Final URL suffix:
```
utm_source=google&utm_medium=cpc&utm_campaign=restaurants_search_test_01&utm_term={keyword}&utm_content=ag-{adgroupid}_cr-{creative}_mt-{matchtype}&utm_id={campaignid}
```
If the account uses a tracking-template field instead, use `{lpurl}?` followed by that same suffix. Verify the account's combined final URL/template/suffix preview and avoid duplicating UTMs. Enable auto-tagging for gclid independently. The app accepts only bounded values after consent; standard ValueTrack IDs and expanded keyword spaces are supported.

Measurement: platform impressions → clicks/CPC/CTR/spend (separate unit); unmeasured landing visits/CTA/signup-screen openings; consenting signup submission → completed signup → QR ready → download/print/order signals → eligible page-open proxy → eligible persisted feedback. Review elapsed time and mature 14-day signup cohorts. Keep later activation, exclusions, flagged eligibility and missing attribution visible. Do not create an Ads conversion on a checkout return or claim an unimplemented Ads import/integration.

Learning: low impressions may mean low demand; impressions/no clicks suggest intent/message issues; traffic/no measured signups can reflect landing friction OR missing consent; signup/no QR suggests setup friction; QR/materials/no opens suggests deployment/placement; opens/no feedback suggests customer-flow friction. First eligible feedback warrants founder follow-up about placement, useful feedback, dashboard return and intended repeat use. No outreach automation is added.

Official configuration references checked 12 October 2026:
- https://support.google.com/google-ads/answer/1722038 (advanced location options)
- https://support.google.com/google-ads/answer/7478529 (keyword matching options)

## Support dashboard follow-up

Campaign and Landing page selectors populate from the authenticated report response, filter both business and arrival records, and preserve a chosen value when reloading cohort dates. The combined first-feedback card uses only measured signup_visit_v2 businesses with completed signup timestamps, excludes internal/test businesses, and counts each business once. It displays count/count/percentage; empty cohorts show no completed consenting signups. The card includes all recorded outcomes to date, not a 14-day conversion claim. Other report tables retain their existing historical definitions and show only the selected filters. No new API, event, Supabase mutation or backend deployment is needed for these dashboard controls. Frontend release must include admin-support.html and assets/js/acquisition-report.js together. Validation checks campaign/landing isolation, legacy/unknown/internal/incomplete exclusion, distinct-business counting, location-unit stability, zero results, retained filters, keyboard operation and 320/390px layout.
