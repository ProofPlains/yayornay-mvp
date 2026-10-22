# FlashFeedback Growth Experiment Backlog

**Before proposing a new FlashFeedback acquisition or growth experiment, check the existing Growth Experiment Backlog first.**

**When an experiment finishes, record the result and learning before beginning the next significant acquisition experiment.**

## Why it exists

Promising acquisition, activation and distribution ideas must survive beyond old conversations. Restaurant Google Search is Experiment 01, not the acquisition strategy. This workspace helps the founder answer what is testing now, what was learned, what could come next, and why.

Admin Support → **Growth Experiments** is the founder interaction surface. Live Supabase `public.growth_experiments` is the source of truth after seeding. This document describes the system and strategy; it is not a second runtime backlog. Never manually synchronise status or note edits back into Markdown.

## Operating it

- **Testing now:** actively gathering evidence. The banner shows each active experiment and its primary success signal.
- **Next:** a small set of candidates, not commitments. Aim for 2–3; the system does not automatically prioritise or impose a hard cap.
- **Later:** preserved ideas and paused experiments. Pause returns to Later and keeps notes.
- **Completed:** outcome and learning recorded, with an immutable snapshot of the original definition at completion.

Use **+ Add experiment idea** with a title and optional note. It saves to Later with type “Idea”. Add hypothesis, why it might work, test trigger, primary and supporting signals, channel, effort and cash cost when ready. Unspecified effort/cost is deliberate rather than an invented estimate.

Use explicit Move to Next, Start experiment, Pause, Return to Later, Complete and Archive actions. Completion requires “What happened?” and “What did we learn?”; the next step is optional. Completed definitions stay preserved; subsequent edits can update evidence and learning. Copy experiment brief produces Markdown for ChatGPT/Codex; if clipboard access is unavailable, a selectable brief opens.

Archive retains the record and its evidence. Archived experiments are expandable and restorable. There is no permanent-delete action or authorised delete grant. Last-updated checks prevent a stale edit from overwriting a change made in another session; refresh and review if a conflict is reported.

## What happened? rules

The decision panel is rule-based, not AI. Select an observed outcome after checking sample size, consent/measurement coverage and alternate explanations. Selecting an outcome alone does not complete an experiment or write learning; use Record outcome / Complete experiment for that.

| Outcome | Candidates |
| --- | --- |
| A: Not enough relevant search traffic | EXP-002, EXP-003, EXP-006, EXP-010 |
| B: Relevant clicks, few measured signups | EXP-002, EXP-005 |
| C: Signups, weak QR readiness | EXP-002, EXP-007 |
| D: QR readiness/download/order, few real opens | EXP-003, EXP-007 |
| E: Opens, little submitted feedback | QR/CTA messaging idea, EXP-003 |
| F: Activation, expensive paid acquisition | EXP-003, EXP-004, EXP-006, EXP-008; EXP-010 in “One more candidate” |
| G: Strong activation and promising economics | Continue/deepen EXP-001, cautiously increase the sample, support restaurant SEO and optimise conversion. No forced new experiment. |

Each candidate explains its relevance and offers Move to Next when it is in Later. Existing Next/Testing/Completed/Archived records show their state so evidence is reviewed rather than overwritten. E can create a messaging idea through quick capture if no unarchived record of type `QR messaging / activation` exists. It reuses that idea on subsequent visits. The creator can adjust the proposed title/note before saving. No experiment starts automatically.

## Initial seed identities

These are stable identities, not a manually maintained status list. The migration seeds EXP-001 as Testing now, EXP-002/003 as Next and the remainder as Later, using `ON CONFLICT DO NOTHING` so reseeding never overwrites evidence.

Titles below reflect the documented planning scope. Original seed migrations remain historical; a revised planning title does not rename or change the live record automatically.

