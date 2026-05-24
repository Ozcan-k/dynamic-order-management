# Dynamic Order Management System — Architecture Document

> **Version:** 2.40.0  
> **Date:** 2026-05-23  
> **Status:** PENDING deploy — **Dependency bump (v2.40.0)**: `framer-motion` 12.40.0 added to `frontend` deps (future motion work; not yet consumed by any component — additive only). `vite` bumped 5.4.21 → 6.4.2 (devDep) to resolve the pre-existing peer-dep conflict with `@vitejs/plugin-basic-ssl@2.3.0` (which required vite ^6.0.0 || ^7.0.0 || ^8.0.0 and was forcing every `npm install` to fail without `--legacy-peer-deps`). `@vitejs/plugin-react@4.3.3` left untouched (4.x supports both vite 5 and 6). `vite.config.ts` API-compatible with v6 — zero config edits required. Build verified green with vite 6: `npm run build -w frontend` = 6.81s, 1112 modules transformed, dist sizes effectively unchanged from Phase I baseline (`index.html` 0.49 kB, CSS 44.02 kB, JS 1617.98 kB). Pre-existing chunk-size warning (>500 kB) is unrelated to this bump. Node `v20.9.0` satisfies vite 6.4.2 `engines.node` (`^18 || ^20 || >=22`). Workspace-aware install used (`npm install -w frontend`) since dom is an npm-workspaces monorepo (`frontend`/`backend`/`shared`); root `node_modules` is the hoisted target. After this bump, `npm install` no longer needs `--legacy-peer-deps`. No schema/API/component-API impact. Previous: **Legacy CSS cleanup (Phase I — visual polish program COMPLETE)** (v2.39.1). Frontend-only, pure deletion, no schema/API impact, all component APIs unchanged. **Final phase** of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). Pre-cleanup verification: `grep -rE '["'](inbound-header|inbound-body|inbound-section|order-table-wrap|picker-admin-toolbar|picker-admin-select|picker-admin-btn|picker-admin-row|picker-admin-stats-grid)' src/` returned **zero JSX className consumers** — the only hits were React Query string keys like `'picker-admin-stats'` (cache identifiers, not CSS class names; unaffected by CSS deletion). Changes: (1) **Deleted `frontend/src/styles/legacy.css`** (235 lines covering `.inbound-header-inner` / `.inbound-header-stats` / `.inbound-body` / `.inbound-section-header` + their `@media` responsive overrides, `.order-table-wrap` + nested table selectors, `.picker-admin-toolbar` / `.picker-admin-select` / `.picker-admin-btn-primary` / `.picker-admin-btn-outline` / `.picker-admin-btn-assign` / `.picker-admin-row` / `.picker-admin-stats-grid` + their `@media` overrides). All families were marked `@deprecated` since Phase B (v2.37.1) when they were quarantined into this isolated partial. Migration paths (active replacements) documented in DESIGN_SYSTEM.md Phase B partition map: `.inbound-*` → `.panel-*` (Phase 8 Phase B), `.order-table-wrap` → `.data-table-wrap` (Phase B + Phase C), `.picker-admin-*` → `.btn-*` / `.toolbar-card` / `.styled-select` / `.stats-grid` (Phase C). (2) **Removed `@import './styles/legacy.css'`** from `frontend/src/index.css`. The import order is now: `tokens → reset → layout → components → sales-dashboard → utilities` (6 partials, down from 7). (3) **Visual polish program officially complete** (Phases A → I, 9 versioned ships: v2.37.0 / v2.37.1 / v2.38.0 / v2.38.1 / v2.38.2 / v2.38.3 / v2.38.4 / v2.39.0 / v2.39.1). Cumulative net effect: ~30 inline-style blocks migrated to shared CSS classes across SalesDashboard / SalesEntry / SalesOrders / MarketingReport / ConfirmModal / SlaHistoryModal; +1 new design-token system (`space`/`fontSize`/`tracking`/`gray`/extended-`radius`/extended-`shadow`/extended-`motion`); +1 Inter Variable font swap (body app-wide); +1 prefers-reduced-motion global override; +1 sidebar glow drop + active label brightening + icon hover-shift; +1 row-flash on socket update (PickerAdmin/PackerAdmin staged orders); +1 row-stagger on initial mount (PickerAdmin/PackerAdmin main tables); +1 route fade-up on navigation (AppLayout, scan pages auto-skip); +1 alert slide-in (SlaAlertBanner D4); +1 modal scale-in with backdrop blur (ConfirmModal, SlaHistoryModal, reusable for others); +1 button focus-ring + active-scale system (all `.btn*`); +1 unified input/select 3px primary focus ring; +1 tabular-nums on all numeric surfaces (stat cards, badges, pagination, hero clock); +1 7 ordered CSS partials (was 1 monolithic file); +1 SalesDashboard CSS partial (`sales-dashboard.css`); +1 deferred Inventory/Settings/Archive/Outbound/Reports + 5 modals + PickerAdmin/PackerAdmin toolbar inline-style extractions (these all inherit Phase C primitive polish automatically through `.btn` / `.styled-select` / `.data-table-wrap` / `.modal-*` shared classes and can be migrated incrementally in future phases without a version bump). Saha-doğrulanmış scan-flow timings (2s banner / 3-note beep / 4-pulse vibrate / `lastResolvedIdRef` guard) bitwise-identical to v2.36.2 across the entire 9-phase sweep. Build: `npm run build` green (10.1s). CSS bundle 44.04 kB (Phase H baseline 46.90 kB; **-2.86 kB delta** = the full `legacy.css` payload removed). JS bundle 1610.01 kB (unchanged from Phase H; pure CSS-only cleanup). Memory sync: `DESIGN_SYSTEM.md` Phase H section augmented with the Phase I completion note + program-summary table. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.39.1`. Previous: **Motion sweep (Phase H)** (v2.39.0). Frontend-only, additive, no schema/API impact, all component APIs unchanged. Eighth phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). First phase that introduces **new motion** (not just polishing existing transitions); every new keyframe is neutralized by the global `@media (prefers-reduced-motion: reduce)` rule added in Phase A, so users with the OS-level setting on get zero new animation. Changes: (1) **New CSS classes (`components.css`):** `@keyframes route-fade-in` + `.route-transition` — 200ms opacity 0→1 + translateY 8px→0 with `--ease-standard`. `@keyframes row-enter` + `.row-stagger` parent class + 12 explicit `:nth-child` rules (0/30/60/90/120/150/180/210/240/270/300/330 ms `animation-delay`); rows past the 12th get a 0ms delay so the list still feels coherent if longer than 12. `@keyframes alert-slide-down` + `.alert-slide-in` — `translateY(-100%)→0` + opacity 0→1 with `--duration-slow` (250ms) emphasized ease, for top-of-page banners. (2) **`AppLayout.tsx`:** new internal `PageContent` component uses `useLocation()` from `react-router-dom` and wraps `{children}` in a `<div key={location.pathname} className="route-transition">`. Keying on pathname forces the wrapper to re-mount on route navigation, re-firing the CSS animation; same-pathname navigation (query-param changes only) does NOT re-trigger because React reconciliation keeps the same wrapper. **Scan pages are automatically skipped** — `InboundScan`, `PickerAdminScan`, `PackerAdminScan`, `PickerMobile`, `PackerMobile`, `StockScan`, `ScanLogin` are all mounted directly under `<Route>` without `AppLayout`, so their saha-doğrulanmış scan-flow timing never competes with route motion. (3) **`PickerAdmin.tsx`:** main orders table `<tbody>` (line 1709, NOT the staged-orders list at line 1472) gains `className="row-stagger"`. Real-time socket-added staged rows still use the Phase E `.row-flash` for arrival feedback; the two animations operate on different DOM subtrees with orthogonal effects. (4) **`PackerAdmin.tsx`:** main orders table `<tbody>` (line 1010) gains `className="row-stagger"`. Same staged-orders separation as PickerAdmin. (5) **`SlaAlertBanner.tsx`:** both the single-alert and multi-alert variants gain `className="alert-slide-in"` on their outermost `<div>`. The banner is conditionally rendered (`if (d4Alerts.length === 0) return null`), so the animation only runs when the first D4 alert fires — a clear visual signal that an urgent order needs attention. Dismissing all alerts unmounts the banner; the next alert re-mounts and re-fires the animation. **Dashboard not given row-stagger** because it has only 4–5 stat cards (not a long enough list to benefit from cascade); Dashboard's heavy refactor remains deferred. **Real-time integrity:** CSS animations only run once per element, so React Query refetches that re-use existing DOM nodes do NOT re-trigger the stagger animation. The animation only re-runs if rows are genuinely new DOM nodes (initial mount, filter/sort change, pagination). Operator scan timings JS-driven and untouched. Build: `npm run build` green (12.5s). CSS bundle 46.90 kB (Phase G baseline 45.70 kB; +1.20 kB delta = 3 new keyframes + 14 nth-child rules + `.route-transition` / `.row-stagger` / `.alert-slide-in` classes). JS bundle 1610.01 kB (+0.23 kB; new `PageContent` wrapper + `useLocation` import). Memory sync: `DESIGN_SYSTEM.md` Phase G section augmented with the Phase H motion table + animation guardrails. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.39.0` (MINOR bump since this introduces new app-wide motion behavior). Previous: **Tier 4 operator-scan typography polish (Phase G, single commit)** (v2.38.4). Frontend-only, ultra-surgical, no schema/API impact, all component APIs unchanged, **zero scan-flow JS touched**. Seventh phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). Highest-risk phase per the plan's guardrails — every saha-doğrulanmış operator-critical timer / audio call / haptic call / decode guard is provably untouched (verified by `git diff` filtered grep before commit). Changes: (1) **`ScanLogin.tsx`** (the handheld login screen, no scan-flow critical code): heading `letter-spacing: -0.4px` → `var(--tracking-display)` (-0.03em) for modern-minimal display feel; both `<label>` blocks (Username + Password) `letter-spacing: 0.07em` → `var(--tracking-wide)` (0.04em) for tighter label tracking matching the rest of the app. Inline submit button left as-is (gradient + shadow + scan-station handheld optimized; touching it would risk the mobile login UX). (2) **6 scan-flow pages: single-property letter-spacing swap on the hero/header text only.** `InboundScan.tsx` (line 294), `PickerAdminScan.tsx` (line 310), `PackerAdminScan.tsx` (line 280) — `letter-spacing: '-0.5px'` → `'var(--tracking-display)'` on the `Scan Barcode` / `Scan Next Barcode` / `Processing...` headline text (`fontSize: 22 / fontWeight: 800`). `PickerMobile.tsx` (line 308) + `PackerMobile.tsx` (line 365) — same change, `letter-spacing: '-0.4px'` → `'var(--tracking-display)'` on the `fontSize: 21 / fontWeight: 800` headline. **`StockScan.tsx` not touched** — it has no equivalent hero headline with hard-coded letter-spacing in this style; its existing typography is fine. **Verification (`git diff HEAD` on all 6 scan files, filtered to `^[+-]` lines):** 5 letter-spacing swaps, 0 other property changes, 0 JS lines added/removed/modified. `setTimeout` / `setInterval` / `AudioContext` / `playBeep` / `navigator.vibrate` / `lastResolvedIdRef` / `decodeFromStream` / scan event handlers / API calls all bitwise-identical to Phase F. The saha-doğrulanmış v2.36.2 scan UX (2s success banner / 880→1175→1480 Hz 3-note beep / 250+100+200+100+200 ms success vibrate / 180+100+180+100+180+100+280 ms error vibrate / `lastResolvedIdRef` double-fire guard) remains exactly as field-validated (30 ardışık scan hatasız). Visual diff per scan page: imperceptible to most operators — the headline shifts from `-0.4px / -0.5px` hard-coded tracking to `-0.03em` (which evaluates to `-0.63px` at 21px and `-0.66px` at 22px font sizes) — basically identical but now token-driven so future tracking-scale adjustments propagate. Operators will see literally identical scan flow timing and feedback. (3) **No new CSS classes added in this phase** — all changes use the existing `--tracking-display` token established in Phase A. Build: `npm run build` green (9.7s). CSS bundle 45.70 kB (unchanged from Phase F, no CSS edits). JS bundle 1609.78 kB (Phase F baseline 1609.65; +0.13 kB delta = the longer `'var(--tracking-display)'` string vs `'-0.4px'` / `'-0.5px'` × 5 occurrences). Memory sync: `DESIGN_SYSTEM.md` Phase F section augmented with the Phase G note + scan-page guardrail. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.4`. Previous: **Tier 3 forms/data polish — shared page-hero + preset-btn + filter-card primitives, Sales suite + MarketingReport + SlaHistoryModal migrations (Phase F, single commit)** (v2.38.3). Frontend-only, additive, no schema/API impact, all component APIs unchanged. Sixth phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). **Scope-controlled single commit per user directive** — Inventory pages (`Products`, `Stock`, `Warehouses`, `InventoryItems`), `Reports.tsx`, `Settings.tsx`, `Outbound.tsx`, `Archive.tsx`, and the remaining shared modals (`BulkScanModal` / `QuickScanModal` / `GenerateDirectModal` / `DirectOrderFormModal` / `DayDetailModal`) inherit Phase C primitive polish (button focus rings, input/select focus, table hover, modal animation) **automatically** through the shared `.btn` / `.styled-select` / `.data-table-wrap` / `.modal-*` classes and were intentionally not touched in this commit; their per-file inline-style extraction is deferred to a future phase F.2 if needed. Changes: (1) **New shared primitives in `components.css`:** **`.page-hero`** family — reusable blue-gradient header strip generalized from the Phase-E `.sales-hero`; includes `.page-hero-content`, `.page-hero-label`, `.page-hero-title`, `.page-hero-actions`, `.page-hero-cta` (Phase C button triad: hover bg + shadow, `:focus-visible` ring, `:active scale(0.98)`). **`.preset-btn-group`** + `.preset-btn` + `.preset-btn--active` — pill-shaped toggle buttons for date-range presets, tinted for placement on the gradient hero (white/18% bg when idle, solid white + primary text when active). **`.live-pill`** + `.live-pill-dot` + `@keyframes live-pulse` — green pulsing "LIVE" indicator extracted from the inline `mktPulse` keyframe MarketingReport was carrying. **`.filter-card`** + `.filter-field` + `.filter-field-label` + `.filter-field-input` — grid-laid filter container (different from the flex/chip `.filter-bar`), used by `SalesOrders` and now available for any page with date/select-driven filters. (2) **`sales-dashboard.css` updates:** removed the old `.sales-hero*` block (replaced by the generalized `.page-hero*` in `components.css`). Added `.sales-stat-card--highlight-blue` sibling variant to the existing green `.sales-stat-card--highlight`. Added a new section: `.sales-entry-toolbar` + `.sales-entry-status` + `.sales-entry-progress` (`--done` variant) + `.sales-entry-save` (`--saving` variant) for the SalesEntry top toolbar. Added a generic `.section-card` family — `.section-card`, `.section-card-header` (`--open` variant), `.section-card-header-title`, `.section-card-badge` (`--warn` / `--info` variants), `.section-card-chevron` (`--open` variant rotates 180°), `.section-card-body` — used by SalesEntry's 4 collapsible daily-activity sections. (3) **`SalesDashboard.tsx`:** hero strip swapped from `.sales-hero*` → `.page-hero*`; rest unchanged. (4) **`MarketingReport.tsx`:** the entire range-filter hero strip migrated from a heavy inline-style block (78 lines) to `.page-hero` + `.live-pill` + `.preset-btn-group` + `.preset-btn` classes; the inline `<style>` tag carrying `@keyframes mktPulse` deleted (replaced by `@keyframes live-pulse` in `components.css`). Custom-range date inputs kept their inline styling (they're inverted-on-gradient and don't fit the standard `.filter-field-input` pattern). (5) **`SalesOrders.tsx`:** filters card → `.filter-card` + `.filter-field` + `.filter-field-input`; stat cards → `.sales-stats-grid` + `.sales-stat-card` (Total Sales uses new `--highlight-blue`); empty state → `.empty-state`; table → `.data-table-wrap` (gains hover/focus rings/tabular-nums for free); inline action button factory → `.btn .btn-sm .btn-outline` / `.btn .btn-sm .btn-danger`; channel pill → `.count-badge`. Internal `actionBtnStyle`, `inputStyle`, `Th`/`Td` factories simplified — only `text-align` and `vertical-align` remain inline. (6) **`SalesEntry.tsx`:** top controls toolbar → `.sales-entry-toolbar` + `.filter-field` + `.filter-field-input` + `.sales-entry-status` + `.sales-entry-progress` / `.sales-entry-save` chips; empty "select a store" state → `.empty-state`; `SectionCard` component → `.section-card` family (chevron rotates 180° via `.section-card-chevron--open` instead of inline `transform`). (7) **`SlaHistoryModal.tsx`:** shell migrated to `.modal-backdrop` + `.modal-card` (with `.modal-card--wide` modifier + bespoke `maxWidth: 520` / `maxHeight: 80vh` style overrides for the timeline layout). Close button now uses `.btn .btn-ghost .btn-sm` (gains focus ring + active scale automatically). Header + body internals kept inline because the timeline render is bespoke and not worth a per-element class set. The modal gets the new `backdrop-filter: blur(8px)` and `@keyframes modalCardIn` scale-in animation automatically. **Deferred to a possible Phase F.2 or rolled into Phase G/H:** Inventory pages full migration (Products / Stock / Warehouses / InventoryItems have 37+73+18+15 inline blocks); Settings.tsx (70); Archive.tsx (49); Outbound.tsx (28); MarketingReport.tsx body charts + leaderboard tables (kept their existing inline rendering); Reports.tsx (91); remaining 5 shared modals (`BulkScanModal` / `QuickScanModal` / `GenerateDirectModal` / `DirectOrderFormModal` / `DayDetailModal`) — these all benefit from Phase C inheritance and the `.modal-*` primitives are available when those pages are eventually touched. PickerAdmin/PackerAdmin remaining toolbar inline styles (160+146) still deferred per Phase E note. Operator scan timings (2s banner / 3-note beep / 4-pulse vibrate) JS-driven and untouched. Build: `npm run build` green (11s). CSS bundle 45.70 kB (Phase E baseline 41.36 kB; +4.34 kB delta = new shared primitives + sales-entry classes + section-card family). JS bundle 1609.65 kB (**-4.11 kB**; substantial inline-style cleanup across SalesEntry/SalesOrders/SalesDashboard/MarketingReport/SlaHistoryModal). Memory sync: `DESIGN_SYSTEM.md` Phase E section augmented with the Phase F bullet list + new primitive reference tables. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.3`. Previous: **Tier 2 high-traffic polish — PickerAdmin/PackerAdmin row flash + SalesDashboard CSS extraction (Phase E)** (v2.38.2). Frontend-only, additive, no schema/API impact, all component APIs unchanged. Fifth phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). **Scope-controlled** — full PickerAdmin/PackerAdmin toolbar normalization (those files have 160+146 inline-style blocks) deferred to a later sub-phase to keep regression risk low; SalesEntry/SalesOrders inline extraction + MonthCalendar/DaySummaryCell typography refinement deferred to Phase F. Changes: (1) **New `.row-flash` class + `@keyframes row-flash` (in `components.css`):** 250ms primary-tint background pulse with `--ease-standard`, `forwards` fill-mode so it ends transparent (no layout shift — uses `background-color` only). Applies to any container (table row, staged list item, card). (2) **PickerAdmin row flash on socket update:** new `freshIds: Set<string>` state + `markFresh(id)` helper (adds ID, schedules removal after 350ms — slightly longer than the animation). When the `socket.on('order:staged', ...)` event fires, the newly-arriving handheld scan order gets its ID added to `freshIds`; the staged-orders list row renders with `className="row-flash"` while the ID is fresh. Existing Redis-backed pending-staged drain on mount (`api.get('/picker-admin/pending-staged')`) does NOT trigger the flash — only the real-time socket event does, so the visual signal stays meaningful. (3) **PackerAdmin row flash on socket update:** mirrors PickerAdmin pattern for the `socket.on('order:packer-staged', ...)` event. Same `freshIds` state + `markFresh` helper + conditional `className` on the staged list rows. (4) **New `sales-dashboard.css` partial (`frontend/src/styles/sales-dashboard.css`):** loaded in `index.css` between `components.css` and `utilities.css`. Contains `.sales-hero`, `.sales-hero-label`, `.sales-hero-title`, `.sales-hero-cta` (with `:hover` / `:focus-visible` / `:active scale(0.98)` triad — Phase C button pattern), `.sales-stats-grid`, `.sales-stat-card` + `.sales-stat-card--highlight` (green gradient for Direct Sales), `.sales-stat-card-icon`, `.sales-stat-card-label`, `.sales-stat-card-value`, `.sales-month-chips` + `.sales-month-chips-strong` + `.sales-month-chip` + `.sales-month-chips-loading`. All use design tokens (`--tracking-wide`, `--radius-xl`, `--space-3/4`, `--color-text-*`, `--color-border`, motion tokens). (5) **`SalesDashboard.tsx` migration:** all 13 inline `style={{}}` blocks (hero, stats grid, month chips, internal `StatCard` + `Chip` subcomponents) replaced with the new class names. Removed unused inline style payload, hero CTA gained focus ring + active scale automatically through the new `.sales-hero-cta` class. Page rendered identically; visual diff limited to: (a) `.sales-hero-cta` now responds to keyboard focus and click-press, (b) hero CTA radius aligned to `--radius-lg` (10px, was 10px hardcoded — no change), (c) chips and stat cards now use `--tracking-wide` (0.04em) instead of hardcoded `0.04em/0.06em` (functionally identical). Real-time socket flow on PickerAdmin/PackerAdmin verified by running build + tracing handlers; the `markFresh` call is sequenced AFTER `setStagedOrders` so React batches both state updates in the same render. Operator scan timings (2s banner / 3-note beep / 4-pulse vibrate) JS-driven and untouched. Build: `npm run build` green (13s). CSS bundle 41.36 kB (Phase D baseline 38.86 kB; +2.50 kB delta is the new sales-dashboard.css partial). JS bundle 1613.76 kB (-0.53 kB; SalesDashboard inline-style payload trimmed). Memory sync: `DESIGN_SYSTEM.md` Phase D section augmented with the Phase E bullet list. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.2`. Previous: **Tier 1 showcase polish — Login + Dashboard + Sidebar (Phase D)** (v2.38.1). Frontend-only, additive, no schema/API impact, all component APIs unchanged. Fourth phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). Modest scope; heavy Dashboard component refactor (inline-styled `MetricCard` / `PipelineStage` / Volume Report buttons) deferred to Phase F per the plan's tier sequencing. Changes: (1) **Login card (`.login-card`):** border-radius tightened 16px → `var(--radius-xl)` (12px) — Linear/Vercel use smaller radii on focus surfaces. Card shadow kept bespoke (deeper than `--shadow-lg` because the card sits on a dark gradient and needs contrast). (2) **Login heading (`.login-card-heading h2`):** font-size → `var(--font-size-xl)` (24px, identical value, now token-driven), color → `var(--color-text-primary)`, letter-spacing tightened from `-0.5px` (≈-0.021em) to `var(--tracking-display)` (-0.03em) for modern-minimal display feel. (3) **Login submit (`.shimmer-btn`):** aligned to the Phase C button pattern — hover keeps the deeper shadow only, **no `translateY(-1px)` bounce**; `:active:not(:disabled) { transform: scale(0.98) }` 80ms tactile press; new `:focus-visible` ring stacked over the existing shimmer shadow so keyboard users get the white-on-primary doubled ring without losing the brand glow. Transition tokens swapped to `--duration-base` / `--duration-instant` / `--ease-standard`. (4) **`.stats-grid`:** gap snapped from 14px to `var(--space-4)` (16px) — aligns the dashboard stat-card grid to the 4px scale. Affects Dashboard's Outbound Summary grid + any other consumer. (5) **Dashboard hero clock (`.dashboard-hero-time`):** removed the inline `style={{ fontFamily: font.mono }}` that was forcing SF Mono. Clock now uses the body Inter Variable font with the existing `font-variant-numeric: tabular-nums` — Linear-style cleaner than the mono fallback. `font` import still used by `MetricCard` / `PipelineStage` subcomponents so kept. (6) **`NumberTicker` default duration unchanged at 900ms** — Phase 2 plan suggested aligning to `motion.duration.slow` (250ms), but on review 250ms is jarring for stat-counter tickers (the plan agent assumed a wrong baseline). 900ms is the field-tested value. (7) **Sidebar mobile drawer:** Phase C visual changes carried into Phase D for end-to-end verification across `@media (max-width: 768px)`; CSS unchanged in this phase. Particle bg, hero gradient, Brand block, Welcome banner, all preserved. Operator scan timings JS-driven and untouched. Build: `npm run build` green (16s). CSS bundle 38.86 kB (Phase C baseline 38.62 kB; +0.24 kB delta from shimmer-btn focus rule + comments). JS bundle 1614.29 kB (-0.10 kB; hero clock inline-style payload trimmed). Memory sync: `DESIGN_SYSTEM.md` Phase C section augmented with the Phase D bullet list. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.1`. Previous: **Shared primitives polish (Phase C)** (v2.38.0). Frontend-only, additive, no schema/API contract impact, all component APIs unchanged. Third phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). **First phase with real but restrained visual changes.** Changes: (1) **Buttons (`.btn*`):** dropped `transform: translateY(-1px)` from `.btn-primary` / `.btn-outline` / `.btn-danger-solid` / `.btn-success` hover — modern minimal doesn't bounce; bg-darken + shadow lift handle the affordance. Added `:focus-visible` ring via `var(--shadow-focus-ring)` (white-on-primary doubled, Linear signature). Added `:active:not(:disabled) { transform: scale(0.98) }` 80ms tactile press. Per-variant focus-visible rings for danger/success use semantic colors. (2) **Tables (`.data-table-wrap tbody tr`):** hover bg tightened from `#fafbff` (bluish-white) to `var(--gray-50)` (`#fafafa`, neutral). Added `tr:focus-visible { box-shadow: inset 2px 0 0 var(--color-primary) }` for keyboard row navigation (additive; no row has `tabindex` today). `.row-d2/d3/d4` saha-doğrulanmış tints untouched. (3) **Inputs/Selects:** `.styled-select:focus` and `.filter-bar-input:focus` now use `var(--color-primary)` border + `var(--shadow-focus)` 3px ring (unified across the app). `.styled-select` gains a `:hover` border-strong fade. `.pagination-page-btn` gains `:focus-visible` ring + `font-variant-numeric: tabular-nums`. (4) **Sidebar (`.sidebar-link*` in `layout.css`):** dropped the `box-shadow: 0 0 10px rgba(37,130,235,0.6)` glow on `.sidebar-link--active::before` — Linear/Vercel don't glow; pure 2px accent rail instead (was 3px). Active label and icon color brightened from `#60a5fa` (washed) to `#ffffff`. Hover slides the icon `transform: translateX(2px)` over 150ms — Linear/Vercel micro-shift. (5) **Badges (`.count-badge`):** 12/700 → 11/600 with `--tracking-wide` + `font-variant-numeric: tabular-nums`. Padding bumped 2px→3px vertical to compensate. Colors preserved (`#e0e7ff` bg / `#4f46e5` text). (6) **StatCard typography:** value gains `tabular-nums`; label weight 500→600 with `--tracking-wide`. Colors and sizes preserved. (7) **Pagination info:** `tabular-nums` for "1–30 of N · Page X / Y". (8) **New shared modal primitives:** `.modal-backdrop` (`backdrop-filter: blur(8px)` + `rgba(15,23,42,0.55)` overlay + `modalBackdropIn` 200ms standard ease), `.modal-card` (scales in from `0.96 → 1` in 200ms emphasized ease `cubic-bezier(0.2,0,0,1)`, `--radius-2xl` + `--shadow-lg`), `.modal-card--wide` (640px), `.modal-header--danger/--primary`, `.modal-icon--danger/--primary`, `.modal-title`, `.modal-body`, `.modal-message`, `.modal-detail`, `.modal-footer`. New `@keyframes modalCardIn`. (9) **ConfirmModal migration (`components/shared/ConfirmModal.tsx`):** all heavy inline `style={{}}` blocks replaced with the new `.modal-*` classes; Confirm + Cancel buttons now use the `.btn`/`.btn-ghost`/`.btn-primary`/`.btn-danger-solid` system (gains focus rings + `:active` scale automatically). **Props/API unchanged** (`title`/`message`/`detail`/`confirmLabel`/`cancelLabel`/`tone`/`busy`/`onConfirm`/`onCancel`). Removed unused `colors` import. Other shared modals (`BulkScanModal`, `QuickScanModal`, `GenerateDirectModal`, `SlaHistoryModal`, `DayDetailModal`, `DirectOrderFormModal`) keep their existing inline styles — they migrate per-tier in Phases E/F where the surrounding page is also touched. `.shimmer-btn` (login submit) keeps its `translateY(-1px)` hover — Login is Tier 1 polish in Phase D. Operator scan timings (2s banner / 3-note beep / 4-pulse vibrate) JS-driven and untouched. Build: `npm run build` green; CSS bundle 38.62 kB (Phase B baseline 35.36 kB; +3.26 kB delta covers all new focus rings + modal classes + keyframes); JS bundle 1614.39 kB (-1 kB; ConfirmModal lost its inline-style payload). Memory sync: `DESIGN_SYSTEM.md` gained a "Phase C — Shared Primitives Polish (v2.38.0)" header section + Modal primitives reference. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.38.0`. Previous: **CSS reorganization (Phase B)** (v2.37.1). Frontend-only, additive, no schema/API/visual impact. Second phase of the Linear/Vercel visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`). `frontend/src/index.css` (2139 lines) carved into 6 ordered partials under `frontend/src/styles/`: `tokens.css` (already existed from Phase A), `reset.css` (reset block + `prefers-reduced-motion` override relocated), `layout.css` (`.app-layout`, `.app-content`, `.sidebar*`, `.panel-*`, sidebar chrome `.sidebar-hamburger` / `.header-signout-btn` / `.sidebar-close-btn`, `.sidebar-mobile-overlay`), `components.css` (everything else from the active stylesheet: `.stat-card*`, `.section-*`, `.count-badge`, `.data-table-wrap*`, `.toolbar-card`, `.btn*`, `.styled-select`, `.empty-state*`, `.stats-grid`, `.spinner*`, `.loading-state`, `.feedback-banner*`, `.pagination*`, `.dashboard-hero*`, `.picker-stat-card`, the responsive media-query block, `.login-*`, `.shimmer-btn*`, `.scan-input-row`, `celebrate-*` keyframes, `.beam-wrap*`, `.sortable-th*`, `.filter-bar*`, `.bulk-action-bar*`), `utilities.css` (`.tabular-nums` relocated from `tokens.css`, new `.truncate` + `.sr-only` helpers), `legacy.css` (`.inbound-*`, `.order-table-wrap`, `.picker-admin-*` deprecated families isolated with a removal-candidate header — planned for grep-and-delete in Phase I when zero consumers remain). `index.css` is now 17 lines of `@import` statements in cascade order: `tokens → reset → layout → components → utilities → legacy`. Selector-set diff vs `HEAD` (pre-split): zero removals, zero renames; only additions are the two new utilities (`.truncate`, `.sr-only`) — verified via `diff` of all `^\.[a-zA-Z]` selector starts between HEAD `index.css + tokens.css` and the new 7-file sourceset. Cascade preserved because: (a) deprecated `.inbound-*` / `.order-table-wrap` / `.picker-admin-*` selector names do not overlap any active selector elsewhere, so moving `legacy.css` to the end of the import chain has no observable effect; (b) the responsive `@media` block stays in `components.css` (loaded after `layout.css`), so media-query overrides on `.panel-*` still win over base `.panel-*` styles (cascade is positional within concatenated output). Initially explored adding a `:focus-visible` normalizer to `reset.css` but **reverted** — it would have removed default focus rings from `button`/`a`/`input` keyboard users (accessibility regression); proper per-component focus rings using the `--shadow-focus-ring` token are scheduled for Phase C primitives polish. Build: `npm run build` green; CSS bundle 35.36 kB (Phase A baseline 35.16 kB; +0.20 kB delta is exactly the two new utilities + comment headers in each partial); JS bundle unchanged at 1615.40 kB. Memory sync: `DESIGN_SYSTEM.md` Phase A section augmented with Phase B partition map; `CLAUDE.md` "Mevcut versiyon" bumped to `v2.37.1`. Previous: **Modern-minimal design-system token foundation (Phase A)** (v2.37.0). Frontend-only, additive, no schema or API contract impact. First phase of a Linear/Vercel-inspired visual polish program (plan: `.claude/plans/rustling-splashing-forest.md`, scope = all 25 pages, depth = visual polish only; routes/flows/component-APIs/operator-scan timings untouched). Code: (1) `frontend/src/theme.ts` extended additively — new `space` (4px scale), `fontSize`/`lineHeight`/`tracking`, extended `radius` (`xs`/`2xl`), extended `shadow` (layered `xs/sm/md/lg` + `focus`/`focusRing`), extended `motion` (`duration{instant,fast,base,slow,slower}` + `ease{standard,emphasized,exit}` cubic-beziers), new `colors.gray` 12-step neutral scale (50→950, Linear-flavoured). All legacy keys (`radius.{sm,md,lg,xl,full}`, `shadow.{card,cardHover,btn,xl}`, `font.{xs..xxl}`, `motion.{fast,normal,slow}`, every `colors.*` value) preserved verbatim — zero call-site breakage. `colors.delay*`, `colors.platform`, `colors.priority()` saha-doğrulanmış values explicitly untouched. (2) New `frontend/src/styles/tokens.css` mirrors every token as CSS custom properties on `:root` so non-TSX styles can consume them; includes `.tabular-nums` utility class. `@import`-ed at top of `index.css`. (3) `@fontsource-variable/inter` installed in `frontend` workspace; `main.tsx` imports `@fontsource-variable/inter/wght.css` (covers Latin + Cyrillic + Greek + Vietnamese, weight axis only — one woff2 covers 100–900); `body` font-family in `index.css` updated to lead with `'Inter Variable'` and fall back to the original `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, …` stack. `font-display: swap` (built-in to fontsource) + identical fallback prevents FOUT-induced layout shift. No explicit `<link rel="preload">` in `index.html` because Vite hashes woff2 filenames at build time (verified: build emits `inter-latin-wght-normal-Dx4kXJAl.woff2` 48.26 kB); revisit with `vite-plugin-preload` if Lighthouse CLS regresses. (4) Global `@media (prefers-reduced-motion: reduce)` rule appended to `index.css` neutralises every transition/animation app-wide for users with the OS-level setting on; operator scan audio/haptic feedback is JS-driven (`AudioContext`, `navigator.vibrate`, `setTimeout`) and intentionally NOT affected, so the saha-doğrulanmış 2s banner + 3-note beep + 4-pulse vibrate remain exactly as shipped in v2.36.2. (5) Bundled side-fix: `frontend/src/pages/MarketingReport.tsx` lines 309/321/333 recharts `Tooltip formatter` type was `(v: number) => …`, incompatible with recharts 3.x `Formatter<ValueType, NameType>` (`ValueType | undefined`) — switched to `(v) => …(Number(v))` form so `npm run build` (= `tsc -b && vite build`) is green again. Pre-existing breakage since `28a592a` (April 2026) blocked Phase A from being taggable; included in this commit so the build gate clears. Visual diff: **negligible** — Inter renders nearly identically to the system stack at body text sizes; new tokens have zero consumers yet (Phase A is foundation; Phase C primitives polish will consume them). Memory sync: `DESIGN_SYSTEM.md` gained a "Phase A — Modern Minimal Token Foundation (v2.37.0)" header section listing every new token and the Inter swap. `CLAUDE.md` "Mevcut versiyon" bumped to `v2.37.0`. Previous (not previously docs-synced — see commit history): **v2.36.2 scan UX feedback bundle** (faster banner 7s→2s + louder/longer beep + stronger 4-pulse vibrate, commit `affc515`), **v2.36.1 single-mode scan auto-re-fire fix** (`lastResolvedIdRef` double-fire guard, saha-doğrulandı 30 ardışık scan hatasız, commit `1588486`), **v2.36.0 Stock UX cleanup + product delete cascade** (Stock row Delete removed, Remove-boxes Unit+Qty per box, deleteProduct cascade, commit `0e7bfa8`). Older base: **Label PDF — product name full-render fix (2-shot)** (v2.35.4 → v2.35.5). Pure backend render-side, no schema or API contract impact. Field photo showed thermal stickers printing product names as "Dried Di…" / "Dried Califor…" — `backend/src/services/stockService.ts buildStickerPdf` was ellipsis-truncating names that didn't fit on a single 10pt line in the ~18 mm text strip. **v2.35.4 (initial):** new `fitProductName` helper tries sizes `[10,9,8,7]` pt with 2-line greedy wrap. **Shipped but insufficient:** at 7pt, Helvetica-Bold "California Almonds" measures 64 pt > 51 pt text-W, so the 2-line budget never fit any "Dried California X" name and the fallback re-truncated with ellipsis. **v2.35.5 (success):** extend sizes to `[10,9,8,7,6]` pt + 3-line wrap fallback at 7/6 pt; `greedyWrap(doc, text, maxWidth, maxLines)` helper extracted. Local probe (same PDFKit version + Helvetica-Bold + `widthOfString`) verified the entire realistic cohort before push: `Dried California Almonds` → 6pt 2-line ("Dried California" / "Almonds"); `Premium Organic Walnut Halves` → 6pt 2-line. 3-line at 7pt = 25.2 pt of vertical space; baseline of line 3 = 39.4 pt; qty row at 42.5 pt → ~3 pt clearance, no collision. Ellipsis fallback only for pathological single-word names > 51 pt at 6pt (not seen on real products). Schema unchanged; QR settings (raw UUID payload, EC=M, margin 4, 36 mm canvas) unchanged. Detail: SOLUTIONS.md [2026-05-20] entry. Previous: **Role-aware root route fix** (v2.35.3). Pure frontend, no schema or API contract impact. Long-standing bug surfaced: when a non-admin session (SALES_AGENT, PICKER_ADMIN, PACKER_ADMIN, PICKER, PACKER, STOCK_KEEPER) hit the bare domain `/` with an active cookie, `<ProtectedRoute allowedRoles={[ADMIN, INBOUND_ADMIN]}>` bounced them to `/unauthorized` which renders the "Coming Soon — under construction" `PlaceholderPage`. A user logging in as `agent1` (SALES_AGENT) and going to `https://domwarehouse.com/` saw a 403 dead-end with no obvious recovery path; only `Login.tsx` post-submit redirect knew about `getDefaultRoute(role)`, so a stale-cookie return to `/` skipped that branch entirely. Fix: replaced the `/` route's `<ProtectedRoute>` wrapper with a new `RootRoute` component (`frontend/src/App.tsx:39-56`) that renders `<Dashboard>` for ADMIN/INBOUND_ADMIN as before, and `<Navigate>` redirects every other role to their own home (`/picker-admin`, `/packer-admin`, `/picker`, `/packer`, `/sales`, `/stock/scan`). Unknown roles fall through to `/login`. Admin behavior is byte-identical; the fix is strictly additive for the other six roles. Previous: v2.35.2 console-noise cleanup (partial — see SOLUTIONS.md [2026-05-19] addendum). Older base: **Console-noise cleanup (partial)** (v2.35.2). Pure frontend/infra, no schema or API contract impact. Two changes shipped, one fully successful, one partial — see SOLUTIONS.md [2026-05-19] addendum for the verified post-deploy behavior. (1) ✅ `App.tsx` `BrowserRouter` opted into React Router v7 future flags `v7_startTransition` + `v7_relativeSplatPath` — **both warnings now gone on live**. Splat route is a single `Navigate` (no nested children), so `v7_relativeSplatPath` is a no-op for this app; `v7_startTransition` wraps route transitions in `React.startTransition` — no observable regression. (2) ⚠️ `vite.config.ts` `server.hmr` is now gated by `VITE_DISABLE_HMR` env var; `docker-compose.yml` passes the env var through. On Vultr, `VITE_DISABLE_HMR=true` was added to `.env` and frontend was rebuilt. **However**, verification on live showed `server.hmr: false` only disables the server-side WS handler — Vite still injects `/@vite/client` into every page, which unconditionally tries to open a WebSocket and fails the same way as before. The `wss://domwarehouse.com/?token=…` + `wss://localhost:5173/?token=…` retries persist. The env-gated config is kept in place as a forward-compatible toggle (zero-cost no-op), but the real silence requires moving from Vite **dev mode** to `vite build` + static serve in production. That's tracked as v2.36.0; rationale and scope live in SOLUTIONS.md [2026-05-19] addendum. App behavior unchanged on live — real Socket.io still connects, all panels work; the leftover noise is purely cosmetic. Previous: **Products page filters + pagination** (v2.35.1). Pure frontend, no schema or API contract impact. Products tab now has a top-left **category filter** dropdown (`All categories` default) + **search box** (matches product name, productCode, or category name) side-by-side; the `+ Add Product` button moved right with `marginLeft: auto`. The table is paginated at **30 rows/page** with the same Prev/Next + numbered footer used on Stock. To avoid duplication, the Pagination component + `buildPageList` helper were lifted from `StockSummary.tsx` into a new reusable `components/shared/Pagination.tsx`; both pages import it. Previous: **Stock page UX polish + sidebar submenu visibility** (v2.35.0) — `#` row-number column on Stock, 30 rows/page pagination, prominent SVG chevron pill on the sidebar's Inventory parent, `.sidebar-submenu` container with left guide line + brighter child link styling. Pure frontend change, no schema or API contract impact. Older context: **Inventory thermal-label + scan UX iteration** (v2.33.1 – v2.34.5). All work in this band is application/UI/render-side: no schema or API-contract breakage. Highlights: A4 Avery (10 stickers/sheet) replaced with **thermal label roll 60 × 40 mm, 1 label per page** (v2.33.1). Mobile scan UX rewritten — fullscreen camera overlay, floating top bar with × close + Operation + Warehouse + Single/Bulk mode toggle, gradient bottom strip with result banner or running bulk log + counter (v2.34.2). **Single Scan** keeps the explicit Confirm bottom-sheet introduced in v2.33.5; **Bulk Scan** mirrors `InboundScan`/`PickerAdminScan` — auto-commit each detect with 800 ms debounce, log the result, no per-scan confirmation. **Strict re-IN block** (v2.34.1) — once a label is IN_STOCK or OUT_OF_STOCK, the Stock In op hard-errors and points the operator at Transfer / Stock Out. **Manual stock adjustment** (v2.34.0) — new `POST /stock/adjust` (ADMIN) creates / removes IN_STOCK rows without scanning labels; Stock page Edit modal grew a 3-section layout (Product details · Current per-warehouse breakdown · Adjust stock ADD/REMOVE), batch `ADJ-YYYYMMDD-NNN`, reusing MovementType IN/USED (no schema change). QR generation tuned for the smaller sticker — raw UUID payload (was `{id}` JSON), `errorCorrectionLevel: 'M'`, `margin: 4`, canvas 36 × 36 mm — module size restored from a marginal 0.81 mm to a comfortable 1.09 mm so phone cameras lock on quickly (v2.33.3). PDFKit `lineBreak: false + ellipsis` is unreliable with explicit `(x, y)` in v0.18.0, so a `fitText(doc, str, maxWidth)` helper measures with `doc.widthOfString` and manually truncates to a single line with `…` (v2.33.4). The printed sticker now omits the warehouse-name row entirely — it's in the DB and surfaces in the scan UI on decode — leaving room for product 10pt / qty 12pt / code+batch 7pt (v2.34.2). Vibrate patterns hardened (`[80,60,140]` on detect, `[200,60,80,60,80]` on success, `[100,60,100,60,100]` on error) for Android; iOS Safari still has no Web Vibration support and silently no-ops there (v2.33.6). **Inventory module overhaul** (v2.33.0). Operation-driven scan replaces the implicit IN/USED/TRANSFER state machine: the stock keeper picks **Stock In**, **Stock Out**, or **Stock Transfer** from a dropdown (with a second "to warehouse" picker for Transfer), and the server only validates the chosen transition. QR label generation no longer auto-inflates inventory — `POST /stock/labels` writes new `StockItem` rows in a new **`StockStatus.PENDING`** status, and the first **Stock In** scan flips them to `IN_STOCK`; until then they are invisible to `/stock/summary`, `/stock/stats`, and warehouse counters. Stock page rewritten: 4 KPI cards removed, search input added, Transfer/Used columns replaced with a **Box Quantity** column, hover on the In-Stock cell pops a per-warehouse breakdown tooltip (boxes × quantity per warehouse), and each row gains Edit + Delete actions. Product creation auto-generates `Product ID` as `{CategoryPrefix3}-NNN` (Nuts → NUT-001, …); collisions retry 5×. Native `window.confirm()` removed from every Inventory page in favour of a new `components/shared/ConfirmModal.tsx` (createPortal modal). Scan page rebuilt with operation/warehouse bottom-sheet pickers and an optional "Show raw QR" debug overlay for diagnosing field-side scan failures; the QR parser now accepts either raw UUID or `{id: "<uuid>"}` JSON. Frontend `StockSummaryRow` reshape — `inStockCount`/`transferCount`/`usedCount` replaced with `inStockQuantity`/`boxCount`/`byWarehouse[]`. **PickerAdmin workload performance** finished (v2.32.0 + v2.32.1). v2.32.0 collapsed `getPickerStats` from N+1 (4N+2 Prisma queries) to 6 batched queries with in-memory aggregation, but the workload section was still slow because the `returned` subquery (`statusHistory.some({ fromStatus IN (...), toStatus: PICKER_ASSIGNED })`) hit `OrderStatusHistory` without a covering index — Postgres did a sequential scan. v2.32.1 adds a composite index on `OrderStatusHistory(order_id, from_status, to_status)` (created on the live DB with `CREATE INDEX CONCURRENTLY` first to avoid blocking writes; schema change is then a no-op for `db push`). **Inventory module redesign** shipped (v2.31.0–v2.31.2) + picker badge filter & CD schema-flag fixes (v2.31.3) + PackerAdmin per-packer "Assigned" count (v2.31.4) + Dashboard clock format + PickerAdmin workload prefetch + Nightly report today-only refactor (v2.31.5) + Mobile app plan tracking doc `MOBILE_APP.md` added to project root (v2.31.6 — docs only, no code change). Sidebar gained a parent "Inventory" menu with 4 children: **Product** (admin master data — Category, Product Name, Product ID/code, Default Unit, Reserved threshold), **Inventory** (relocated label generator — Product dropdown, KG/PCS toggle, Quantity, Warehouse dropdown, auto Batch Number `YYYYMMDD-NNN`, Label count), **Warehouse** (warehouse master data with Name + Address), **Stock** (per-product summary table with Transfer / Used / In-Stock counts and Low-Stock badge when in-stock < reserved). New tables: `product_categories`, `products`, `warehouses`. `stock_items` rewritten with FKs (`productId`, `warehouseId`) plus `unit` (KG/PCS), `quantity`, `batchNumber`. `stock_movements.type` enum replaces `MovementDirection` — IN / USED / TRANSFER. Scan state machine in `/stock/scan` (body now requires `{ id, warehouseId }`): same warehouse → USED (out), different warehouse → TRANSFER (warehouse change, status stays IN), OUT_OF_STOCK re-scan → IN (re-stock). `/stock/labels` now creates `count` `StockItem` rows in DB at print time inside a transaction; QR payload is `{ id }`; sticker text shows product name + product code + quantity+unit + warehouse name + batch. New routes `/products` + `/warehouses` (CRUD, ADMIN-only except `GET` which is also STOCK_KEEPER for the scan dropdowns). `/stock/summary` returns per-product aggregates for the Stock page. StockScan UI has a top-of-screen warehouse selector (full-width pill button → bottom sheet) with `localStorage` persist. Sidebar `NavItem` interface gained `children?: NavItem[]` with collapse/expand state. Vite proxy `proxyRoutes` extended with `/products` and `/warehouses`.

