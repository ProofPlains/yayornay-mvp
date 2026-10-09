# SEO foundation — 9 October 2026

## Baseline and scope

Production GitHub main was `cad6b62a110145edb3565cec2953866e7a5c1318`.
The fetched live homepage matched that commit after line-ending normalization.
The full tracked tree contains two HTML documents, image assets, a manifest,
service worker, README/license, CNAME and a small subset of backend source.
There is no marketing page generator, build pipeline or conventional test suite.
The original local checkout has extensive staged/unstaged/untracked work and an
older HEAD. Work was prepared in an isolated production clone; none of that
unrelated work is part of the production SEO change.

No Supabase schema, RLS, backend functions, billing, analytics contracts or data
were changed. Deployed Supabase state was not audited: this change concerns only
static frontend metadata/markup and does not claim backend production parity.
The user's Search Console baseline remains the supplied baseline, not a fresh
Search Console measurement. No ranking, traffic or Core Web Vitals gain is claimed.

## A. Confirmed issues

- No homepage description, canonical, social metadata or structured data.
- Live robots.txt and sitemap.xml returned 404.
- Support console returned 200 without noindex.
- The DOM contains four H1s, but only the main proposition is visible on the
  homepage. The fifth source-code H1 is dynamically generated QR-sign markup.
  The hidden legacy homepage contributes one redundant H1; customer and app
  headings belong to separate screens and should retain their semantics.
- Fourteen static DOM images: one lacks alt; several intentionally have empty
  alt. Source-string counts that include templates are not an accessibility audit.
- HTTP apex serves 200 rather than redirecting to HTTPS.
- Roughly 613 KB of uncompressed HTML includes all application modes and inline
  CSS/JS. QR styling, Chart.js and jsPDF load synchronously in the head. A hidden
  legacy landing chart was rendered on every return to the homepage.
- Main acquisition copy is present in static HTML and visible unauthenticated.
  Language and viewport tags already exist. No broken public href was found:
  policy/terms are modal controls using `#`, and contact is a mailto link.

## B. Implemented fixes and exact files

1. `index.html`: metadata, URL/view indexing policy, one hidden heading demotion,
   QR image text, font preconnects and removal of the hidden chart invocation.
2. `admin-support.html`: static `noindex, nofollow` only.
3. `robots.txt`: crawl access plus sitemap discovery.
4. `sitemap.xml`: homepage only.
5. `docs/seo-foundation-2026-10-09.md`: decisions, domain evidence and validation.

Title: **FlashFeedback | Private Customer Feedback with QR Codes**.

Description: **Collect quick, private customer feedback with QR codes. Catch
problems early and view responses in one dashboard. Start free with no credit
card required.**

The visible proposition remains “Catch problems before they become bad reviews.”
No new product claims or SEO landing pages were added.

### Indexing and canonical contract

| URL/state | Indexing | Canonical |
| --- | --- | --- |
| `/` | Eligible; no noindex | `https://flashfeedback.co.uk/` |
| `/index.html` | Homepage duplicate | Same homepage canonical |
| Homepage with allowlisted campaign parameters | Homepage duplicate | Same homepage canonical |
| Known homepage heading anchors | Homepage | Same homepage canonical |
| Location feedback; `ff_test`; public QR sign | Rendered noindex, nofollow | Removed; not equivalent to homepage |
| Invitation, recovery, unsubscribe, subscription/order return, reply deep link | Rendered noindex, nofollow | Removed |
| Unknown query parameters or non-marketing hashes | Rendered noindex, nofollow | Removed pending deliberate review |
| Signup, login, demo, dashboard and other in-document app views | Rendered noindex, nofollow | Removed |
| Support console | Static noindex, nofollow | None |

Allowed campaign keys are `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
`utm_content`, `utm_id`, `gclid`, `dclid`, `fbclid`, `msclkid`. They are never
rewritten or stripped, preserving existing attribution. Mixed campaign + app
queries remain excluded. New parameters need an intentional indexing decision.

An early independent head script applies query/hash exclusions before CDN/app
boot. Existing `hideAllScreens()` transitions select app metadata; `showWelcome()`
restores homepage metadata only for an eligible arrival. Application arrivals stay
excluded after auth/payment code cleans their URL. No history methods, storage
contracts, URLs, handlers, API calls or event producers were replaced.

GitHub Pages cannot emit query-specific HTTP headers/HTML. Thus the original HTML
contains homepage metadata for all query variants; exclusions require a crawler
to execute JavaScript. Crawlers that do not render may see generic homepage
metadata. Static support noindex does not have this limitation. This is not access
control, and is not an absolute guarantee against indexing. For stricter control,
evaluate an edge/server response layer or a separate static noindex app entry
point in a dedicated migration that preserves all existing QR/auth links.

The homepage never ships a static noindex that JavaScript must remove. Crawling
application URLs stays allowed so Google can discover their rendered noindex.
See [Google JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
and [Google noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

`robots.txt`:

```text
User-agent: *
Allow: /