| ID | Experiment title |
| --- | --- |
| EXP-001 | Restaurant Google Search acquisition |
| EXP-002 | Free Restaurant Feedback QR/Sign Generator |
| EXP-003 | Restaurant QR Placement Guide |
| EXP-004 | Powered by FlashFeedback product-led referral loop |
| EXP-005 | Demo-as-customer acquisition journey |
| EXP-006 | YouTube and short-form problem-led content |
| EXP-007 | Free Restaurant Feedback Toolkit |
| EXP-008 | Google Reviews vs Private Feedback content |
| EXP-009 | Competitor / alternative pages |
| EXP-010 | Restaurant supplier / agency partnerships |
| EXP-011 | Restaurant-owner communities |
| EXP-012 | New vertical landing-page experiments |
| EXP-013 | [Platform Integrations & Marketplace Distribution](#exp-013--platform-integrations--marketplace-distribution) |

Quick-captured ideas receive a stable server-generated `IDEA-<uuid>` identity. IDs and creation dates are immutable. Timestamp updates and one completion-definition snapshot are the lightweight audit trail; there is no event sourcing.

## EXP-013 — Platform Integrations & Marketplace Distribution

**Type:** Platform distribution / integration. **Status:** unchanged by this documentation update; EXP-013 was originally seeded as Later. The live backlog remains authoritative for its current status, evidence and learning.

**Strategic hypothesis:** FlashFeedback may be able to acquire and activate customers more efficiently by integrating with platforms businesses already use, allowing them to discover FlashFeedback through trusted marketplaces and incorporate feedback collection into existing workflows.

This broadens the original “POS / app marketplace distribution” opportunity beyond restaurants while preserving its restaurant POS thinking. Distinguish two potential sources of value:

1. **Distribution:** Businesses discover, install and subscribe to FlashFeedback through third-party app marketplaces or integration directories.
2. **Product integration:** FlashFeedback becomes part of existing business workflows, enabling more convenient or automated feedback collection and potentially improving activation, engagement and retention.

Both are hypotheses, not established outcomes. An integration could improve a workflow without delivering marketplace acquisition, or attract installations without producing genuine feedback. Evaluate them separately. Preserve the original insight that integration value may come from automatically creating feedback opportunities, not just importing metadata. Do not build an integration merely because enterprise competitors have one.

### Prioritisation and dependencies

Restaurants remain FlashFeedback’s current primary beachhead market, and EXP-002 remains the more immediate growth experiment. The following ordering is for platform opportunity validation, not approval to develop several integrations or expand the product across several segments at once.

| Sub-experiment | Target segment | Research sequence / priority |
| --- | --- | --- |
| EXP-013B — Shopify & E-commerce Platforms | Independent e-commerce retailers and Shopify merchants | Preferred first platform opportunity for exploratory validation |
| EXP-013C — Mailchimp & Marketing Automation Platforms | Businesses using email marketing and customer automation across hospitality, retail, services and e-commerce | Secondary exploratory research, following Shopify; assess segment overlap |
| EXP-013A — Restaurant POS & Ordering Platforms | Restaurants, cafés and hospitality businesses | Longer-term integration opportunity, consistent with the original EXP-013 |

These are three sub-experiments within the single EXP-013 parent opportunity area, not three new top-level backlog records. No status transitions, assignments or delivery commitments are implied.

**Test when:** Opportunity validation may begin with a small, bounded test of a specific customer problem and distribution route. Full integration development should wait until customer demand and marketplace distribution potential are better understood and the effort is justified. Avoid spreading product-development capacity across segments prematurely. Effort and cash cost remain unestimated until the platform requirements and smallest useful test are understood.

Retain the original POS development dependencies for EXP-013A: a validated restaurant proposition, evidence that manual QR deployment limits growth or response volume, a specific platform with relevant target-market penetration, and justified implementation/commercial effort. These are not prerequisites for conducting lightweight exploratory Shopify research.

Use the original comparison lens as a qualitative aid, not a numerical prioritisation score:

> Target-market adoption × automatic feedback reach × context richness × distribution leverage ÷ implementation/commercial complexity.

### EXP-013A — Restaurant POS & Ordering Platforms

**Target segment:** Restaurants, cafés and hospitality businesses.

**Hypothesis:** Integrating with existing POS or ordering systems could make feedback collection easier and more consistent, while app marketplaces could introduce FlashFeedback to relevant operators.

Potential use cases to validate:

- Post-transaction or post-order feedback requests.
- Feedback requests integrated into digital receipts.
- QR codes embedded in existing ordering journeys.
- Automatic association of feedback with a location or order, where appropriate and permitted.

**Priority:** Longer-term, subject to the restaurant validation and platform-fit dependencies above. Research must distinguish added feedback opportunities from merely importing order or location metadata, and distinguish marketplace discovery from workflow value.

### EXP-013B — Shopify & E-commerce Platforms

**Target segment:** Independent e-commerce retailers and Shopify merchants.

**Hypothesis:** Online retailers may value an easy way to collect private, actionable customer feedback after purchases or deliveries, particularly feedback that would not otherwise appear in public reviews or support conversations.

Potential use cases to validate:

- Post-purchase feedback requests.
- Post-delivery feedback requests.
- Private customer-experience feedback.
- Feedback associated with orders or products, where appropriate.
- A FlashFeedback app discoverable through the Shopify App Store.

**Priority:** First platform opportunity to investigate. Initial validation should examine existing Shopify feedback/review app competition, potentially underserved customer problems, whether private feedback offers sufficiently differentiated value, merchant demand and willingness to pay, marketplace discoverability/distribution potential, and technical, privacy and platform requirements.

The riskiest assumptions include whether an unmet problem exists, whether merchants would use and pay for this approach, and whether the marketplace can reach those merchants economically. Listing an app is not evidence of distribution. Do not assume a Shopify integration is justified before validating demand.

### EXP-013C — Mailchimp & Marketing Automation Platforms

**Target segment:** Businesses using email marketing and customer automation, potentially spanning hospitality, retail, services and e-commerce.

**Hypothesis:** Businesses may value collecting feedback through email campaigns and automated customer journeys, using platforms they already trust.

Potential use cases to validate:

- Feedback requests embedded in email campaigns.
- Automated post-interaction feedback invitations.
- Feedback collection through customer lifecycle journeys.
- Integration with existing customer communication workflows.
- Discovery through relevant integration directories.

**Priority:** Exploratory research following Shopify. Assess whether this represents a genuinely distinct customer problem or substantially overlaps with the Shopify segment. If it mainly reaches the same merchants with the same use case, treat it as a possible workflow extension rather than evidence for a separate product-development effort.

### Validation phases and decisions

These are potential evidence gates, not an approved delivery roadmap. Define the question, eligible customer group, observation window and decision rule before each test. Do not invent numerical targets before the opportunity and baseline are understood.

| Phase | Smallest useful work and learning milestone | Evidence-led decision |
| --- | --- | --- |
| **1 — Opportunity validation** | Research customer problems and current behaviour; map competitors/existing solutions; evaluate marketplace distribution potential and technical/privacy/platform requirements; identify the riskiest assumptions. Use the smallest meaningful combination of interviews, lightweight demand tests, prototypes or landing pages capable of reducing uncertainty. Seek concrete evidence of the problem, current workarounds, willingness to commit effort/payment, and a plausible route to reach merchants. | **Persevere** towards an MVP only if evidence supports a specific unmet problem, differentiated private-feedback value, credible demand/distribution and feasible requirements. **Iterate** the use case or segment if evidence points elsewhere. **Stop/defer** if existing solutions suffice, behavioural demand is weak, distribution is implausible or complexity outweighs likely value. Expressions of interest alone do not justify development. |
| **2 — Integration MVP** | Only with sufficient Phase 1 evidence, select one platform and one narrowly defined use case. Build the smallest viable integration needed to observe actual customer behaviour: connection, first genuine feedback and repeated use. | **Persevere** towards marketplace distribution if businesses can connect, receive useful genuine feedback and return to collect/use it. **Iterate** a demonstrated connection, activation or value bottleneck. **Stop/defer** if the core value is not observed or the operational/privacy burden is unjustified. |
| **3 — Marketplace distribution and growth** | Evaluate installation-to-activation conversion, genuine feedback collection and recurring usage; assess acquisition cost, paid conversion, retention and ongoing integration maintenance cost. Separate marketplace-acquired customers from other acquisition sources. | **Expand** only if the channel delivers activated, retained customers with credible monetisation relative to acquisition and maintenance effort. **Iterate** discovery, conversion or retention where evidence supports a fix; **stop/defer** if distribution or sustained customer value remains unconvincing. |

### Measurement and success signals

**Primary success signal for the developed channel:** Businesses acquired through the platform reaching first genuine customer feedback and continuing to receive/use useful feedback, with evidence that monetisation and retention can justify acquisition and ongoing integration costs. This is an intended outcome to test, not a claim that integrations already improve growth.

Potential supporting measures, selected to match the phase and use case:

- Marketplace listing impressions and visits, as diagnostic discovery measures rather than proof of business value.
- Installation or signup conversion.
- Integration connection/completion rate.
- Time to first genuine customer feedback.
- Percentage of acquired businesses receiving feedback.
- Weekly active feedback-collecting businesses.
- Paid conversion and customer retention.
- Acquisition cost and ongoing integration maintenance cost.

Not every measure applies to initial research. Phase 1 should record what uncertainty was reduced, which assumptions remain, and the smallest next test supported by the evidence. Phase 2 focuses on successful connection and actual first/repeated value; Phase 3 evaluates the complete acquisition-to-retention economics. Define denominators, eligible cohorts, attribution coverage and observation windows before interpreting conversion or retention.

Reuse FlashFeedback’s existing activation definitions where applicable: first persisted customer feedback is stronger evidence of value than signup or setup, and known internal/test activity must remain distinguishable from genuine customer behaviour. An installation, connection, QR generation or download is not activation by itself. Existing acquisition reporting’s eligible activity is not automatically verified genuine-customer feedback.

The existing North Star-style measure, `weeklyActiveFeedbackLocations`, counts distinct locations with persisted feedback in the trailing 168 hours. Preserve that definition. For a platform study, weekly active feedback-collecting businesses would be a separately labelled business-level measure, deduplicating businesses over a declared window; it must not silently replace the location metric. How online-only merchants map to the current location model is an open validation question, not an assumed product change. This document adds no analytics instrumentation.

### Documentation boundary

This is a planning update only. It does not change the live EXP-013 title, fields, evidence or status, create runtime sub-experiment records, modify historical seeds, or authorise integration development. The live board may therefore still display the original title. No research findings or validated demand are asserted here; the research questions above remain to be investigated in a separately authorised experiment.

## Results and access

EXP-001 View results opens the existing Acquisition Cohorts area with campaign `restaurants_search_test_01` and landing `/restaurants/` selected. It retains the current date range (initially the last 30 days); widen that range for earlier evidence. If cohorts are already loaded, existing reporting re-filters them; otherwise it loads them. Reporting and its measurement definitions are not duplicated on the board.

The board matches Admin Support’s existing internal-superuser access. Supabase RLS checks `current_internal_admin_role() = 'superuser'` for SELECT, INSERT and UPDATE. Anonymous clients have no grants, ordinary authenticated users and non-superuser internal users have no matching policy. The browser uses the existing user-scoped Supabase client and session; no service-role key or runtime localStorage backlog is introduced. No customer-data policies, Edge Functions or reporting RPCs change.

## ChatGPT / Codex workflow

Read the live backlog before proposing another growth experiment. Inspect existing definition, trigger, status, evidence and learning, including completed or archived ideas that may already answer the question. Prefer advancing or refining an existing idea over duplicating it. Use a copied brief for context, and treat it as a snapshot rather than the current database state.

At the end of a meaningful experiment, record what happened and what was learned. Review the decision panel and the whole backlog before choosing the next significant acquisition test. Do not turn implementation completion into evidence of customer activation, and do not equate QR generation/download with genuine feedback.

## Deployment and checks

Apply the additive `growth_experiment_backlog` migration to the matching Supabase project and deploy the static Admin Support file plus board script/style together. GitHub deployment does not apply database migrations. Do not deploy unrelated Edge Functions from this partial repository.

Run `node tests/growth-experiments.test.cjs` for the rule/brief and inline-script checks. Run `node tests/growth-experiments-browser.cjs` with Playwright available for an HTTP-served mocked-session UI check; it does not write production data. Live database permissions and mutation checks should run in a rolled-back transaction against existing authorised identities. See validation notes for the results and limits of this implementation.