Patch v2.31.1 (2026-05-05) — `frontend/vite.config.ts` `allowedHosts` extended with `localhost` and `127.0.0.1`. Vite 5 strict host check was returning 403 on local dev because the prod-only allowlist had stripped these. SOLUTIONS.md [2026-05-05] documents the regression.

Patch v2.31.2 (2026-05-05) — CD pipeline switched from `prisma migrate deploy` to `prisma db push --accept-data-loss --skip-generate`. The auto-generated migration captured only the v2.30.0 → v2.31.0 delta, but live was still v2.29.0 so the migration would have crashed on the first `TRUNCATE` against tables that did not exist. This project uses `db push` for schema sync (per SOLUTIONS.md [2026-04-20]); the migration file was deleted.

Patch v2.31.3 (2026-05-06) — two bundled fixes:
1. **PickerAdmin "↩ Returned" badge filter widening** — `getPickerStats` in `backend/src/services/pickerAdminService.ts` filtered the "returned" history match on `fromStatus = PICKER_COMPLETE` only, but `removeOrder` writes the transition with the order's current status as `fromStatus`. Returns from `PACKER_ASSIGNED` (the most common case — "packer rejected the order") wrote `PACKER_ASSIGNED → PICKER_ASSIGNED` history and were silently invisible to the badge. 7-day prod sample: 12 of 124 returns missed. Filter widened to `fromStatus IN [PICKER_COMPLETE, PACKER_ASSIGNED, PACKER_COMPLETE]` in both occurrences (per-picker `returned` count and tenant `returnedCount`).
2. **CD `--schema` flag** — `.github/workflows/cd.yml` line 86 now passes `--schema=backend/prisma/schema.prisma` to `prisma db push`. Dockerfile's `WORKDIR=/app` (monorepo root) doesn't co-locate the schema, so the previous flagless command exited "Could not find Prisma Schema". The v2.31.2 deploy required a one-off manual `db push` from SSH because of this; v2.31.3 onward auto-syncs.