Sitemap: https://flashfeedback.co.uk/sitemap.xml
```

`sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://flashfeedback.co.uk/</loc>
  </url>
</urlset>
```

Do not invent lastmod dates. Add genuine static marketing URLs only when live.
For GitHub Pages a future `restaurants/index.html` naturally uses `/restaurants/`;
choose that trailing-slash canonical consistently in navigation and sitemap.
Do not route missing marketing pages through an SPA catch-all returning 200.

### Semantics, images and sharing

The hidden legacy hero H1 becomes H2, with its original CSS treatment retained.
The active hero remains the sole visible homepage H1; customer/app/QR headings
are retained. Existing homepage H2/H3 structure is already sound.

The hidden QR example gains `alt="QR code linking to the FlashFeedback homepage"`,
500×500 intrinsic dimensions and lazy loading. Printable/downloadable previews
gain descriptive alt, including the regenerated print-image template. Decorative
bolts retain empty alt and aria-hidden. Existing product and print-image alt stays.
Preview containers already have aria-hidden; this pass does not change that flow.

JSON-LD describes only Organization and WebSite: name, URL, existing logo,
publisher relationship and language. It is removed on app views. No reviews,
ratings, offers, awards, invented company details or rich-result promises.

Open Graph includes title, description, URL, website type, site name, locale and
image dimensions/alt. X/Twitter uses a summary card. The existing 512×512 brand
icon was visually inspected and is suitable for a small square logo preview.
Create a dedicated 1200×630 branded image before a large-image campaign; do not
stretch this icon into a landscape card. Generic sharing metadata remains on app
links and never includes business/customer details.

### Performance

Added preconnects for Google Fonts origins; lazy-loaded the hidden QR example;
stopped constructing the invisible legacy landing chart. Its helper and IDs stay
available. No scripts were reordered/deferred: application dependencies are
coupled and changing loading order deserves its own measured regression pass.
PWA service worker, cache version, manifest and cached images are unchanged.

## C. Additional opportunities

| Priority | Opportunity / decision |
| --- | --- |
| Fix now | Metadata, indexing policy, robots/sitemap, hidden heading, missing alt, hidden chart work, font preconnects — implemented. |
| Fix before `/restaurants` | Enable Enforce HTTPS in GitHub Pages after checking its live settings/certificate; current HTTP 200 is a duplicate origin. |
| Fix before `/restaurants` | Resolve CNAME and registrar forwarding with account access; preserve QR path/query parameters and add HTTPS-capable www.co.za forwarding. |
| Fix before `/restaurants` | Build real static marketing HTML with unique metadata, reciprocal crawlable links, intentional trailing-slash URLs and sitemap entry. Existing button CTAs need not be changed into links to invented routes. |
| Fix before `/restaurants` | Dedicated 1200×630 social image; submit sitemap in Search Console and inspect rendered exclusions after recrawl. |
| Later | Measure field/lab LCP, INP and CLS before separating marketing/app payloads or lazy-loading QR/PDF/chart libraries. No measured CWV failure was established. |
| Later | Remove legacy hidden homepage markup/CSS with reference-aware cleanup; retained now because IDs/helpers are coupled. |
| Later | Policy/terms can have stable linked documents if discoverability and maintenance warrant it. Existing modal links work. |
| Later | Unknown-location route currently leaves an “Unknown Location” form visible. Existing behaviour, not changed; investigate separately with inactive/invalid-location fixtures. These routes now receive noindex. |
| Later | If search engines index application variants despite rendered exclusions, add response-level indexing controls in a carefully scoped hosting/app-entry migration. |
| Not worth doing | Framework rewrite, keyword stuffing, invented SoftwareApplication offers/reviews, changing PWA cache solely for SEO, or padding sitemap with app states. |

## D. CNAME/domain forensic findings

Original commit `66a8d25fff155ff5178fed1cf8493de0f8a41a4c` on 14 November 2025
created both lines together. No later CNAME change exists. Its immediate parent
`776506b` concerns Android PDF printing, with no hosting clues. Next commit
`e1c890a` switches favicon from proofplains.github.io/yayornay-mvp to `.co.uk`.
Following commit `61d3afe` standardizes public contact addresses on `.co.uk`;
nearby legal copy references UK GDPR and South African POPIA. Repository/history
searches found `.co.za` only in the CNAME creation, not a redirect implementation.

Most likely intent: associate both owned geographic domains with one product,
with `.co.uk` as the visible brand destination. Confidence: moderate. History
does not establish whether two-site hosting or forwarding was intended, nor
prove the owner's current strategic use of `.co.za`.

Observed on 9 October 2026 using DNS and HTTP GET/HEAD:

| Endpoint | Behaviour |
| --- | --- |
| HTTPS `.co.uk` | 200, GitHub Pages; live HTML matches main |
| HTTPS `www.co.uk` | 301 to HTTPS apex, then 200 |
| HTTP `.co.uk` | 200, no HTTPS enforcement |
| HTTP `www.co.uk` | 301 to HTTP apex, then 200 |
| HTTPS/HTTP `.co.za` root GET | 301 to `https://flashfeedback.co.uk` |
| HTTPS `.co.za` HEAD | 405; do not mistake this for failed GET forwarding |
| HTTPS `www.co.za` | DNS does not resolve |
| `.co.za/?location=<test-uuid>&ff_test=1` | 301 to homepage; query is lost |
| `.co.za/admin-support.html` | 404 from forwarding infrastructure |

