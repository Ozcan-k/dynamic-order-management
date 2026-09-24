# Marketing Report — Monthly Sales Agent Targets (v2.94.0)

> **Status:** ✅ T1–T3 done (2026-09-24) — pushed to `test` as `v2.94.0-test`; main only with user approval. Verified on a copy of prod sales numbers (isolated tenant) + Playwright desktop / mobile.
> **Rule:** existing data is never modified — one new additive table; targets are read against the data agents already enter.

## 1. Targets (from the user, per agent per month)

| Metric | Default | Measured from |
|---|---|---|
| Sale Target | ₱300,000 | Direct order `total_amount` (same as the report's Direct Sales) |
| Online Order Count | 150 | Direct orders **+** live selling orders (decision 1) |
| Live Hour target | 52 h | Live selling hours |
| Video Posting | 30 | Completed content posts of type **Video + Reel** (decision 2) |
| Content Post | 60 | Completed content posts of type **Post** (photo posts) |
| New Inquiries | 100 | Marketplace inquiries |

## 2. Findings (prod, read-only, Jul–Sep 2026)
- Top months: Rachelle Aug ₱511,709 · 31 direct + 28 live orders · 22 videos + 6 reels · 198 inquiries; Princess Aug 54 live hours · 39 posts.
- Billy, Malto, Raven, Pulot (and Ma.Carmela) only enter direct orders — no content / live / inquiries. With all six targets they would show 0% on five every month → decision 3.

## 3. Decisions (user: "önerilenle devam et")
1. Online orders = direct orders + live selling orders.
2. Video target counts Video **and** Reel posts.
3. One default target set for every agent; an ADMIN can switch a metric off or set a different value per agent (e.g. sales-only agents).
4. Show pace in the current month: "expected by today" (target × elapsed days ÷ days in month) → On track / Behind, and a month-end projection.

## 4. Design
- **Table `sales_targets`** (additive): `tenant_id`, `scope` (`DEFAULT` or a sales agent's user id), `metric`, `value` (nullable = inherit the default), `enabled`, `updated_at`, `updated_by`; unique (tenant, scope, metric). No rows = the defaults above (no seeding, nothing written until an ADMIN edits).
- Targets are the current settings (not versioned per month): editing a target also changes how past months are scored — noted in the UI.
- **API** (prefix `/marketing`): `GET /targets?month=YYYY-MM[&agentId=]` (report viewers) → per agent × metric target, actual, %, expected-to-date, projection, status + team totals + 6-month history of the overall %; `GET /targets/settings` + `PUT /targets/settings` (ADMIN).
- **Overall achievement** = average of the enabled metrics' % each capped at 100 % (one huge metric can't hide the others); per-metric % is shown uncapped.
- **Status:** MET (≥ target) · ON_TRACK (current month, ≥ expected by today) · BEHIND (current month, below expected) · MISSED (past month, below target) · UPCOMING (future month).
- **UI:** Marketing Report → new **Targets** tab (month navigator, team progress per metric, one card per agent with six progress bars + pace marker + projection, 6-month history heat table, ADMIN "Edit targets" dialog with default + per-agent overrides). Agent page → **This month's targets** panel.

## 5. Phases
| # | Content |
|---|---|
| T1 | Shared constants/types, `sales_targets` table, target service + endpoints, tests against real data |
| T2 | Targets tab + editor + agent panel, Playwright desktop / mobile |
| T3 | Docs, `v2.94.0-test`; main only with user approval |
