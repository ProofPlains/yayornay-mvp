# Growth Experiments implementation validation

Validated on 13 October 2026 against GitHub main `e10d9b920f17e5507630a1d9bc2df4aabec0367e` and live Supabase project `evediwsocfbalzbzdden`.

## Repository and deployment boundaries

The original `yayornay-mvp` checkout had staged, unstaged and untracked unrelated work, including Admin Support edits, and its HEAD was `7596ea595d4af7d754fe8de49039e11e7948f296`. Implementation used a separate clone of current main. The original checkout and synced ChatGPT sources were not modified. The local-only AGENTS/product-principles guidance was read; those files were absent from GitHub main and were not copied into this change.

The additive Growth Experiments migration was applied live using Supabase MCP. The static UI is published on the review branch and requires the normal frontend deployment after review. No existing Edge Functions or customer-data policies were deployed or changed.

## Database checks

`tests/growth-experiments-access.sql` ran successfully in a rolled-back live transaction using the existing superuser identity for policy evaluation. This checks real database grants, RLS and trigger behaviour rather than bypassing them as a service-role client.

- Anonymous read and insert are denied.
- Ordinary authenticated and identity-less requests cannot read records; ordinary insert is denied and updates affect no rows.
- Authorised superuser read, capture, edit, Next, Testing now, Pause/Later and completion succeed.
- Completion without result/learning fails. Completion preserves the original hypothesis in a single snapshot; later changes cannot overwrite that snapshot, identity, creation date or completion timestamp.
- Archive/restore retain the definition, outcome and learning. The authenticated role has no delete grant, including for superusers.
- All thirteen stable seeded IDs exist once. A repeated seed insert does not overwrite EXP-001.
- The existing acquisition report executes successfully under its authorised role.
- Test fixtures were rolled back; live records retain the requested initial states.

RLS/grants were inspected separately after deployment. Supabase security advisors reported no findings for `growth_experiments` or `stamp_growth_experiment`. Existing unrelated advisor findings were present before and after, including existing security-definer views/functions and leaked-password protection being disabled; those were outside this change. See [Supabase security-definer view guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).

## Browser and regression checks

`tests/growth-experiments-browser.cjs` serves the actual Admin Support UI over HTTP with simulated sessions and a persistent test record server. It checks the full UI interactions without production writes:

- Four ordered states and the EXP-001 banner.
- A–G recommendations, including the fifth F candidate and creation/reuse of the E messaging idea.
- Quick capture, escaped text, full definition editing and saved state transitions; reloading preserves the test-server records.
- Required completion fields and definition preservation; archive/restore and copying a brief.
- Stale-edit conflicts preserve the form text for review.
- EXP-001 results filters on fresh and already-loaded Acquisition Cohorts; existing support tabs continue to work.
- Stacked cards and no page overflow at 320px and 390px; keyboard tab navigation, dialog Escape and focus restoration.
- Transient read failures retain the last successful view; access denial clears records, editing fields and category options.

Desktop and mobile screenshots were inspected. Browser checks passed using installed Chrome. For an environment without bundled Chromium, set `PLAYWRIGHT_CHANNEL=chrome` when running this script. Screenshots are generated in ignored `test-results/`.

The rule/brief/seed and inline syntax check passed (`tests/growth-experiments.test.cjs`). Existing checks also passed:

- All inline/external JavaScript and existing Edge TypeScript syntax (`tests/check-syntax.mjs`).
- Seven measurement/reporting tests (`tests/measurement.test.mjs`).
- Thirteen HTTP browser journey tests covering restaurant landing, signup consent, public customer QR, previews/demo, inactive locations, owner dashboard and internal acquisition reporting (`tests/browser.test.mjs`).
- Existing database migration/acquisition/eligibility/concurrency/isolation test (`tests/database.test.mjs`).

Test-only dependencies were installed in a temporary workspace folder; no product dependency or framework was added. `git diff --check` passed.

## Limits

UI checks use simulated browser sessions; a real founder login and frontend deployment are not claimed by these checks. Live database authorization was exercised through SQL with the authenticated/anonymous roles and request identity claims inside a rollback transaction. No real customer feedback, business signup or acquisition event was created. This validates implementation behaviour, not any acquisition hypothesis.
