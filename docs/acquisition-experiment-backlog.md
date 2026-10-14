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

| ID | Seed title |
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
| EXP-013 | POS / app marketplace distribution |

Quick-captured ideas receive a stable server-generated `IDEA-<uuid>` identity. IDs and creation dates are immutable. Timestamp updates and one completion-definition snapshot are the lightweight audit trail; there is no event sourcing.

## Results and access

EXP-001 View results opens the existing Acquisition Cohorts area with campaign `restaurants_search_test_01` and landing `/restaurants/` selected. It retains the current date range (initially the last 30 days); widen that range for earlier evidence. If cohorts are already loaded, existing reporting re-filters them; otherwise it loads them. Reporting and its measurement definitions are not duplicated on the board.

The board matches Admin Support’s existing internal-superuser access. Supabase RLS checks `current_internal_admin_role() = 'superuser'` for SELECT, INSERT and UPDATE. Anonymous clients have no grants, ordinary authenticated users and non-superuser internal users have no matching policy. The browser uses the existing user-scoped Supabase client and session; no service-role key or runtime localStorage backlog is introduced. No customer-data policies, Edge Functions or reporting RPCs change.

## ChatGPT / Codex workflow

Read the live backlog before proposing another growth experiment. Inspect existing definition, trigger, status, evidence and learning, including completed or archived ideas that may already answer the question. Prefer advancing or refining an existing idea over duplicating it. Use a copied brief for context, and treat it as a snapshot rather than the current database state.

At the end of a meaningful experiment, record what happened and what was learned. Review the decision panel and the whole backlog before choosing the next significant acquisition test. Do not turn implementation completion into evidence of customer activation, and do not equate QR generation/download with genuine feedback.

## Deployment and checks

Apply the additive `growth_experiment_backlog` migration to the matching Supabase project and deploy the static Admin Support file plus board script/style together. GitHub deployment does not apply database migrations. Do not deploy unrelated Edge Functions from this partial repository.

Run `node tests/growth-experiments.test.cjs` for the rule/brief and inline-script checks. Run `node tests/growth-experiments-browser.cjs` with Playwright available for an HTTP-served mocked-session UI check; it does not write production data. Live database permissions and mutation checks should run in a rolled-back transaction against existing authorised identities. See validation notes for the results and limits of this implementation.