Patch v2.31.4 (2026-05-06) — PackerAdmin per-packer card now shows an `Assigned` count (active `packerAssignment.completedAt = null` rows whose order is at `PACKER_ASSIGNED` and not archived) alongside the existing `Done Today`. Backend `getPackerStats` returns `{ packer, completed, completedToday, assigned }`; frontend `PackerStatCard` mirrors `PickerStatCard` layout — header "X active · Y packed today", blue Assigned chip, green Done Today chip, two-segment progress bar.

Patch v2.32.1 (2026-05-07) — **`OrderStatusHistory` composite index**. After v2.32.0 shipped, the `/picker-admin/stats` request still hung in `pending` (DevTools network tab). Container verification confirmed the new code was running (`docker exec dom_backend grep -c groupBy /app/backend/dist/services/pickerAdminService.js` returned `2`). The remaining bottleneck was the `returned` `findMany` and tenant-level `returnedCount` queries: both apply `statusHistory.some({ fromStatus IN [PICKER_COMPLETE, PACKER_ASSIGNED, PACKER_COMPLETE], toStatus: PICKER_ASSIGNED })`, which in Postgres becomes an `EXISTS` subquery against `order_status_history`. The table only had PK + FK auto-indexes, so Postgres did a sequential scan over the entire history every time. Fix: composite index `order_status_history(order_id, from_status, to_status)` added via `@@index([orderId, fromStatus, toStatus], map: "order_status_history_order_id_from_status_to_status_idx")`. To avoid blocking live picker/packer scans (which write status history rows on every transition), the index was created **first** on the live database with `CREATE INDEX CONCURRENTLY` from `psql`, then the schema change committed. CD's `prisma db push` sees the index already exists and no-ops, so deploy is also lock-free.

Minor v2.32.0 (2026-05-07) — **PickerAdmin workload performance**. Symptom: opening `/picker-admin` left the "Picker Workload" section empty for ~10 s before per-picker cards rendered. Root cause was `getPickerStats` in `backend/src/services/pickerAdminService.ts:274`: for each active picker it issued 4 parallel Prisma queries (active assignments, lifetime completed count, today completed count, returned count), then 2 tenant-level queries — so with N pickers the request fanned out to **4N+2** queries. The `returned` count was the worst offender: a `statusHistory.some({ fromStatus IN (...), toStatus: PICKER_ASSIGNED })` subquery against `OrderStatusHistory`, which has no composite index on `(order_id, from_status, to_status)`, so Postgres scanned the history table once per picker. Fix: rewrote the function to issue exactly **6 queries regardless of N** — one `findMany` for active assignments (selecting `pickerId`), two `groupBy({ by: ['pickerId'] })` aggregates (lifetime completed, today completed), one `findMany` for the returned set, and the two unchanged tenant-level counts. Per-picker bucketing happens in JS via `Map`. Same response shape and tenant scoping; `returnedCount` and `totalCompleted` queries unchanged. Frontend (`frontend/src/pages/PickerAdmin.tsx:1116`): `staleTime` flipped from `0` to `5_000` and `placeholderData: keepPreviousData` added (with `keepPreviousData` imported from `@tanstack/react-query`), so the workload grid keeps showing the previous frame during background refetches instead of going blank. The 10 s `refetchInterval` is preserved.

Patch v2.31.5 (2026-05-06) — three small UX fixes bundled:
1. **Dashboard clock zero-pad** — `frontend/src/pages/Dashboard.tsx` was calling `toLocaleTimeString` twice (one for hour, one for minute); the minute-only call returned single-digit minutes (`"4"` instead of `"04"`), so the live hero clock rendered `08:4`. Replaced with a single `toLocaleTimeString({ hour: '2-digit', minute: '2-digit', hour12: false })` + `split(':')`.
2. **PickerAdmin workload prefetch** — `PickerStatCard` now prefetches the picker's active orders on `onMouseEnter` / `onFocus` via `queryClient.prefetchQuery` (`staleTime: 5s`). Modal opens with data already in cache instead of waiting for the click-triggered fetch.
3. **Nightly report — today-only** — `backend/src/jobs/nightlyReport.ts` dropped lifetime totals (`inboundTotal`/`outboundTotal`), the yesterday delta badge, and the 7-day sparkline. Replaced with a `scannedToday` count (via `workDate` window) and a simple "Today's Pipeline" progress bar (`dispatchedToday / dailyWorkload`). KPI cards: Scanned Today · Dispatched Today · Still in Pipeline. SLA distribution + top carriers + top performers (all today-scoped) preserved. Subject line dropped the `(+N)` delta.

Previous (v2.30.0, in development) — Stock Control module (warehouse box inventory, fully isolated from order pipeline). New `STOCK_KEEPER` role added to `UserRole` enum. Single-page `/stock` admin dashboard with hardcoded `STOCK_CATEGORIES` list, `productType`/`category`/`weightKg` columns. Lazy-create flow: `POST /stock/labels` returned a PDF of QR codes with embedded JSON (`{id, p, c, w}`); `StockItem` row created on first scan. Replaced by v2.31.0 redesign above.

Previous (v2.29.0, deployed 2026-05-02, merge commit `13fb7c2`) — Packer flow rebuilt: shared queue replaced with per-packer pre-assignment (mirrors picker flow). `OrderStatus.PACKER_ASSIGNED` activated. New `/packer-admin/{assign,bulk-assign,scan,handheld-bulk-scan,pending-staged,unassign}` endpoints; new `/packer-admin-scan` phone page with green theme; PackerAdmin desktop gains Scan & Stage section + per-row PACKER_ASSIGNED badge; PackerMobile shows assigned-only list. Status flow `PICKER_COMPLETE → PACKER_ASSIGNED → PACKER_COMPLETE → OUTBOUND` (auto-dispatch preserved).

---

## 1. Project Overview

**Dynamic Order Management (DOM)** is a warehouse order tracking system designed to manage the full lifecycle of e-commerce orders from arrival (inbound) through picking, packing, and final dispatch (outbound).

### Business Context
- A single warehouse company currently, with architecture ready to support multiple companies (multi-tenant)
- Orders arrive daily from multiple e-commerce platforms: **Shopee**, **Lazada**, **TikTok Shop**, **Direct** (in-house waybills with DR prefix)
- **Timezone:** All timestamps, schedules, and "start of day" calculations are anchored to **Asia/Manila (UTC+8, PHT — no DST)**. The cron jobs use UTC values that map to Manila local time. The frontend displays all dates and times in Manila time regardless of the user's browser timezone.
- Physical waybills are scanned using barcode scanners to enter orders into the system
- 50–100 staff members use the system simultaneously
- Daily volume: ~10,000 orders
- Data retention: minimum 6 months

### Core Workflow
```
07:00  Inbound Admin scans ~1500 waybills (work_date set to today)
        │  SLA 4-hour countdown starts (D0)
        │  [Direct] DR+8-digit tracking generated via "Generate Direct Inbound"
        ▼
  Picker Admin assigns → Picker prepares on handheld
        │
        ▼
  Packer Admin queue (auto) → Packer scans on handheld
        │   ↑ Remove → auto-reassigns back to original picker
        ▼
     Outbound ← SLA countdown ends
        │  [Historical view] Date navigator shows past days' carrier/shop reports
        │
23:30  Archive job runs: all OUTBOUND orders → archived_at set
        │  Active panels show 0 OUTBOUND rows
        │  Incomplete orders carry over to next day (CARRY badge)
        ▼
23:40  Nightly report email + hard-delete of orders > 180 days archived
```