`.co.uk` apex A records: GitHub Pages 185.199.108.153 through 185.199.111.153.
`www.co.uk` CNAME: proofplains.github.io. `.co.za` A records: 3.33.251.168 and
15.197.225.128, with ns23/ns24.domaincontrol.com nameservers. Its responses come
from AWS-hosted forwarding infrastructure, not GitHub Pages. This strongly
supports an external registrar/hosting redirect independent of repository CNAME;
the exact forwarding account settings are not accessible and were not inferred
solely from nameservers.

GitHub Pages configuration could not be authenticated/read: the connector rejects
the Pages endpoint, and the unauthenticated API returns 404. Deployment source,
configured domain and Enforce HTTPS toggle were therefore not directly verified.

GitHub documents a single domain per CNAME and external forwarding for additional
domains: [custom-domain troubleshooting](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages).
The correct eventual file is likely one `.co.uk` line. **CNAME is unchanged in
this pass**: exact Pages/registrar settings and original intent remain incomplete,
so availability safety cannot be certified from repository evidence alone.

External actions: inspect Pages domain/source and HTTPS settings; inspect existing
registrar forwarding; keep the working `.co.za` apex service; configure both apex
and www with valid TLS and permanent forwarding preserving path/query. DNS alone
cannot perform an HTTP redirect. Then coordinate the one-line CNAME correction
and verify all four domains plus QR deep links. Do not point `.co.za` blindly at
GitHub or change `.co.uk` DNS to implement forwarding.

## Validation and limits

- `git diff --check` passes for the isolated production change.
- All seven executable inline scripts in both HTML files pass Node syntax checks.
- JSON-LD and sitemap XML parse; sitemap has exactly one homepage URL.
- 21 URL cases plus app/home transitions pass isolated metadata checks, including
  mixed tracking/application queries and URL cleanup after application arrival.
- Served over localhost HTTP: homepage unauthenticated, signup/login entry,
  keyboard CTA activation, demo rating submission/thank-you and automatic demo
  dashboard transition; returning home restores canonical/indexability.
- 390×844 mobile layout inspected; no horizontal overflow; keyboard Tab reaches
  Get Started Free and Enter opens signup.
- Unknown-location ordinary and ff_test routes render with noindex and without
  a canonical; preview safety messaging is preserved. No real feedback submitted.
- Support login gate renders with static noindex. Authenticated support actions,
  real login/signup completion, valid/inactive production locations, billing and
  physical fulfilment were not end-to-end exercised.
- CNAME, service worker, manifest and backend source are unchanged. Installed-mode
  Android/iOS prompting and offline cache lifecycle were not device-tested.
- No analytics producer or event contract changed; no production feedback or
  account was created for testing. No Search Console sitemap submission is claimed.

Release checks must confirm deployed source/robots/sitemap, apex/www and `.co.za`
behaviour, plus no homepage noindex. Search Console can verify Google's rendered
interpretation after deployment/recrawl; local tests do not prove deindexing.