**Carryover:** Orders not completed by end of shift remain active the next day. They are shown with an amber **CARRY** badge in all admin panels so supervisors can prioritize them.

**Daily cycle repeats** — new waybills each morning, incomplete orders carry forward, completed orders archived at 11:00.

### SLA Policy (D0–D4)
Every order must be completed (reach **OUTBOUND**) within **4 hours** of scanning. If it is not, it escalates through delay levels automatically:

| Level | Elapsed Time Since Scan | Priority Boost | Action Required |
|---|---|---|---|
| **D0** | 0–4 hours | +0 | Normal processing |
| **D1** | 4–8 hours | +200 | Prioritize over new orders |
| **D2** | 8–12 hours | +400 | Urgent — team lead attention |
| **D3** | 12–16 hours | +800 | Serious — immediate action |
| **D4** | 16+ hours | +1600 | Critical — supervisor notified by email & live alert |

- D-level escalation runs automatically every **15 minutes** via a background job
- D4 is the maximum — no further escalation, but supervisor is alerted immediately
- D-level is **independent** of status (an order can be D2 while still in PICKING)
- D-level **resets only when the order reaches OUTBOUND**

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                 CLIENTS                                    │
│                                                                            │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────┐ │
│  │  Desktop Browser (React)         │  │  Handheld Device (Android)     │ │
│  │  Admin / Inbound / Picker Admin  │  │  Picker & Packer               │ │
│  │  Packer Admin / Outbound         │  │  + Inbound Admin Scan          │ │
│  │  + HID Barcode Scanner (inbound) │  │  + Picker Admin Scan           │ │
│  │                                  │  │  Chrome browser — HTTPS/LAN    │ │
│  └──────────────────┬───────────────┘  └──────────────┬─────────────────┘ │
└─────────────────────┼────────────────────────────────── ┼──────────────────┘
                      │         HTTPS + WSS               │
┌─────────────────────▼───────────────────────────────────▼──────────────────┐
│                         BACKEND (Node.js + Fastify)                        │
│                                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│  │   Auth API   │  │  Orders API  │  │  Users API   │                    │
│  │  POST /login │  │  GET/POST    │  │  CRUD        │                    │
│  │  POST /logout│  │  /orders/*   │  │  /users/*    │                    │
│  └──────────────┘  └──────────────┘  └──────────────┘                    │
│                                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐    │
│  │ Assign API   │  │ Reports API  │  │  WebSocket (Socket.io)       │    │
│  │ /assign/*    │  │ /reports/*   │  │  tenant:{id} — broadcast     │    │
│  └──────────────┘  └──────────────┘  │  user:{id}  — targeted push  │    │
│                                       └──────────────────────────────┘    │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  BullMQ Job Queue                                                    │ │
│  │  → Archive job 23:30 PHT (15:30 UTC): OUTBOUND orders archived     │ │
│  │  → Nightly 23:40 PHT (15:40 UTC): email + hard-delete expired      │ │
│  │  → SLA sweep every 15 min: D0→D1→D2→D3→D4 escalation                │ │
│  │  → D4 supervisor alert email (triggered by sweep)                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────┬──────────────────────────┬───────────────────────────┘
                      │                          │
           ┌──────────▼──────────┐  ┌────────────▼───────────┐
           │    PostgreSQL 16    │  │         Redis           │
           │                    │  │                         │
           │  orders            │  │  JWT sessions           │
           │  users             │  │  order list cache       │
           │  tenants           │  │  BullMQ job queues      │
           │  assignments       │  │  socket user→room map   │
           │  status_history    │  └─────────────────────────┘
           │  sla_escalations   │
           └────────────────────┘
```

---

## 3. Order Status Lifecycle

```
┌───────────────────────────────────────────────────────────────────────┐
│                      ORDER STATUS FLOW                                │
│                                                                       │
│  [INBOUND]  ← sla_started_at set, delay_level = D0                   │
│      │  Inbound Admin scans waybill                                   │
│      ▼                                                                │
│  [PICKER_ASSIGNED]  ←──────────────────────────────────────────────┐ │
│      │  Picker Admin assigns to a Picker                            │ │
│      ▼                                                              │ │
│  [PICKING]                                                          │ │
│      │  Picker starts preparing the order                           │ │
│      ▼                                                              │ │
│  [PICKER_COMPLETE]                                                  │ │
│      │  Picker marks as complete (on handheld)                      │ │
│      │  Order appears in Packer Admin staging area                  │ │
│      ▼                                                              │ │
│  [PACKER_ASSIGNED]  ←─────────────────────────────────────────────┐ │ │
│      │  Packer Admin assigns to a specific Packer (Scan & Stage)  │ │ │
│      │  Order pushed to assigned packer's handheld queue          │ │ │
│      ▼                                                            │ │ │
│  ─ ─ ─ ─ ─ Packer scans waybill on handheld ─ ─ ─ ─ ─             │ │ │
│  │  Only the assigned packer can complete (race-protected)        │ │ │
│  │  OR: Packer Admin manually completes the assignment            │ │ │
│  │  OR: Packer Admin removes → reverts to PICKER_ASSIGNED ────────┼─┘ │
│  │  OR: Packer Admin unassigns → reverts to PICKER_COMPLETE ──────┘   │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─                              │
│      ▼                                                                │
│  [PACKER_COMPLETE]                                                    │
│      │  Packer completes packing                                      │
│      ▼                                                                │
│  [OUTBOUND]  ← sla_completed_at set, SLA countdown ends              │
│      │  Order dispatched                                              │
│      ▼                                                                │
│    Done                                                               │
└───────────────────────────────────────────────────────────────────────┘
```

> **Note:** `PACKER_ASSIGNED` is active since **v2.29.0** — Packer Admin pre-assigns orders to specific packers (mirroring the picker flow); the assigned packer then scans on their handheld to mark the order PACKER_COMPLETE. `PACKING` remains in the `OrderStatus` enum but is not currently used — the live flow goes `PICKER_COMPLETE → PACKER_ASSIGNED → PACKER_COMPLETE` with no intermediate PACKING state.

> **Important:** The SLA D-level escalates based on wall-clock time since scan — it is **independent of status**. An order can be at D2 while still in PICKING. Status and D-level are two separate dimensions.

### Priority Rules
| Scenario | Priority Change |
|---|---|
| Order scanned | 0 (default) |
| End of day — unassigned carryover | +100 |
| SLA escalates to D1 | +200 |
| SLA escalates to D2 | +400 (delta: +200 from D1) |
| SLA escalates to D3 | +800 (delta: +400 from D2) |
| SLA escalates to D4 | +1600 (delta: +800 from D3) |

Priority boosts are **additive** — a D2 carryover order has priority 500 (100 + 400). Orders are always sorted `priority DESC, created_at ASC`.

---

## 4. Waybill Scanning — Real-World Analysis

> Based on actual waybill analysis from Shopee, Lazada, and TikTok samples (real barcodes decoded).

### What a Barcode Scan Returns

All three platforms encode **only the tracking number** in their barcode/QR code — nothing else:

| Platform | Tracking Number Format | Example | Waybill Type |
|---|---|---|---|
| Shopee | Starts with `PH` | `PH269238346086D` | Text-based (PDF) |
| Lazada | Starts with `P` or `MP` | `P1416JAAX7QAJ`, `MP1455630180` | Image-based (scan) |
| TikTok | Starts with `JT` (J&T Express) | `JT0015937203819` | Text-based (PDF) |

Both barcode (CODE128) and QR code on the same waybill encode **identical data** — just the tracking number.

> **TikTok Note:** TikTok waybills contain a separate "TT Order ID" (e.g. `583406071177971250`) which is TikTok's internal order reference. The system uses the **tracking number** (`JT...`) as the unique key — not the TT Order ID.

### Scanner Hardware

| | Device |
|---|---|
| **Device** | HID Barcode Scanner (Zebra, Honeywell, or equivalent) |
| **Connection** | USB or Bluetooth |
| **Driver required** | None — OS sees it as a USB keyboard |
| **Library** | None needed |
| **Use case** | Main workstation inbound scanning |

> HID scanners emulate a keyboard at the OS level. No SDK, no driver, no special integration — plug in and it works in any browser input field.

### Inbound Entry Flow Per Order

```
Worker pulls trigger on HID scanner
        │
        ▼ (USB / Bluetooth — keyboard emulation)
OS receives keystrokes: "PH269238346086D\n"
        │
        ▼
Focused input field receives the string + Enter (terminator)
        │
        ├── tracking_number = "PH269238346086D"   ← from scan
        ├── platform = "Shopee"                    ← auto-detected from "PH" prefix
        │
        ▼
Order saved → appears in Picker Admin Panel
```

**Total time per order at inbound: ~2 seconds — zero manual input**

> `scanDetect.ts` distinguishes scanner input (keystroke interval < 50ms) from manual typing (> 200ms). The same input field handles both modes — no separate scanner UI needed.

### Platform Auto-Detection Rules

```
Tracking Number Prefix → Platform
─────────────────────────────────
PH...  →  Shopee
JT...  →  TikTok (J&T Express)
MP...  →  Lazada
P...   →  Lazada  (checked last — broadest pattern)
other  →  Unknown / Manual selection
```

> Detection order matters: `JT` and `PH` are checked before `P` to avoid false matches.

### Platform Waybill Comparison (verified from real samples)

| Feature | Shopee | Lazada | TikTok |
|---|---|---|---|
| PDF type | Text-based | Image-based | Text-based |
| Barcode → Tracking # | ✅ `PH...` | ✅ `P...` / `MP...` | ✅ `JT...` |
| QR code | ✅ Same as barcode | ✅ Same as barcode | ✅ Same as barcode |
| Platform logo on waybill | SPX | Flash / Lazada | TikTok Shop + J&T |
| Separate Order ID | ❌ | ❌ | ✅ TT Order ID (not used by system) |
| Product list on waybill | ✅ Packing List | ❌ | ✅ Full product list |
| Item count on waybill | ✅ | ❌ | ✅ Qty Total |
| Weight on waybill | ✅ | ❌ | ✅ |
| Payment type | ✅ COD / NonCOD | ✅ NonCOD | ✅ PP_PM (prepaid) |

> Product list and item count are visible on Shopee and TikTok waybills — workers read these directly from the physical waybill. The system does not record them.

### Fields Intentionally NOT Tracked

| Field | Reason Excluded |
|---|---|
| Store / seller name | Physical waybill shows this — not needed in system; no per-store reporting required |
| Item count | Worker reads from physical waybill; no system verification needed |
| Buyer name & address | Handled by courier — irrelevant to warehouse ops |
| Product names / SKU | Picker handles physical package, not product list |
| Weight | Measured by courier, not warehouse concern |
| COD amount | Accounting system responsibility |
| TikTok TT Order ID | System uses tracking number as unique key — TT Order ID is redundant |

---

## 5. Database Schema

### Entity Relationship Overview

```
tenants ──< users
tenants ──< orders
orders ──< order_status_history
orders ──< picker_assignments >── users (pickers)
orders ──< packer_assignments >── users (packers)
```

> **Design decision:** No separate `stores` table. Shop name is stored as a free-text nullable string on the `orders` table (`shop_name`). Distinct values are queried dynamically for the Bulk Scan dropdown — no additional CRUD UI needed.

### Table Definitions

#### `tenants`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR | Company name |
| slug | VARCHAR UNIQUE | URL-friendly identifier |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

#### `users`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| username | VARCHAR | Unique per tenant |
| password_hash | VARCHAR | bcrypt |
| role | ENUM | See roles below |
| is_active | BOOLEAN | |
| created_by | UUID FK | → users (admin who created) |
| created_at | TIMESTAMPTZ | |

**Role ENUM values:** `ADMIN`, `INBOUND_ADMIN`, `PICKER_ADMIN`, `PACKER_ADMIN`, `PICKER`, `PACKER`, `SALES_AGENT` (v2.23.1), `STOCK_KEEPER` (v2.30.0)

#### `orders`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| tracking_number | VARCHAR | Unique per tenant |
| platform | ENUM | `SHOPEE`, `LAZADA`, `TIKTOK`, `DIRECT`, `OTHER` — auto-detected from tracking number prefix (DR→DIRECT) |
| carrier_name | VARCHAR | Logistics carrier (e.g. `SPX`, `JT_EXPRESS`, `FLASH`, `LEX`, `LBC`, `NINJA_VAN`, `OTHER`). **Required** at Bulk Scan time. |
| shop_name | VARCHAR | Seller shop name (e.g. "Picky_Farm"). **Required** at Bulk Scan time. Chosen from 18 preset shop names or typed manually. |
| status | ENUM | See status flow |
| priority | INTEGER | Higher = more urgent; default 0, carryover +100, SLA boosts added on escalation |
| delay_level | INTEGER | SLA delay level: 0=D0, 1=D1, 2=D2, 3=D3, 4=D4; default 0 |
| sla_started_at | TIMESTAMPTZ | Set on INSERT (when order is scanned); never overwritten |
| sla_completed_at | TIMESTAMPTZ NULLABLE | Set when status → OUTBOUND; null = SLA still active |
| d4_notified_at | TIMESTAMPTZ NULLABLE | Set when D4 supervisor alert is sent; prevents duplicate alerts |
| work_date | TIMESTAMPTZ | Start of the day the order was scanned (set explicitly at scan time, not derived from created_at) |
| archived_at | TIMESTAMPTZ NULLABLE | null = active; non-null = archived. OUTBOUND orders are archived at 23:30 PHT daily. |
| scanned_by | UUID FK | → users (inbound admin) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Status ENUM values:** `INBOUND`, `PICKER_ASSIGNED`, `PICKING`, `PICKER_COMPLETE`, `PACKER_ASSIGNED`, `PACKING`, `PACKER_COMPLETE`, `OUTBOUND`

#### `order_status_history`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| from_status | ENUM NULLABLE | null on first entry |
| to_status | ENUM | |
| changed_by | UUID FK | → users |
| changed_at | TIMESTAMPTZ | |

#### `picker_assignments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| picker_id | UUID FK | → users |
| assigned_by | UUID FK | → users (picker admin) |
| assigned_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ NULLABLE | |

#### `packer_assignments`
| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| packer_id | UUID FK | → users |
| assigned_by | UUID FK | → users (packer admin) |
| assigned_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ NULLABLE | |

#### `sla_escalations`
Append-only audit log of every D-level transition. Never updated or deleted.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| order_id | UUID FK | → orders |
| tenant_id | UUID FK | → tenants (for RLS) |
| from_level | INTEGER NULLABLE | null on initial D0 entry at scan time |
| to_level | INTEGER | 0–4 |
| triggered_at | TIMESTAMPTZ | When escalation occurred |
| trigger_source | VARCHAR | `SCAN` (initial), `JOB` (auto escalation) |

#### Inventory module tables (v2.30.0 – v2.33.0)

> Independent of the order pipeline. Detailed spec in `INVENTORY.md`.

**`product_categories`** — admin-defined categories per tenant. `(tenant_id, name)` unique.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| name | VARCHAR | e.g. "Nuts", "Spices" |
| created_at | TIMESTAMPTZ | |

**`products`** — product master data. `productCode` auto-generated `{CAT3}-NNN` since v2.33.0.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| category_id | UUID FK | → product_categories |
| product_code | VARCHAR | `(tenant_id, product_code)` unique |
| name | VARCHAR | |
| default_unit | ENUM | `KG`, `PCS` |
| reserved_threshold | INT | low-stock trigger threshold |

**`warehouses`** — physical locations. `(tenant_id, name)` unique.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | → tenants |
| name | VARCHAR | |
| address | TEXT | |
| created_at, updated_at | TIMESTAMPTZ | |

**`stock_items`** — one row per printed label / physical box.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | embedded in QR code (raw UUID payload since v2.33.3) |
| tenant_id | UUID FK | → tenants |
| product_id | UUID FK | → products |
| warehouse_id | UUID FK | → warehouses (current location) |
| unit | ENUM | `KG`, `PCS` |
| quantity | NUMERIC | |
| batch_number | VARCHAR | server-generated `YYYYMMDD-NNN` or `ADJ-YYYYMMDD-NNN` (v2.34.0 manual adjustments) |
| status | ENUM | `PENDING` (label printed, not yet scanned), `IN_STOCK`, `OUT_OF_STOCK`. PENDING added v2.33.0 |

**`stock_movements`** — scan event log (append-only).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| stock_item_id | UUID FK | → stock_items (cascade) |
| type | ENUM | `IN`, `USED`, `TRANSFER`. Replaces pre-v2.31.0 `MovementDirection` |
| from_warehouse_id | UUID FK NULLABLE | → warehouses (set on TRANSFER) |
| to_warehouse_id | UUID FK NULLABLE | → warehouses (set on TRANSFER) |
| scanned_by_id | UUID FK | → users |
| scanned_at | TIMESTAMPTZ | |

#### Sales module tables (v2.23.1 — agents-only, not tied to orders)

> Tracks SALES_AGENT daily activities. Detailed spec is in the v2.23.1 patch entry of this doc + `MEMORY.md`. All tables are `tenant_id`-scoped with RLS, same isolation rules as the order tables.

| Table | Purpose |
|---|---|
| `sales_daily_activities` | One row per agent per day — wrapper that owns the child rows for that date |
| `sales_content_posts` | Content posts logged by the agent (Reels, TikTok, Shopee Live thumbnails, etc.); enum `ContentPostType` |
| `sales_live_selling_metrics` | Per-live-session metrics: platform (`SalesPlatform`), viewers, orders count |
| `sales_marketplace_reports` | Shopee/Lazada/TikTok per-day report rows (revenue, orders, returns) |
| `sales_direct_orders` | Direct in-house orders captured by the agent; channel = `SaleChannel` enum |
| `sales_direct_order_items` | Line items for `sales_direct_orders` (product, qty, unit price) |

### Indexes
```sql
-- Active orders unique constraint (partial — archived orders with same TN can co-exist)
CREATE UNIQUE INDEX orders_tenant_tracking_active_unique
  ON orders (tenant_id, tracking_number)
  WHERE archived_at IS NULL;

CREATE INDEX ON orders (tenant_id, status);
CREATE INDEX ON orders (tenant_id, created_at DESC);
CREATE INDEX ON orders (tenant_id, priority DESC, created_at ASC);
CREATE INDEX ON orders (tenant_id, shop_name);   -- GET /orders/shops distinct query
CREATE INDEX ON picker_assignments (picker_id, completed_at);
CREATE INDEX ON packer_assignments (packer_id, completed_at);

-- Daily cycle & archive indexes
CREATE INDEX ON orders (tenant_id, work_date);
CREATE INDEX ON orders (tenant_id, archived_at);
CREATE INDEX ON orders (tenant_id, status, archived_at);  -- all active status queries

-- SLA sweep index: fast scan for escalation-eligible orders (partial — excludes completed orders)
CREATE INDEX ON orders (tenant_id, delay_level, sla_started_at)
  WHERE sla_completed_at IS NULL;

-- SLA dashboard summary
CREATE INDEX ON orders (tenant_id, delay_level)
  WHERE sla_completed_at IS NULL;

-- SLA audit trail
CREATE INDEX ON sla_escalations (order_id);
CREATE INDEX ON sla_escalations (tenant_id, triggered_at DESC);
```

> **Important:** The old `@@unique([tenantId, trackingNumber])` full unique constraint has been replaced by the partial index above. This allows the same tracking number to be re-scanned after the original order is archived (e.g. a redelivery the next day).

---

## 6. User Roles & Permissions

| Panel / Action | Admin | Inbound Admin | Picker Admin | Packer Admin | Picker | Packer |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Main Dashboard** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inbound — view** | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Inbound — scan & add** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Inbound — delete** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Picker Admin Panel** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Inbound Handheld Scan** (`/inbound-scan`) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Picker Admin Handheld Scan** (`/picker-admin-scan`) | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Picker Device View** (handheld) | ❌ | ❌ | ❌ | ❌ | Own only | ❌ |
| **Packer Admin Panel** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Packer Device View** (handheld) | ❌ | ❌ | ❌ | ❌ | ❌ | Own only |
| **Outbound Panel** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **User Management** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Reports (all)** | ✅ | ✅ | Picker only | Packer only | ❌ | ❌ |
| **Archive Panel** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### User Creation Rules
- Only **Admin** can create, edit, or deactivate users
- Admin sets both username and password at creation time
- New users cannot self-register
- Deactivated users cannot log in but their historical data is preserved

### Sales Agent Role (v2.23.1)

`SALES_AGENT` is a **cross-cutting role** — it does **not** participate in the order lifecycle (inbound → picker → packer → outbound). Sales agents track their own daily activities (content posts, live selling, marketplace reports, direct orders) and the admin aggregates these into a `/marketing-report` leaderboard + comparison charts.

| Panel / Action | Admin | Sales Agent |
|---|:---:|:---:|
| **Settings → Sales Agents** (create/disable agents) | ✅ | ❌ |
| **`/sales` — month calendar dashboard** | ❌ | ✅ Own only |
| **`/sales` — Enter Today's Report** (daily activity form) | ❌ | ✅ Own only |
| **`/sales` — day-detail modal** (historical drill-down) | ❌ | ✅ Own only |
| **`/marketing-report` — leaderboard + charts** (Today preset w/ LIVE auto-refresh v2.27.1) | ✅ | ✅ (v2.26.0) |
| **`/marketing-report` — `AgentDetailPanel`** (per-agent drill-down) | ✅ | ✅ (v2.26.0) |
| **Direct order edit + delete** (own orders from My Activity + My Orders; admin edits any via agent day modal — audit-logged, v2.28.0) | ✅ Any agent | ✅ Own only |
| **Any order/inbound/picker/packer panel** | (unchanged) | ❌ |

**Key isolation:** sales agents have zero read/write access to orders, users, or any warehouse data. The role only touches the `sales_*` tables. Marketing report read access (v2.26.0+) exposes other agents' `sales_*` aggregates — every call is logged by `backend/src/middleware/auditLog.ts` (userId, role, tenantId, method, url, ts) via fastify logger.

### Stock Keeper Role (v2.30.0)

`STOCK_KEEPER` is a **cross-cutting role** — it does **not** participate in the order lifecycle. Stock keepers scan QR labels on warehouse boxes (incoming and outgoing) to track inventory. Multiple stock keepers per warehouse; admin creates accounts from Settings → Stock Keepers section.

| Panel / Action | Admin | Stock Keeper |
|---|:---:|:---:|
| **Settings → Stock Keepers** (create/disable keepers) | ✅ | ❌ |
| **`/inventory/products`** (Product + Category master data) | ✅ | ❌ |
| **`/inventory/items`** (generate QR label PDF — was `/stock/create`) | ✅ | ❌ |
| **`/inventory/warehouses`** (Warehouse master data) | ✅ | ❌ |
| **`/inventory/stock`** (per-product summary + low-stock badges) | ✅ | ❌ |
| **`/stock/scan`** (mobile camera scan → IN / USED / TRANSFER state machine) | ✅ | ✅ |
| **`GET /products`, `GET /warehouses`** (read-only for scan dropdowns) | ✅ | ✅ |
| **Any order/inbound/picker/packer/sales panel** | (unchanged) | ❌ |

**Key isolation:** stock keepers can ONLY access `/stock/scan` plus the `GET /products` and `GET /warehouses` lists needed by the warehouse selector. They have zero read/write access to orders, users, sales data, or admin Inventory pages. The Inventory module touches `product_categories`, `products`, `warehouses`, `stock_items`, `stock_movements` tables. Login flow mirrors PICKER/PACKER: `/scan` URL → role-based redirect to `/stock/scan`.

---

## 7. Panels — Detailed Specification

### 7.1 Main Dashboard
**Visible to:** Admin, Inbound Admin

- Live date and time display
- "Dynamic Order Management" logo and branding
- Real-time stats updated via WebSocket:
  - Inbound order count | Outbound order count | Remaining order count
  - **Carryover Active** — orders scanned on a previous day still not completed (amber card)
  - Remaining orders breakdown by department (Picker / Packer)
- **Picker Summary:** Total | Unassigned | Assigned | In Progress | Complete
- **Packer Summary:** Total | Unassigned | Assigned | In Progress | Complete
- **SLA Summary Card:** Live D-level breakdown bar (D0 / D1 / D2 / D3 / D4 counts); D4 count highlighted in red; updates via Socket.io `sla:escalated` event
- **Nightly Report:** Automated email sent at **23:40 PHT** (15:40 UTC) daily to all Admin users

---

### 7.2 Inbound Panel ✅ Built (Phase 2 + Phase 10 + Daily Cycle)
**Visible to:** Admin (edit), Inbound Admin (edit+delete), Picker Admin (view), Packer Admin (view)

**Carryover Section:** Orders scanned on a previous day (`work_date < today`) that are still in INBOUND status appear in a separate "Carryover Orders" section above "Today's Orders", with an amber left-border and clock icon.

**Single Scan Flow:**
1. Worker focuses the scan input field
2. Scans waybill barcode → tracking number auto-filled, platform auto-detected
3. Order saved immediately, appears in table — carrier/shop left null

**Bulk Scan Flow (added Phase 10):**
1. Admin clicks "Bulk Scan" button → `BulkScanModal` opens (rendered via `createPortal`)
2. Admin scans barcodes one by one → staging list builds up (client-side only, no DB writes yet)
   - Duplicate TN in same batch: client-side warning, not re-added
   - Each row shows: index | tracking number | platform badge | remove button
3. Admin selects **Carrier** (required) from dropdown: SPX / J&T / Flash / LEX / LBC / Ninja Van / Other
4. Admin selects or types **Shop Name** (required): dropdown shows 18 preset shop names merged with distinct past values from `GET /orders/shops`; or type a new name manually. Confirm button stays disabled until both Carrier and Shop Name are filled — yellow warning shown if either is missing after items are staged.
5. Admin clicks Confirm → `POST /orders/bulk-scan` → all orders created atomically with carrier + shop
6. Modal closes; success/partial-duplicate banner shown; order table refreshes

**Order Table Columns:** Tracking Number | Platform | Carrier | Shop | Delay (D-badge) | Scan Time | Scanned By | Actions

**Pagination:** 25 orders per page, client-side. Header stats (Total + D0–D4 counts) reflect full dataset regardless of current page.

**Sort order:** priority DESC → delayLevel DESC → createdAt ASC (most urgent first)

**Actions:**
- Inbound Admin / Admin: Delete order button (with confirmation dialog)

**API Endpoints:**
| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/orders/scan` | ADMIN, INBOUND_ADMIN | Single scan — creates one order with carrier + shop |
| `POST` | `/orders/bulk-scan` | ADMIN, INBOUND_ADMIN | Bulk scan — creates up to 200 orders with carrier + shop; returns `{ created, duplicates[] }` |
| `GET` | `/orders/shops` | ADMIN, INBOUND_ADMIN | Returns distinct shop names used so far (for Bulk Scan dropdown) |
| `POST` | `/orders/handheld-scan` | ADMIN, INBOUND_ADMIN | Phone signals desktop (no DB write) — checks duplicate, emits `order:handheld-scan` socket event |
| `POST` | `/orders/handheld-bulk-scan` | ADMIN, INBOUND_ADMIN | Phone sends multiple TNs to desktop (no DB write) — emits `order:handheld-bulk-scan` socket event |

**Handheld Scan Flow (phone → desktop):**

```
Phone (/inbound-scan)                     Desktop (Inbound Panel)
──────────────────                        ───────────────────────
Single Scan mode:
  Camera scans barcode
  → POST /orders/handheld-scan
    (backend checks duplicate)
    → emits order:handheld-scan ────────→ QuickScanModal opens
                                           Admin selects Carrier + Shop
                                           → POST /orders/scan → order saved

Bulk Scan mode:
  Camera scans multiple barcodes
  → accumulate list on phone
  → POST /orders/handheld-bulk-scan
    → emits order:handheld-bulk-scan ──→ BulkScanModal opens (pre-filled)
                                          Admin selects Carrier + Shop
                                          → POST /orders/bulk-scan → orders saved
```

---

### 7.3 Picker Admin Panel ✅ Built (Phase 3 + 4 + 5 + Handheld PIN Management)
**Visible to:** Admin, Picker Admin

**Carryover:** Orders scanned on a previous day (`work_date < today`) are shown with an amber **CARRY** badge in the Inbound table. The section header shows a carryover count next to an amber clock icon so supervisors can prioritize them.

**Header Stats Bar:** Inbound count | Assigned Today | Total Completed | Returned from Packer | Pickers count | Sync indicator

> **Total Completed** stat: count of all picker assignments where `completedAt IS NOT NULL` for the tenant. Decreases when Packer Admin returns an order (the assignment's `completedAt` is reset to null).  
> **Returned from Packer** stat: counts orders currently in PICKER_ASSIGNED status that were returned by Packer Admin (have a status history entry PICKER_COMPLETE → PICKER_ASSIGNED). Picker workload cards show an amber `↩ Returned: N` badge for pickers who have re-assigned orders.

---

#### Scan & Stage Flow (primary assignment method)

The top section of the panel is designed for the real-world scenario where a Picker Admin has a stack of printed waybills and a handheld barcode scanner.

**Flow:**
1. Picker Admin scans a waybill into the Scan Input → system looks up the order by tracking number
2. If found and INBOUND: order is added to the **staging list** (client-side, no DB write yet)
3. Admin scans more waybills one by one — staging list grows
4. Admin selects a Picker from the dropdown
5. Clicks **"Assign N Staged Orders →"** → all staged orders are bulk-assigned in one request
6. Staging list clears; Inbound table updates automatically

**Feedback (inline, no alerts):**
- Success: green message `Staged: <tracking number>`
- Duplicate scan: yellow warning `Already staged: <tracking number>` (not re-added)
- Not found: red error `Order not found`
- Already assigned: yellow warning `Already assigned to <picker username>` — names the active picker so the admin can follow up directly
- Other non-INBOUND status (no active picker): red error `Not available (<status>)`

**Staged orders list:**
- Rows: # | Tracking Number | Platform badge | Delay badge | Priority | × remove button
- Header shows count + "Clear all" button
- Staged rows in the Inbound table get a green tint + **STAGED** pill badge

**Backend endpoint:**
```
POST /picker-admin/scan   { trackingNumber }
  → 200: order data (id, trackingNumber, platform, delayLevel, priority, status, createdAt)
  → 404: Order not found
  → 409: Already assigned to <picker> | Not available (<status>)
```

**Handheld Scan Flow — Picker Admin Phone (`/picker-admin-scan`):**

```
Phone (/picker-admin-scan)                Desktop (Picker Admin Panel)
──────────────────────────                ────────────────────────────
Single Scan mode:
  Camera scans barcode
  → POST /picker-admin/scan
    (validates order is INBOUND)
    → emits order:staged ─────────────→ Order auto-appears in Staging area
                                          Admin selects Picker from dropdown
                                          → Assign Staged Orders

Bulk Scan mode:
  Camera scans multiple barcodes
  → accumulate list on phone
  → POST /picker-admin/handheld-bulk-scan
    (validates each TN)
    → emits order:staged per valid TN → Orders added to Staging area
                                          Admin selects Picker → Assign all
```

```
POST /picker-admin/handheld-bulk-scan   { trackingNumbers: string[] }
  → 200: { results: [{ trackingNumber, status: 'staged'|'not_found'|'error' }] }
```
This endpoint performs a lookup only — it does NOT create orders. Order creation is handled exclusively by the Inbound Panel (`POST /orders/scan`).

---

#### Manual Assignment Flow (secondary, for browsing)

**Picker Select Dropdown:** Shared with Scan & Stage — single picker selection used by both flows.

**Toolbar (below scan area):**
- Select All checkbox + selected count badge
- Assign Selected button (assigns checked rows to selected picker)
- Assign All button (assigns all INBOUND orders to selected picker)

**Inbound Order Table:**
- Columns: Checkbox | # | Tracking Number | Platform (badge) | Delay (D-badge) | Scanned At | Scanned By (avatar) | Priority | Assign button
- Sort: priority DESC → delayLevel DESC → createdAt ASC (D4 always at top)
- Pagination: 10 orders per page, page number buttons, "Showing X–Y of Z" counter
- Row tinting: D2 = amber, D3/D4 = red; selected rows = blue; staged rows = green
- Assign button per row: assigns single order to currently selected picker

---

#### Picker Workload Section

- Grid of picker cards (auto-fill, min 240px per card)
- Each card shows: Avatar + username | active count badge | Assigned / Done status chips | segmented progress bar (blue/green)
- **Click on any card → opens Order Detail Modal**

**Order Detail Modal (per picker):**
- Shows all active orders assigned to that picker (completedAt = null)
- Columns: Tracking Number | Platform | Status chip | Delay | Assigned At | Actions
- Status chips: Assigned (blue) | Done (green)
- Actions per row (shown only for non-complete orders):
  - **Remove** (red) → opens styled Remove Confirmation Dialog → on confirm: order returns to INBOUND queue
  - **Complete** (green) → opens styled Complete Confirmation Dialog → on confirm: order marked PICKER_COMPLETE
- Modal refetches every 3 seconds
- Closes on overlay click or X button

**Complete Confirmation Dialog:**
- Custom styled modal (z-index above order detail modal)
- Green gradient header + checkmark icon
- Shows tracking number in a styled pill
- Cancel / ✓ Yes, Complete buttons

**Remove Confirmation Dialog:**
- Custom styled modal (z-index above order detail modal)
- Red gradient header + trash icon
- Shows tracking number in a styled pill
- Cancel / Yes, Remove buttons

**Seed data:** 20 pickers (Picker 1–20, password: `picker123`) created by seed script. Pickers log in via the standard `/login` page with username + password.

---

### 7.4 Picker Device View ✅ Built
**Visible to:** PICKER role (own orders only)  
**Route:** `/picker` (public — no traditional login required)  
**Target device:** Android/iOS handheld — Chrome browser over WiFi (same LAN as server)  
**Design:** Mobile-first, touch-optimized, no sidebar, dark PIN screen + light order list

**Authentication — Username + Password:**
- Picker opens `http://<server-ip>:5173/login` on the handheld browser (Chrome over WiFi)
- Enters username + password → standard JWT cookie set (same `/auth/login` endpoint as all roles)
- After login, automatically redirected to `/picker` (role-based routing)
- Session persists via JWT cookie — device reopened without re-entering credentials
- Logout button → session cleared → redirected to `/login`

**Connection setup (one-time per device):**
1. IT/admin opens `http://<server-ip>:5173/login` on the handheld browser
2. Save/bookmark as home screen shortcut

**Order list (after PIN auth):**
- Header: picker username + active order count + Logout button
- Order cards: Tracking Number (monospace) | Platform badge | Delay badge | Assigned time
- Left border color: red (D3+), amber (D1–D2), blue (D0)
- List auto-refreshes every 15 seconds

**Waybill scan → complete flow:**
1. Picker picks up physical waybill paper → scans barcode with handheld scanner (USB HID → keyboard)
2. Tracking number appears in scan input → matched against active order list
3. Match found → **Confirm Complete** dialog shown (tracking number + platform + delay displayed)
4. Picker taps **Confirm Complete ✓** → `POST /picker/complete { trackingNumber }` → order removed from list
5. No match → error toast "not found in your assigned orders"

**API endpoints (PICKER role only):**
- `GET /picker/orders` — fetch own active orders (PICKER_ASSIGNED + PICKING statuses)
- `POST /picker/complete { trackingNumber }` — complete order by tracking number scan

---

### 7.5 Packer Admin Panel ✅ Built (Phase 5 + 7 + v2.29.0 packer pre-assignment)
**Visible to:** Admin, Packer Admin  
**Route:** `/packer-admin`

Since **v2.29.0** the panel mirrors the Picker Admin pattern: Packer Admin **explicitly assigns** PICKER_COMPLETE orders to specific packers (Scan & Stage section), and only the assigned packer can scan to complete on their handheld. The shared-queue model was replaced — `PACKER_ASSIGNED` is now an active status in the order lifecycle.

**Carryover:** Orders from a previous day (`work_date < today`) appear with an amber **CARRY** badge in the order table. The section header shows a carryover count with an amber clock icon.

**Header Stats Bar:** Waiting to Pack (PICKER_COMPLETE, unassigned) | Assigned (PACKER_ASSIGNED, all packers) | Total Packed | Returned to Picker | Packers count | Sync indicator

> **Returned to Picker** stat: counts orders currently back in PICKER_ASSIGNED state (returned by packer admin via Remove). Updates every 5 seconds.

---

#### Scan & Stage Flow (primary assignment method, v2.29.0)

Mirrors PickerAdmin's Scan & Stage. The top section of the panel is designed for a Packer Admin with a stack of printed waybills (already pick-completed) and a handheld barcode scanner.

**Flow:**
1. Packer Admin scans a waybill → system looks up the order by tracking number
2. If found and PICKER_COMPLETE: order is added to the **staging list** (client-side, no DB write yet)
3. Admin scans more waybills one by one — staging list grows
4. Admin selects a Packer from the dropdown
5. Clicks **"Assign N Staged Orders →"** → all staged orders bulk-assigned to that packer in one request (status flips PICKER_COMPLETE → PACKER_ASSIGNED)
6. Staging list clears; order table updates automatically

**Handheld Scan Flow — Packer Admin Phone (`/packer-admin-scan`):**

```
Phone (/packer-admin-scan)                Desktop (Packer Admin Panel)
──────────────────────────                ────────────────────────────
Single Scan mode:
  Camera scans barcode
  → POST /packer-admin/scan
    (validates order is PICKER_COMPLETE)
    → emits order:staged ─────────────→ Order auto-appears in Staging area
                                          Admin selects Packer from dropdown
                                          → Assign Staged Orders

Bulk Scan mode:
  Camera scans multiple barcodes
  → accumulate list on phone
  → POST /packer-admin/handheld-bulk-scan
    → emits order:staged per valid TN → Orders added to Staging area
                                          Admin selects Packer → Assign all
```

---

#### Order Queue (below Scan & Stage)

**Tracking Number Search:**
- Input above the order table — type partial or full tracking number to filter the list in real time
- Background turns amber while active; shows match count
- Cleared automatically after a successful Complete or Remove action

**Order Table:**
- Source: PICKER_COMPLETE (waiting) + PACKER_ASSIGNED (staged to a packer); each row carries a PACKER_ASSIGNED badge with the assigned packer name when applicable
- Columns: Checkbox | # | Tracking Number | Platform | Delay | Picked By (avatar) | Arrived At | Status badge (PICKER_COMPLETE / PACKER_ASSIGNED → name) | Priority | Actions
- Sort: priority DESC → delayLevel DESC → createdAt ASC
- Pagination: 10 per page, resets on search
- Row tinting: D2 = amber, D3/D4 = red; selected = blue; staged = green tint + STAGED pill

**Actions per row:**
- **Complete** → green confirmation dialog → `POST /packer-admin/complete` → order → PACKER_COMPLETE (works whether the row is PICKER_COMPLETE or PACKER_ASSIGNED)
- **Remove** → red confirmation dialog → `POST /packer-admin/remove` → order back to PICKER_ASSIGNED (auto-reassigned to original picker); falls back to INBOUND if no previous picker
- **Unassign** (only for PACKER_ASSIGNED rows) → `POST /packer-admin/unassign` → clears PackerAssignment, status reverts to PICKER_COMPLETE so a different packer can be staged

**Remove behavior (important):**
When admin removes an order, the backend:
1. Finds the most recent completed PickerAssignment for the order
2. Resets that assignment's `completedAt` → `null` (no new assignment created)
3. Sets order status → PICKER_ASSIGNED
4. Logs the transition in orderStatusHistory (fromStatus is the order's current status — PICKER_COMPLETE, PACKER_ASSIGNED, or PACKER_COMPLETE)

Side effects of step 2:
- Picker's "Total Completed" count decreases (assignment is no longer counted as done)
- The same assignment becomes active again → order reappears on the picker's handheld within 15 seconds
- No duplicate assignments — one clean active assignment per order per picker
- Falls back to INBOUND (no assignment reset) if the order had no previous picker

**Backend endpoints:**
```
POST /packer-admin/scan { trackingNumber }                  → staging lookup
POST /packer-admin/handheld-bulk-scan { trackingNumbers[] } → bulk staging lookup
GET  /packer-admin/pending-staged                           → currently staged-but-not-yet-assigned
POST /packer-admin/assign     { orderId, packerId }         → PICKER_COMPLETE → PACKER_ASSIGNED
POST /packer-admin/bulk-assign{ orderIds[], packerId }      → bulk assign
POST /packer-admin/unassign   { orderId }                   → PACKER_ASSIGNED → PICKER_COMPLETE
GET  /packer-admin/orders                                   → PICKER_COMPLETE + PACKER_ASSIGNED (sorted)
GET  /packer-admin/stats                                    → { stats[], totalCompleted, returnedCount }
POST /packer-admin/complete { orderId }                     → PACKER_COMPLETE
POST /packer-admin/remove   { orderId }                     → PICKER_ASSIGNED (auto-reassign) or INBOUND
```

---

#### Packer Workload Section (bottom, v2.31.4)

- Grid of packer cards (auto-fill, min 220px) — mirrors PickerStatCard layout
- Each card: Avatar | username | header "X active · Y packed today" | blue **Assigned** chip + green **Done Today** chip | two-segment progress bar
- **Click card → Order Detail Modal:** table of that packer's active assignments + completed orders
- **Backend endpoints:**
```
GET  /packer-admin/packers                         → active PACKER users
GET  /packer-admin/packer/:packerId/orders         → packer's active + completed orders (last 50)
```

---

### 7.6 Packer Device View ✅ Built (Phase 7)
**Visible to:** PACKER role  
**Route:** `/packer` (public — PIN auth, no traditional login)  
**Target device:** Android handheld — same hardware as Picker Device View  
**Design:** Mobile-first, green/teal theme (vs blue for picker)

**Authentication — Username + Password:**
- Packer opens `http://<server-ip>:5173/login` on the handheld browser (Chrome over WiFi)
- Enters username + password → standard JWT cookie set (same `/auth/login` endpoint as all roles)
- After login, automatically redirected to `/packer` (role-based routing)
- Session persists via JWT cookie — device reopened without re-entering credentials

**Order queue (per-packer assigned list, v2.29.0):**
- Orders in **PACKER_ASSIGNED** status assigned to this specific packer (`PackerAssignment.completedAt IS NULL` + order in PACKER_ASSIGNED). Replaces the pre-v2.29.0 shared queue.
- Auto-refreshes every 15 seconds
- List sorted by priority DESC → delayLevel DESC → createdAt ASC
- Left border color: red (D3+), amber (D1–D2), blue (D0)
- Empty state if Packer Admin hasn't staged any orders to this packer yet

**Waybill scan → complete flow:**
1. Packer picks up physical package → scans waybill barcode
2. Tracking number matched against this packer's own PACKER_ASSIGNED list
3. Match found → **Confirm Complete** bottom sheet slides up (tracking + platform + delay)
4. Packer taps **Confirm ✓** → `POST /packer/complete { trackingNumber }` → PACKER_COMPLETE; assignment `completedAt` set
5. Order disappears from this packer's list within 15 seconds
6. No match → "not found in your assigned orders" (the order may belong to a different packer or hasn't been assigned yet)

**API endpoints (PACKER role only):**
- `GET /packer/orders` — orders in PACKER_ASSIGNED state assigned to this packer
- `POST /packer/complete { trackingNumber }` — complete by tracking number scan

---

### 7.7 Outbound Panel ✅ Built (Phase 8)
**Visible to:** Admin, Inbound Admin  
**Route:** `/outbound`

Orders reach the Outbound Panel automatically when a packer marks them `PACKER_COMPLETE`. An Admin or Inbound Admin then dispatches them to `OUTBOUND`, which sets `sla_completed_at` and stops the SLA countdown.

#### Header Stats
| Card | Value | Color |
|---|---|---|
| Waiting to Dispatch | PACKER_COMPLETE order count | Sky blue |
| Dispatched Today | OUTBOUND orders with `slaCompletedAt ≥ today` | Green |
| D4 Orders | non-OUTBOUND orders with `delayLevel = 4` | Red |
| Missing | Total inbound − Total outbound | Amber |

#### Ready to Dispatch Table
- Lists all `PACKER_COMPLETE` orders sorted by `delayLevel DESC` → `createdAt ASC`
- Columns: Tracking Number · Platform · Packed By · Waiting Since · D-badge · Dispatch button
- **Search bar** — client-side filter on tracking number; clears after dispatch action
- **Checkbox selection** — select individual or all filtered orders
- **Dispatch** (single): confirm dialog → `POST /outbound/dispatch` → `PACKER_COMPLETE → OUTBOUND`, `slaCompletedAt = NOW()`
- **Dispatch Selected** (bulk): `POST /outbound/bulk-dispatch` → returns `{ dispatched, skipped }`
- Pagination: 10 orders/page; resets on search change and after dispatch

#### Comparison Report
Three stat tiles below the dispatch table:
- **Total Inbound** — all orders ever scanned for this tenant
- **Total Dispatched** — all OUTBOUND orders
- **Still in Pipeline** — Total Inbound − Total Dispatched (should approach 0 at end of day)

#### Stuck Orders Table
Lists every order **not yet at OUTBOUND** (INBOUND → PACKER_COMPLETE range).  
Sorted by `delayLevel DESC` then `slaStartedAt ASC` — most urgent at top.  
Columns: Tracking Number · Platform · Current Status (colored pill) · D-badge · Time in Status · In Pipeline Since  
Refetch: 10 s (less frequent than dispatch queue's 5 s).

#### Status Pill Colors
| Status | Background | Text |
|---|---|---|
| INBOUND | `#e5e7eb` | `#374151` |
| PICKER_ASSIGNED | `#dbeafe` | `#1d4ed8` |
| PICKING | `#e0e7ff` | `#4338ca` |
| PICKER_COMPLETE | `#ede9fe` | `#6d28d9` |
| PACKER_COMPLETE | `#ccfbf1` | `#0f766e` |

---

### 7.8 Archive Panel ✅ Built (v2.2.0)
**Visible to:** Admin only  
**Route:** `/archive`

The Archive Panel gives admins full visibility into soft-archived orders and control over the end-of-day archive cycle and long-term data retention.

#### Header Stats Bar
| Card | Value | Color |
|---|---|---|
| Total Archived | All orders with `archived_at IS NOT NULL` | Primary blue |
| Expiring in 30d | Archived orders whose `archived_at + 180 days <= now + 30 days` | Amber |
| Expiring in 7d | Archived orders whose `archived_at + 180 days <= now + 7 days` | Red |

**"Archive OUTBOUND Now" button** — appears alongside the stat cards. Opens a confirmation dialog: *"This will archive all currently OUTBOUND orders for your tenant. This normally runs automatically at 11:30 PM (Manila time). Proceed?"* On confirm: calls `POST /archive/trigger`.

#### Filter Bar
| Filter | Type | Behavior |
|---|---|---|
| Tracking number search | Text input | Partial match on `tracking_number` |
| Platform | Dropdown | SHOPEE / LAZADA / TIKTOK / DIRECT / OTHER |
| Archived date range | Two date pickers (From / To) | Filters `archived_at` |
| Expiring within | Dropdown (7d / 14d / 30d / 60d) | Shows orders expiring in ≤ N days |

A **"Clear filters"** button appears when any filter is active.

#### Archived Orders Table
**Columns:** # | Checkbox | Tracking Number | Platform | Carrier | Shop | Work Date | Archived At | Expires In (badge)

**Expires In badge** color coding:
- **Green** — more than 30 days remaining
- **Amber** — 7–30 days remaining
- **Red** — fewer than 7 days remaining

**Pagination:** 25 orders per page.

#### Bulk Delete
- Checkbox per row + "select all" header checkbox
- **"Delete Selected (N)"** danger button appears when any rows are checked
- Opens `ConfirmDialog` (variant: danger): *"You are about to permanently delete N archived orders. This action cannot be undone. All history records will also be deleted. Are you sure?"*
- On confirm: `POST /archive/bulk-delete` — hard-deletes orders and all child table records (assignments, status history, SLA escalations) for the selected IDs

#### Archive API Endpoints
| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/archive` | ADMIN | Paginated archive list. Query: `page`, `pageSize`, `search`, `platform`, `dateFrom`, `dateTo`, `expiresWithin` |
| `GET` | `/archive/stats` | ADMIN | Summary: `{ total, expiring30, expiring7 }` |
| `POST` | `/archive/trigger` | ADMIN | Immediately archives all OUTBOUND orders for the caller's tenant; also enqueues background job |
| `POST` | `/archive/bulk-delete` | ADMIN | Body: `{ orderIds: string[] }`. Hard-deletes with cascade. Admin confirmation required in UI before calling. |

#### Archive Job
- **Queue:** `archiveOutbound` (BullMQ)
- **Schedule:** `'30 23 * * *', tz: 'Asia/Manila'` — every day at **23:30 PHT** (11:30 PM Manila time, 15:30 UTC). Single source of truth: `backend/src/index.ts:158`. SOLUTIONS.md [2026-04-18] / [2026-04-17] document the earlier mis-cron clean-up.
- **Action:** Sets `archived_at = NOW()` on all `status=OUTBOUND, archived_at IS NULL` orders (all tenants)
- **Manual trigger:** `POST /archive/trigger` → calls archive synchronously for the requester's tenant, then enqueues for background processing

#### Retention (6-Month Policy)
- **Hard-delete job** piggybacks on `nightlyReport` at **23:40 PHT (15:40 UTC)** — 11:40 PM Manila time, ~10 minutes after the archive job above
- Deletes orders where `archived_at <= NOW() - 180 days`
- Cascade-deletes all child records (`picker_assignments`, `packer_assignments`, `order_status_history`, `sla_escalations`)
- Per-tenant, per-order error catch — one failure does not abort the sweep

---

### 7.9 Inventory Module ✅ Operation-driven scan (v2.33.0)
**Visible to:** Admin (full); Stock Keeper (scan-only + read-only product/warehouse lookups)
**Sidebar:** parent "Inventory" with 4 children — **Product**, **Inventory**, **Warehouse**, **Stock**.
**Routes:** `/inventory/products`, `/inventory/items`, `/inventory/warehouses`, `/inventory/stock` (all admin); `/stock/scan` (admin + stock keeper mobile camera).

Independent inventory module for warehouse boxes. **Not connected to the order pipeline** — no shared tables, no shared queries, no shared queues.

#### Data model

| Table | Purpose | Key fields |
|---|---|---|
| `product_categories` | Admin-defined categories per tenant | `tenantId`, `name` (`@@unique [tenantId, name]`) |
| `products` | Product master data | `tenantId`, `categoryId`, `productCode` (auto `{CAT3}-NNN` when admin omits it), `name`, `defaultUnit` (KG/PCS), `reservedThreshold` |
| `warehouses` | Physical locations | `tenantId`, `name`, `address` (`@@unique [tenantId, name]`) |
| `stock_items` | One row per printed label / physical box | `productId` (FK), `warehouseId` (FK, current location), `unit`, `quantity`, `batchNumber`, `status` (`PENDING` / `IN_STOCK` / `OUT_OF_STOCK`) |
| `stock_movements` | Scan event log | `type` (IN / USED / TRANSFER), `fromWarehouseId?`, `toWarehouseId?`, `scannedById`, `scannedAt` |

Enums: `StockStatus { PENDING, IN_STOCK, OUT_OF_STOCK }` (PENDING added v2.33.0), `StockUnit { KG, PCS }`, `MovementType { IN, USED, TRANSFER }`.

#### Auto Product ID (v2.33.0)

The Products form no longer takes a `productCode` from the admin. `productService.createProduct` computes the next `{CategoryPrefix3}-NNN` per tenant — prefix is the uppercased first 3 ASCII alpha chars of the category name (padded with `X` if shorter, `PRD` fallback if zero letters), and NNN is the next free 3-digit sequence within that prefix. The route accepts an explicit `productCode` (kept for migrations / scripts), but the UI never sends one. Inserts collide-retry up to 5× on `P2002` before surfacing the error.

#### Scan state machine (POST `/stock/scan`, prefix `/stock`)

Body is now operation-driven: `{ id, operation: 'IN' | 'OUT' | 'TRANSFER', warehouseId, toWarehouseId? }`. The QR payload encodes `{ id }` (or a raw UUID — the parser accepts both). The state machine in `stockService.scanItem`:

| Operation | Existing item state | Action | Movement type | Error case |
|---|---|---|---|---|
| `IN` | `PENDING` or `OUT_OF_STOCK` | flip to `IN_STOCK`, set `warehouseId` | `IN` | `IN_STOCK` → "Already in stock at {warehouse}" |
| `OUT` | `IN_STOCK` | flip to `OUT_OF_STOCK` | `USED` | non-`IN_STOCK` → "Item is not in stock — cannot mark as out" |
| `TRANSFER` | `IN_STOCK` and `warehouseId !== toWarehouseId` | update `warehouseId` to `toWarehouseId` | `TRANSFER` | non-`IN_STOCK` or same warehouse → explicit error |

Result banner colors: IN → green, USED → red, TRANSFER → blue. Camera resumes 1.5s after each scan. A "Show raw QR (debug)" toggle on the start screen displays the most recent decoded text inside the camera frame — used to diagnose field-side scan failures.

#### Pre-created labels (POST `/stock/labels`) — PENDING flow (v2.33.0)

`POST /stock/labels` creates `count` `StockItem` rows in a single transaction with `status = 'PENDING'`. These rows are invisible to `/stock/summary`, `/stock/stats`, and the warehouse hover breakdown — they only contribute to inventory after a stock keeper scans each QR with the **Stock In** operation, which flips the row to `IN_STOCK` and writes an `IN` movement. Body: `{ productId, warehouseId, unit, quantity, count }`. Server generates a per-day batch number `YYYYMMDD-NNN`. PDF QR encodes `{ id }`; the printed sticker shows product name, product code, quantity+unit, destination warehouse name, batch, and a short id suffix. Avery L7173 / J8173 layout (10 per A4 sheet) preserved.

#### Sidebar — parent/child nav

`frontend/src/components/shared/Sidebar.tsx` `NavItem` interface gained `children?: NavItem[]`. Parent items render as a button (not NavLink) that toggles `expanded[path]`; children render as indented `NavLink`s when expanded. Parent auto-expands when `location.pathname.startsWith(parent.path)`. Currently only Inventory has children — pattern is reusable for future parent menus.

#### Per-product Stock Summary (`/inventory/stock`) — rewritten (v2.33.0)

Calls `GET /stock/summary` which returns one row per product:

```ts
{
  productId, productCode, productName, categoryId, categoryName, defaultUnit,
  reservedThreshold,
  inStockQuantity: number,          // sum(stock_items.quantity) where status=IN_STOCK
  boxCount: number,                 // count of IN_STOCK rows
  byWarehouse: Array<{
    warehouseId, warehouseName,
    boxes: number, quantity: number,
  }>,                               // per-warehouse breakdown (for hover tooltip)
  lowStock: boolean,                // inStockQuantity < reservedThreshold
}
```

PENDING and OUT_OF_STOCK rows are excluded from every aggregate above. Frontend (`pages/inventory/StockSummary.tsx`) renders a single toolbar (search input + categories dropdown + Low-stock-only toggle) above the table — the v2.31.0 KPI strip was removed. Columns: Category · Product · Product ID · In Stock (qty + unit) · Box Quantity · Reserved · Status · Actions. Hovering the In-Stock cell pops a dark tooltip with the `byWarehouse` breakdown (`Main WH · 3 box · 15 kg`). Actions: Edit (createPortal modal — kategori/name/unit/reserved alanları, Product ID immutable) + Delete (`ConfirmModal`).

#### API endpoints

`backend/src/routes/products.ts` (prefix `/products`):

| Method | Path | Body | Roles |
|---|---|---|---|
| GET | `/categories` | — | ADMIN, STOCK_KEEPER |
| POST | `/categories` | `{ name }` | ADMIN |
| DELETE | `/categories/:id` | — | ADMIN (409 if referenced) |
| GET | `/` | `?categoryId` | ADMIN, STOCK_KEEPER |
| POST | `/` | `{ categoryId, name, defaultUnit, reservedThreshold, productCode? }` — `productCode` auto-generated `{CAT3}-NNN` if omitted | ADMIN |
| PUT | `/:id` | (partial body) | ADMIN |
| DELETE | `/:id` | — | ADMIN (409 if has stock items) |

`backend/src/routes/warehouses.ts` (prefix `/warehouses`):

| Method | Path | Body | Roles |
|---|---|---|---|
| GET | `/` | — | ADMIN, STOCK_KEEPER |
| POST | `/` | `{ name, address }` | ADMIN |
| PUT | `/:id` | (partial) | ADMIN |
| DELETE | `/:id` | — | ADMIN (409 if has stock items) |

`backend/src/routes/stock.ts` (prefix `/stock`):

| Method | Path | Body | Roles | Notes |
|---|---|---|---|---|
| POST | `/labels` | `{ productId, warehouseId, unit, quantity, count }` | ADMIN | Creates `count` StockItems in `PENDING` status + returns PDF. Headers: `X-Labels-Generated`, `X-Batch-Number` |
| GET | `/items` | `?status&productId&warehouseId` | ADMIN | Includes product+warehouse relations; `status` accepts `PENDING`/`IN_STOCK`/`OUT_OF_STOCK` |
| POST | `/scan` | `{ id, operation: 'IN'\|'OUT'\|'TRANSFER', warehouseId, toWarehouseId? }` | ADMIN, STOCK_KEEPER | Operation-driven state machine above |
| DELETE | `/items/:id` | — | ADMIN | UUID validation; cascades movements |
| GET | `/movements` | `?limit&offset` | ADMIN | Joins fromWarehouse/toWarehouse/scannedBy |
| GET | `/stats` | — | ADMIN | KPI numbers (only IN_STOCK rows counted — PENDING excluded) |
| GET | `/summary` | — | ADMIN | Per-product aggregate with `byWarehouse` breakdown (only IN_STOCK rows; PENDING excluded) |

#### Vite proxy requirement

`frontend/vite.config.ts` `proxyRoutes` extended with `/products` and `/warehouses` in addition to the existing `/stock` (per SOLUTIONS.md [2026-05-02]). Any new top-level prefix not in this list is served by Vite's SPA fallback and returns 200 HTML for GET / 404 for POST — silent failure mode.

---

## 8. Frontend Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Login.tsx              ← username/password login; role-aware redirect via getDefaultRoute
│   │   ├── ScanLogin.tsx          ← /scan — handheld URL entry; redirects each role to their own scan/list page
│   │   ├── Dashboard.tsx          ← / for ADMIN/INBOUND_ADMIN (Phase 11) — pipeline KPIs + SLA summary
│   │   ├── Inbound.tsx            ← /dashboard — Phase 2 (Single + Bulk scan modal, pagination 25/page)
│   │   ├── InboundScan.tsx        ← /inbound-scan — phase 10b handheld camera scan, single + bulk modes
│   │   ├── PickerAdmin.tsx        ← /picker-admin — Phase 3+4 + scan+stage + workload cards
│   │   ├── PickerAdminScan.tsx    ← /picker-admin-scan — phone scan station (relays via socket)
│   │   ├── PickerMobile.tsx       ← /picker — login + own PICKER_ASSIGNED orders + scan complete
│   │   ├── PackerAdmin.tsx        ← /packer-admin — v2.29.0 scan & stage + per-packer assignment + workload
│   │   ├── PackerAdminScan.tsx    ← /packer-admin-scan — v2.29.0 phone scan station (green theme)
│   │   ├── PackerMobile.tsx       ← /packer — v2.29.0 own PACKER_ASSIGNED list + scan complete (green theme)
│   │   ├── Outbound.tsx           ← /outbound — Phase 8 (dispatch queue, comparison report, stuck orders)
│   │   ├── Archive.tsx            ← /archive — v2.2.0 (stats, filters, expiry badges, bulk delete, manual trigger)
│   │   ├── Reports.tsx            ← /reports — 4 tabs: Live Performance, Performance, SLA Analytics, Order Timeline
│   │   ├── Settings.tsx           ← admin user management + sales-agent + stock-keeper creation
│   │   ├── Users.tsx              ← legacy placeholder (Settings replaced most functionality)
│   │   ├── SalesDashboard.tsx     ← /sales — v2.23.1 agent calendar dashboard
│   │   ├── SalesEntry.tsx         ← /sales/entry — daily activity form (content posts + live selling + marketplace + direct orders)
│   │   ├── SalesOrders.tsx        ← /sales/orders — agent's own direct-order history with edit/delete (v2.28.0)
│   │   ├── MarketingReport.tsx    ← /marketing-report — admin + sales-agent leaderboard + 5 comparison charts + AgentDetailPanel
│   │   ├── StockScan.tsx          ← /stock/scan — STOCK_KEEPER mobile camera, Single/Bulk modes, operation-driven (v2.33.0)
│   │   └── inventory/
│   │       ├── Products.tsx       ← /inventory/products — Categories + Products CRUD (v2.31.0)
│   │       ├── InventoryItems.tsx ← /inventory/items — label generation PDF (v2.31.0 → v2.34.4 form rework)
│   │       ├── Warehouses.tsx     ← /inventory/warehouses — Warehouse CRUD
│   │       └── StockSummary.tsx   ← /inventory/stock — per-product table + manual adjust modal (v2.34.0)
│   ├── components/
│   │   ├── ScanInput.tsx          ← HID barcode scanner input (desktop inbound only)
│   │   ├── ProtectedRoute.tsx     ← role-gated route wrapper; redirects to /login or /unauthorized
│   │   ├── OrderTable.tsx         ← desktop table; includes DelayBadge column; D2+ rows tinted
│   │   ├── OrderCard.tsx          ← Phase 4: mobile card, touch-friendly, large tap targets
│   │   ├── ConfirmDialog.tsx      ← reusable confirmation modal
│   │   ├── DelayBadge.tsx         ← D-level badge: D0=none, D1=yellow, D2=orange, D3=red, D4=red+pulse
│   │   ├── SlaAlertBanner.tsx     ← Phase 9: dismissible D4 alert banner for ADMIN/INBOUND_ADMIN
│   │   ├── SlaHistoryModal.tsx    ← per-order SLA escalation timeline modal
│   │   ├── BulkScanModal.tsx      ← Phase 10 bulk staging + carrier/shop selector
│   │   ├── QuickScanModal.tsx     ← Phase 10b single-scan carrier/shop prompt (phone → desktop)
│   │   └── shared/
│   │       ├── AppLayout.tsx      ← desktop layout wrapper (Sidebar + content area)
│   │       ├── Sidebar.tsx        ← role-based nav; v2.31.0 gained `children?` for Inventory parent menu
│   │       ├── MobileHeader.tsx   ← Phase 4: handheld layout header (name + time, no nav)
│   │       ├── PageShell.tsx      ← sticky header + scrollable body for each panel
│   │       ├── Avatar.tsx         ← initials avatar component
│   │       ├── PlatformBadge.tsx  ← color-coded platform label (Shopee/Lazada/TikTok)
│   │       ├── StatCard.tsx       ← stat number card used in panel headers
│   │       ├── SectionHeader.tsx  ← section title + count badge
│   │       ├── ConfirmModal.tsx   ← v2.33.0 — createPortal modal replacing window.confirm() in Inventory
│   │       ├── Pagination.tsx     ← v2.35.1 — shared Prev/Next + numbered footer (StockSummary + Products)
│   │       └── DateNavigator.tsx  ← v2.27.0 — extracted from Outbound; prev/next + Today + date picker; minDate prop
│   ├── stores/                    ← Zustand global state
│   │   ├── authStore.ts
│   │   ├── notificationStore.ts   ← Phase 9: d4Alerts[], addD4Alert(), dismissD4Alert()
│   │   └── mobileSidebar.tsx      ← context for mobile sidebar open/close (handheld)
│   ├── api/                       ← TanStack Query hooks
│   │   ├── orders.ts
│   │   ├── assignments.ts
│   │   ├── users.ts
│   │   ├── reports.ts
│   │   ├── sales.ts               ← v2.23.1 — agent calendar + day-detail + direct order CRUD
│   │   ├── marketing.ts           ← v2.23.1 — leaderboard + drill-down
│   │   ├── products.ts            ← v2.31.0 — Product + Category CRUD hooks
│   │   ├── warehouses.ts          ← v2.31.0 — Warehouse CRUD hooks
│   │   └── stock.ts               ← v2.31.0 + v2.33.0 — useStockSummary, useScanStock, useGenerateLabels
│   ├── lib/
│   │   ├── platformDetect.ts      ← tracking number → platform logic
│   │   ├── scanDetect.ts          ← keystroke interval < 50ms = scanner, > 200ms = manual
│   │   └── manila.ts              ← timezone utilities: getManilaDateString() — Asia/Manila UTC+8, no deps
│   ├── theme.ts                   ← design tokens: colors, radius, shadow, font — single source of truth
│   └── index.css                  ← global design system CSS
```

### Route Access Control
```
/login                → Public
/dashboard            → ADMIN, INBOUND_ADMIN  (Inbound panel — also visible to PICKER_ADMIN, PACKER_ADMIN via sidebar)
/picker-admin         → ADMIN, PICKER_ADMIN
/picker               → PICKER            (mobile-first — PickerDevice.tsx)
/packer-admin         → ADMIN, PACKER_ADMIN
/packer               → PACKER            (mobile-first — PackerDevice.tsx)
/outbound             → ADMIN, INBOUND_ADMIN
/archive              → ADMIN only
/users                → ADMIN only
```

> **Handheld routing note:** `/picker` and `/packer` routes are opened on the handheld device browser. After login the device stays on this route — no navigation to other pages. The layout renders without Sidebar/Header and uses mobile-first components.

---

## 9. Backend Structure

```
backend/
├── src/
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── orders.ts              ← scan + bulk-scan + shops + handheld scan endpoints
│   │   ├── assignments.ts         ← /assign/picker, /assign/packer (legacy single-shot)
│   │   ├── picker-admin.ts        ← v2.x — scan-and-stage, assign, bulk-assign, stats, complete, unassign
│   │   ├── packer-admin.ts        ← v2.29.0 — scan-and-stage, assign, bulk-assign, stats, complete, remove, unassign
│   │   ├── picker.ts              ← PICKER handheld endpoints (own orders, complete)
│   │   ├── packer.ts              ← PACKER handheld endpoints (own assigned orders, complete)
│   │   ├── outbound.ts            ← dispatch single + bulk, stats, stuck list
│   │   ├── users.ts
│   │   ├── reports.ts             ← /reports/dashboard, /reports/sla, /reports/performance, /reports/live-performance, /reports/order-timeline (+ PDF/CSV)
│   │   ├── archive.ts             ← GET /archive, GET /archive/stats, POST /archive/trigger, POST /archive/bulk-delete
│   │   ├── products.ts            ← v2.31.0 — Product + Category CRUD (admin + read for STOCK_KEEPER)
│   │   ├── warehouses.ts          ← v2.31.0 — Warehouse CRUD (admin + read for STOCK_KEEPER)
│   │   ├── stock.ts               ← v2.31.0 + v2.33.0 rewrites — /labels, /scan (operation-driven), /summary, /stats, /items, /lookup/:id, /adjust, /movements
│   │   ├── sales.ts               ← v2.23.1 — agent daily activity + own direct-order CRUD
│   │   └── marketing.ts           ← v2.23.1 — admin leaderboard + drill-down (audit-logged)
│   ├── plugins/
│   │   ├── auth.ts                ← JWT verification plugin
│   │   ├── cors.ts
│   │   ├── rateLimit.ts
│   │   └── socket.ts              ← Socket.io integration; joins user to tenant:{id} + user:{id} rooms on connect
│   ├── middleware/
│   │   ├── rbac.ts                ← role-based access control
│   │   └── auditLog.ts            ← v2.26.0 — logs marketing-report reads/writes (userId, role, tenantId, method, url, ts)
│   ├── jobs/
│   │   ├── index.ts               ← registers all BullMQ workers and repeatable jobs
│   │   ├── nightlyReport.ts       ← BullMQ job: 23:40 PHT email + hardDeleteExpiredOrders() call
│   │   ├── archiveOutbound.ts     ← BullMQ job: 23:30 PHT daily, sets archived_at on OUTBOUND orders
│   │   ├── slaEscalation.ts       ← BullMQ job: every 15min sweep, D0→D4 escalation + priority boost
│   │   └── slaD4Email.ts          ← BullMQ job: supervisor alert email when order hits D4
│   ├── services/
│   │   ├── orderService.ts
│   │   ├── assignmentService.ts
│   │   ├── pickerAdminService.ts  ← v2.32.0 perf rewrite — getPickerStats batched (6 queries, was 4N+2)
│   │   ├── packerAdminService.ts  ← v2.29.0 + v2.31.4 — getPackerStats with Assigned + Done Today
│   │   ├── reportService.ts
│   │   ├── emailService.ts
│   │   ├── archiveService.ts      ← archiveOutboundOrders(), getArchivedOrders(), bulkDeleteArchivedOrders(), hardDeleteExpiredOrders()
│   │   ├── slaService.ts          ← escalateOrder(), calculatePriorityDelta(), markSlaComplete(), querySlaEligibleOrders()
│   │   ├── productService.ts      ← v2.31.0 + v2.33.0 — Product/Category CRUD + auto productCode generation
│   │   ├── warehouseService.ts    ← v2.31.0 — Warehouse CRUD + in-stock item count
│   │   ├── stockService.ts        ← v2.31.0 rewrite + v2.33.0 operation-driven scan state machine + v2.34.0 manual adjust + v2.34.5 bulk lookup
│   │   ├── salesActivityService.ts        ← v2.23.1 — calendar + day-detail + activity CRUD
│   │   ├── salesDirectOrderService.ts     ← v2.28.0 — direct order edit/delete (transactional item replace, cascade delete)
│   │   └── marketingReportService.ts      ← v2.23.1 + v2.28.x — leaderboard + comparison charts + agent drill-down
│   ├── lib/
│   │   └── manila.ts              ← getManilaStartOfToday(), getManilaDateString() — pure UTC+8 arithmetic, no deps
│   └── middleware/
│       └── rbac.ts                ← Role-based access control
└── prisma/
    └── schema.prisma
```

### API Endpoints

| Method | Endpoint | Role | Description |
|---|---|---|---|
| POST | `/auth/login` | All | Login |
| POST | `/auth/logout` | All | Logout |
| GET | `/orders` | Role-filtered | List orders (includes `delay_level` in response) |
| POST | `/orders` | ADMIN, INBOUND_ADMIN | Create order (scan) — sets `sla_started_at`, `delay_level=0` |
| DELETE | `/orders/:id` | ADMIN, INBOUND_ADMIN | Delete order |
| PATCH | `/orders/:id/status` | Role-filtered | Update status — sets `sla_completed_at` when → OUTBOUND |
| GET | `/orders/:id/sla` | ADMIN, INBOUND_ADMIN, PICKER_ADMIN, PACKER_ADMIN | Full SLA escalation history for an order |
| GET | `/picker-admin/orders` | ADMIN, PICKER_ADMIN | List INBOUND orders sorted by priority DESC, delayLevel DESC, createdAt ASC |
| GET | `/picker-admin/pickers` | ADMIN, PICKER_ADMIN | List active pickers |
| POST | `/picker-admin/assign` | ADMIN, PICKER_ADMIN | Assign single order to picker → status: PICKER_ASSIGNED |
| POST | `/picker-admin/bulk-assign` | ADMIN, PICKER_ADMIN | Bulk assign up to 200 orders to one picker |
| GET | `/picker-admin/stats` | ADMIN, PICKER_ADMIN | Per-picker workload: PICKER_ASSIGNED / PICKING / PICKER_COMPLETE counts |
| GET | `/picker-admin/picker/:id/orders` | ADMIN, PICKER_ADMIN | Active orders assigned to a specific picker (completedAt = null) |
| POST | `/picker-admin/complete` | ADMIN, PICKER_ADMIN | Mark order as PICKER_COMPLETE; sets pickerAssignment.completedAt |
| POST | `/picker-admin/unassign` | ADMIN, PICKER_ADMIN | Return order to INBOUND; deletes PickerAssignment record |
| POST | `/assign/picker` | ADMIN, PICKER_ADMIN | Assign to picker → emits `order:assigned` to `user:{pickerId}` |
| POST | `/assign/packer` | ADMIN, PACKER_ADMIN | Assign to packer → emits `order:assigned` to `user:{packerId}` |
| GET | `/outbound/orders` | ADMIN, INBOUND_ADMIN | List PACKER_COMPLETE orders ready to dispatch, sorted by delayLevel DESC, createdAt ASC |
| GET | `/outbound/stats` | ADMIN, INBOUND_ADMIN | Header stats: waitingCount, dispatchedToday, inboundTotal, outboundTotal, missingCount, d4Count |
| GET | `/outbound/stuck` | ADMIN, INBOUND_ADMIN | All non-OUTBOUND orders sorted by delayLevel DESC, slaStartedAt ASC |
| POST | `/outbound/dispatch` | ADMIN, INBOUND_ADMIN | Dispatch single order → OUTBOUND; sets `sla_completed_at` |
| POST | `/outbound/bulk-dispatch` | ADMIN, INBOUND_ADMIN | Dispatch up to 200 orders at once; returns `{ dispatched, skipped }` |
| GET | `/reports/dashboard` | ADMIN, INBOUND_ADMIN | Dashboard stats |
| GET | `/reports/picker` | ADMIN, PICKER_ADMIN | Picker reports |
| GET | `/reports/packer` | ADMIN, PACKER_ADMIN | Packer reports |
| GET | `/reports/sla` | ADMIN, INBOUND_ADMIN | SLA summary: count by D-level, D4 order list, avg time-to-OUTBOUND |
| GET | `/archive` | ADMIN | Paginated archived orders. Query: `page`, `pageSize`, `search`, `platform`, `dateFrom`, `dateTo`, `expiresWithin` |
| GET | `/archive/stats` | ADMIN | Archive summary: `{ total, expiring30, expiring7 }` |
| POST | `/archive/trigger` | ADMIN | Manually archive all OUTBOUND orders for the caller's tenant |
| POST | `/archive/bulk-delete` | ADMIN | Permanently delete archived orders. Body: `{ orderIds: string[] }`. Cascades child tables. |
| GET | `/users` | ADMIN | List users |
| POST | `/users` | ADMIN | Create user |
| PATCH | `/users/:id` | ADMIN | Update/deactivate user |

---

## 10. Multi-Tenant Architecture

Every database table includes `tenant_id`. PostgreSQL Row Level Security (RLS) enforces data isolation at the database level — even if application code has a bug, one tenant cannot see another tenant's data.

```sql
-- Example RLS policy
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Future multi-tenant onboarding: Admin creates a new tenant record → system is ready for that company immediately.

---

## 11. Security

| Concern | Solution |
|---|---|
| Authentication | JWT tokens, short expiry (15min access + 7day refresh) |
| Session storage | Redis (not localStorage — prevents XSS token theft) |
| Password storage | bcrypt with salt rounds ≥ 12 |
| SQL injection | Prisma ORM — parameterized queries always |
| XSS | React escapes by default; no dangerouslySetInnerHTML |
| Rate limiting | Fastify rate-limit plugin (100 req/min per IP) |
| HTTPS | Enforced at reverse proxy (Nginx) level |
| Data isolation | PostgreSQL RLS per tenant |
| Input validation | Zod schemas on all API inputs |
| CORS | Whitelist-only origins |
| Security testing | Run OWASP checklist at every deployment |

---

## 12. Performance

| Concern | Solution |
|---|---|
| 50–100 concurrent users | Fastify handles 30K+ req/sec — no issue |
| 2,000 orders/day (initial) | ~0.023 req/sec — ~20-25% of Vultr 4GB capacity |
| 10,000 orders/day (target) | ~0.12 req/sec — same server sufficient |
| Database connections | Prisma connection pool sufficient; pgBouncer to be added at 10,000+ orders/day |
| Frequent order list reads | Redis cache with 30-second TTL, invalidated on write |
| Real-time dashboard | Socket.io — push only on state change, no polling |
| 6 months data (≈360K orders initial) | PostgreSQL with proper indexes — performant |

---

## 13. Reporting

### Automated
- **Nightly email at 23:40 PHT** (15:40 UTC) — 11:40 PM Manila time, to all Admin users
- Contains: Inbound count, Outbound count, Remaining count, Picker & Packer summaries, **SLA data: D4 orders reached today (resolved vs still open), avg time-to-OUTBOUND, D-level breakdown at 9pm snapshot**

### On-Demand (in-app)
| Report | Where | Period |
|---|---|---|
| Dashboard summary | Main Dashboard | Live (real-time) |
| SLA summary (D0–D4 counts, D4 list, avg completion time) | Main Dashboard | Live (real-time) |
| **Live Performance** (per-role KPI cards, grouped hourly bar chart, per-worker **stacked** hourly bar charts for pickers and packers, per-worker tables with hourly sparklines) | Warehouse Report → Live Performance tab | Today (live) or any historical date up to 90 days back, Manila TZ — live: socket-pushed (`order:stats_changed`) + 30s polling; historical: no refetch, 5-min stale window |
| Picker / Packer daily performance (7/14/30 days, sparkline + CSV/PDF export) | Warehouse Report → Performance tab | Daily / Weekly / Monthly |
| SLA analytics (D-level distribution donut, D4 unresolved list, PDF export) | Warehouse Report → SLA Analytics tab | Last 7/14/30 days |
| Order Timeline (full per-order lifecycle audit — all status changes, picker/packer assignments, inter-event durations) | Warehouse Report → Order Timeline tab | Per tracking number (on-demand) |
| Inbound vs Outbound | Outbound Panel | Live |
| Stuck orders (with D-level) | Outbound Panel | Live |
| SLA escalation history (per order) | Any panel with order detail | On-demand |

**Warehouse Report access:** `ADMIN`, `INBOUND_ADMIN`, `PICKER_ADMIN`, `PACKER_ADMIN` — all four admin roles see the same 4 tabs. Tab order: **Live Performance** (default) → Performance → SLA Analytics → Order Timeline.

#### Live Performance tab — data model
- Endpoint: `GET /reports/live-performance?date=YYYY-MM-DD` (same RBAC tuple as `/reports/performance`)
  - Without `date` → today (live mode, socket-driven + 30s refetch)
  - With `date` → historical day in Manila TZ; max 90 days back (`400` otherwise); future dates rejected (`400`)
- Aggregates `PickerAssignment.completedAt` / `PackerAssignment.completedAt` within the 24-hour Manila-local window (`[from, from + 24h)`) into 24 hourly buckets using the `getManilaStartOf(dateStr)` / `getManilaStartOfToday()` helpers
- **Active now** = assignments where `completedAt IS NULL AND order.archivedAt IS NULL` — computed only in live mode; zero in historical
- **Items / hour** — live: `completedToday / max(1, hoursSinceFirstCompletionToday)` (per-worker elapsed so late starters aren't penalized); historical: `completedOnDay / hoursWithWork` (closed-day rate across active work hours)
- Worker list — live: every `isActive` picker/packer (idle workers shown as zero rows); historical: all pickers/packers regardless of `isActive` flag, so users who worked that day but were later deactivated still appear
- Sort: active users first, then by `completedToday` desc, then username asc — applied in both backend and frontend; inactive users carry an `Inactive` badge in the table
- Charts: aggregate grouped `BarChart` (Pickers vs Packers) + two stacked `BarChart`s with per-worker segments (hue-varied palette generated from base accent via HSL around `PICKER_COLOR` / `PACKER_COLOR`)
- Historical mode: no `refetchInterval`, no socket subscription, `staleTime: 5min`; `LiveStatusPill` renders amber "Historical · YYYY-MM-DD"
- Shared `DateNavigator` component (`frontend/src/components/shared/DateNavigator.tsx`) — extracted from the Outbound page; supports `minDate` prop; prev/next arrows, clickable date label opening native `<input type="date">`, "Today" shortcut
- No new DB migrations, no Redis caching — existing `[pickerId, completedAt]` / `[packerId, completedAt]` indexes cover the queries
- Socket event reused: `order:stats_changed` (already emitted on every picker/packer state transition); frontend subscribes only when not historical
- Files: `backend/src/routes/reports.ts` (endpoint), `frontend/src/pages/reports/LivePerformanceTab.tsx` (tab body), `frontend/src/components/shared/DateNavigator.tsx` (shared nav)

---

## 14. Deployment Strategy

### Environment Plan

| Environment | Where | Cost | Purpose |
|---|---|---|---|
| **Development** | Localhost | Free | Local development |
| **Production** | Vultr Manila 🇵🇭 | $12/month | Live system |

> No staging environment — features are developed on localhost and deployed directly to production once approved.

### Why Vultr Manila
- Closest datacenter to the Philippines (~5–10ms latency)
- Instant response for barcode scanning is critical — high latency is unacceptable
- $12/month handles 2,000–10,000 orders/day comfortably

### Production Server Specification

**Vultr Cloud Compute — Regular Performance (Manila, PH)**
| Resource | Value |
|---|---|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 80 GB SSD |
| Bandwidth | 3 TB/month |
| Cost | **$12/month** |

At 2,000 orders/day the server runs at **~20–25% capacity**.

### Production Infrastructure (Docker Compose — Single Server)

```
[Vultr Manila VPS]
│
├── Nginx (reverse proxy + SSL — Let's Encrypt)
│       ├── /          → React static build
│       └── /api       → Node.js Fastify (backend)
│               ├── PostgreSQL 16
│               ├── Redis
│               └── BullMQ workers
```

### Branching Model
```
feature/xxx  →  main branch
                     │
              git tag v1.x.x
                     │
              docker build + push
                     │
              Deploy to Vultr
```

### Versioning
- Semantic versioning: `v1.0.0`, `v1.1.0`, `v1.2.0`
- Every production deploy is tagged in git
- Rollback: re-deploy the previous Docker image

### CI/CD (GitHub Actions)
```
On push to main branch:
  1. npm run lint
  2. npm run test
  3. docker build (tag with git tag)
  4. docker push → registry
  5. SSH to Vultr → git pull + `docker compose up -d --build --remove-orphans` (rebuilds images from source)
```

### Scaling Roadmap

| Phase | Load | Action |
|---|---|---|
| Launch | 2,000 orders/day | Vultr 2 vCPU / 4 GB — current plan |
| Growth | ~5,000 orders/day | Upgrade to Vultr 4 vCPU / 8 GB (~$24/month) |
| Scale | 10,000+ orders/day | Add separate DB server + pgBouncer |

---

## 15. Development Phases

| Phase | What Gets Built | Status | Exit Criteria |
|---|---|---|---|
| **1** | Project scaffold, auth system, user management, Socket.io dual-room join | ✅ Done | All 6 roles can log in; access restricted correctly |
| **2** | Inbound Panel — scan, auto-detect, zero manual input, SLA D0, pagination (25/page), delay-priority sort | ✅ Done | Orders appear after scan (~2 sec); D4 at top |
| **3** | Picker Admin Panel — custom picker dropdown, order table (10/page, delay sort), bulk assign, workload cards | ✅ Done | Orders assigned; workload grid accurate |
| **4** | Picker Admin — order detail modal, Remove (styled confirm dialog), Complete, unassign endpoint | ✅ Done | Remove → INBOUND; Complete → PICKER_COMPLETE; stats refresh within 5s |
| **5** | Packer Admin Panel (same pattern as Phase 3+4): order table, custom packer dropdown, workload cards, order detail modal with Remove/Complete | ✅ Done | PICKER_COMPLETE orders appear; packer workload visible; remove auto-reassigns to original picker |
| **6** | Picker Device View (mobile-first) — PIN auth, order list, scan complete | ✅ Done | Picker sees orders on handheld; complete works; PIN-based session |
| **7** | Packer Device View (mobile-first) — same pattern as Picker Device (green theme) | ✅ Done | Packer confirms on handheld; shared queue; race condition protected |
| **8** | Outbound Panel; `sla_completed_at` set on OUTBOUND | ✅ Done | End-to-end lifecycle works; SLA timer stops at dispatch |
| **9** | SLA escalation job (15-min sweep, D0→D4, priority boosts, D4 alert); SlaAlertBanner UI | ✅ Done | D-level updates automatically; D4 triggers Socket.io alert + supervisor email; banner shows stage + assigned picker/packer; collapse/expand for multiple alerts |
| **10** | Bulk Inbound Scan — `carrierName` + `shopName` fields on orders; `BulkScanModal` (createPortal), staging list, carrier dropdown, shop combobox; `POST /orders/bulk-scan`, `GET /orders/shops`; `Carrier` enum + `detectPlatform` moved to shared package. Carrier + Shop Name both **mandatory** (frontend disabled + yellow warning + backend 400 validation). 18 preset shop names always in dropdown. | ✅ Done | Batch of TNs staged, carrier + shop assigned, all saved; duplicates reported; single scan unaffected; carrier/shop columns visible in Inbound table |
| **10b** | Handheld Admin Scan — concurrent session support (`session:{userId}:{deviceType}`); `/inbound-scan` + `/picker-admin-scan` pages; Single/Bulk camera scan modes; phone→desktop real-time relay via Socket.io (no direct DB write from phone); duplicate check on handheld-scan routes; socket routed via Vite HTTPS proxy; custom SSL cert with IP SAN for LAN phone access | ✅ Done | Phone scans → desktop QuickScanModal or BulkScanModal opens; concurrent desktop+phone sessions without conflict; duplicate barcode blocked on phone with warning |
| **DC** | **Daily Cycle Tracking + End-of-Day Archiving** — `work_date` and `archived_at` fields on orders; partial unique index (archived tracking numbers reusable); `archiveService.ts` + `archiveOutbound` BullMQ job (23:30 PHT daily — was 19:00 PHT in early DC drafts, moved to 23:30 in v2.13.x per SOLUTIONS.md [2026-04-18]); `hardDeleteExpiredOrders` in nightly report (23:40 PHT, 180-day retention); `archivedAt: null` filter on all active service queries; Carryover badge (amber CARRY) in Inbound/PickerAdmin/PackerAdmin; Carryover Active stat on Dashboard; Archive Panel (`/archive`) with stats, filters, expiry badges, bulk delete, manual trigger. **Timezone localization:** all start-of-day calculations and cron schedules use Asia/Manila (UTC+8); `manila.ts` utilities in both backend and frontend; all UI date/time displays use `timeZone: 'Asia/Manila'`. **Auth unification:** Picker and Packer now use standard username+password login via `/login` (same as all other roles); PIN auth system removed; `picker_pin`/`packer_pin` columns dropped from DB | ✅ Done | OUTBOUND orders hidden at 23:30 PHT (11:30 PM Manila time); CARRY badge on previous-day orders; Archive Panel works; all timestamps in Manila time; Picker/Packer log in via Chrome with username+password |
| **11** | Main Dashboard + SLA Summary Card + real-time + nightly email | ✅ Done | Live stats update via Socket.io (`sla:escalated`, `order:stats_changed`); nightly HTML email with SLA breakdown sent at 23:40 PHT (11:40 PM Manila time); Dashboard shows pipeline, picker/packer summary, outbound summary, SLA D0–D4 |
| **SALES** | **Sales Agent Module (v2.23.1)** — new `SALES_AGENT` role (`UserRole` enum); 6 new Prisma models (`SalesDailyActivity`, `SalesContentPost`, `SalesLiveSellingMetric`, `SalesMarketplaceReport`, `SalesDirectOrder`, `SalesDirectOrderItem`) + 3 enums (`SalesPlatform`, `ContentPostType`, `SaleChannel`); backend routes `/sales` + `/marketing`; services `salesActivityService`, `salesDirectOrderService`, `marketingReportService`; agent-facing UI: `/sales` month calendar dashboard, day-entry form (content posts + live selling + marketplace + direct orders), day-detail modal, own history; admin-facing UI: `/marketing-report` leaderboard + 4 comparison charts + `AgentDetailPanel` (per-agent calendar drill-down); admin-only `Settings → Sales Agents` creation; Vite proxy extended for `/sales` + `/marketing` | ✅ Done (v2.23.1) | Agent logs in → `/sales` opens, calendar renders, daily entry saves + persists across refresh; admin `/marketing-report` shows leaderboard + charts + per-agent drill-down; existing picker/packer/inbound/outbound flows unaffected; **deploy note:** requires manual `prisma db push` on Vultr after CD (workflow runs `migrate deploy || true` — no migrations in repo yet, see SOLUTIONS.md 2026-04-20) |
| **12** | Reporting & Analytics + CSV/PDF export | 🟡 Partial | CSV/PDF exports for Performance + SLA (done). **Live Performance tab added (v2.25.0 + v2.25.1)**: intraday per-role KPIs, grouped hourly bar chart (Recharts `BarChart`, Pickers/Packers side-by-side), per-worker live tables with hourly sparklines; socket-driven updates via `order:stats_changed` + 30s polling fallback; Live/Polling status pill. Order Timeline tab (per-order lifecycle audit) also shipped. **Historical mode (v2.27.0)**: `DateNavigator` on Live Performance tab, up to 90 days back, per-worker stacked hourly bar charts, inactive-user inclusion in historical view. **Remaining:** CSV/PDF export for Live Performance (deferred), additional cross-period comparative analytics |
| **13** | Security hardening + load testing | 🔜 | OWASP checklist passed; 100 users load test passed |
| **14** | Multi-tenant, Docker, CI/CD, versioned deploy | 🔜 | Full regression on test branch; clean deploy to main |

---

## 16. SLA System — Technical Detail

### Escalation Job (`slaEscalation.ts`)
- **Schedule:** Every 15 minutes (`*/15 * * * *`) via BullMQ repeatable job
- **Logic:** For each tenant, query orders where `sla_completed_at IS NULL` AND `delay_level < 4` AND `NOW() - sla_started_at > (delay_level + 1) * 4 hours`
- **Per qualifying order (in a single DB transaction):**
  1. Calculate new `delay_level = MIN(4, FLOOR(elapsed_hours / 4))`
  2. Calculate priority delta: `SLA_PRIORITY_BOOSTS[newLevel] - SLA_PRIORITY_BOOSTS[oldLevel]`
  3. Update `orders`: set `delay_level`, increment `priority` by delta
  4. Insert into `sla_escalations`
  5. If `to_level === 4` and `d4_notified_at IS NULL`: set `d4_notified_at = NOW()`
- **After transaction:** emit Socket.io `sla:escalated` event; enqueue `slaD4Email` job for D4 orders
- **Error handling:** Per-order try/catch — one order failure does not abort the sweep

### D4 Supervisor Alert Flow
```
Sweep detects order elapsed ≥ 16 hours
        │
        ▼
DB Transaction: delay_level=4, priority+=800, d4_notified_at=NOW()
Insert sla_escalations (from=3, to=4)
        │
        ├──▶ Socket.io emit → sla:d4_alert → SlaAlertBanner appears for all ADMIN/INBOUND_ADMIN sessions
        │
        └──▶ BullMQ enqueue slaD4Email → Nodemailer → supervisor email
```

### Priority Delta Table
| Escalation | Delta Applied | Resulting Boost (cumulative) |
|---|---|---|
| D0 → D1 | +200 | 200 |
| D1 → D2 | +200 | 400 |
| D2 → D3 | +400 | 800 |
| D3 → D4 | +800 | 1600 |

### Shared Constants (`shared/src/sla.ts`)
Both frontend and backend import from this file — no magic numbers anywhere else:
- `SLA_HOURS_PER_LEVEL = 4`
- `SLA_MAX_LEVEL = 4`
- `SLA_PRIORITY_BOOSTS = [0, 200, 400, 800, 1600]`
- `SLA_LEVEL_COLORS = { 0: 'gray', 1: 'yellow', 2: 'orange', 3: 'red', 4: 'crimson' }`

### Socket.io Rooms

| Room | Members | Purpose |
|---|---|---|
| `tenant:{tenantId}` | All users of that tenant | Broadcast: dashboard stats, SLA alerts, order list updates |
| `user:{userId}` | Single user (their session) | Targeted push: new order assigned to this picker/packer |

On login, the socket server joins the user to both their `tenant:` room and their `user:` room automatically.

### Socket.io Events

| Event | Direction | Room | Payload | Consumer |
|---|---|---|---|---|
| `order:created` | Server → Client | `tenant:{id}` | `{ order }` | Invalidate order list cache |
| `order:updated` | Server → Client | `tenant:{id}` | `{ orderId, status }` | Invalidate order list cache |
| `order:deleted` | Server → Client | `tenant:{id}` | `{ orderId }` | Invalidate order list cache |
| `order:assigned` | Server → Client | `user:{pickerId/packerId}` | `{ order }` | Push new order to handheld device |
| `stats:updated` | Server → Client | `tenant:{id}` | `{ stats }` | Update dashboard stats |
| `sla:escalated` | Server → Client | `tenant:{id}` | `{ orderId, fromLevel, toLevel, tenantId }` | Invalidate order list cache |
| `sla:d4_alert` | Server → Client | `tenant:{id}` | `{ orderId, trackingNumber, tenantId, status, assignedPicker, assignedPacker }` | Show SlaAlertBanner |

> **Key design:** `order:assigned` goes to `user:{id}` room — only the assigned picker/packer receives it. All other events broadcast to the full tenant room.

### SlaAlertBanner (`frontend/src/components/SlaAlertBanner.tsx`)

Visible only to `ADMIN` and `INBOUND_ADMIN` roles. Rendered at the top of `AppLayout` (above page content).

| Alert count | Behaviour |
|---|---|
| 0 | Hidden |
| 1 | Full-width crimson bar: tracking number, stage (`OrderStatus`), assigned picker/packer (if any), `[Dismiss]` |
| 2+ | Summary bar: order count, `[Show ▼]` to expand individual rows, `[Dismiss All]` |

**Expanded rows** (2+ alerts): each row shows tracking number, stage, assigned picker/packer, individual `[Dismiss]`.

**Socket lifecycle fix:** `SlaAlertBanner` calls `connectSocket()` (not `getSocket()`) in its `useEffect`. React fires child effects before parent effects — at mount time `getSocket()` would return `null` because `AppLayout`'s `connectSocket()` call hasn't run yet. `connectSocket()` is idempotent and safe to call from either component.

**State:** `notificationStore` (Zustand, non-persisted) — `d4Alerts[]`, `addD4Alert()`, `dismissD4Alert(id)`, `dismissAllD4Alerts()`.

### RLS on `sla_escalations`
```sql
ALTER TABLE sla_escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sla_escalations
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```
The escalation job uses a privileged service-role connection (same as nightly report) — it is not tenant-scoped.

---

## 17. MCP Servers (Development Tooling)

| MCP | Purpose |
|---|---|
| **Figma MCP** | Design-to-code workflow, component inspection |
| **GitHub MCP** | PR management, branch operations |
| **PostgreSQL MCP** (DBHub) | Database query context in AI sessions |
| **Docker MCP** | Container management (Phase 10) |

---

*This document should be reviewed and approved before Phase 1 development begins. Any changes to the architecture after this point should be reflected in an updated version of this document.*
