# Design System — Dynamic Order Management

> **For future agents:** Read this file first before touching any frontend code.
> All design decisions are centralised here and in `frontend/src/theme.ts`.

---

## Phase A — Modern Minimal Token Foundation (v2.37.0)

Additive token expansion toward a Linear/Vercel modern-minimal aesthetic. **All legacy tokens below remain valid.** New tokens listed here are available for new code and future polish phases (Phase C onward). Mirrored as CSS variables in `frontend/src/styles/tokens.css`.

### Inter Variable font
`@fontsource-variable/inter/wght.css` is imported in `main.tsx`. `body` font-family now leads with `'Inter Variable'` and falls back to the original system stack. `font-display: swap` (built-in) prevents FOUT-induced layout shift. Apply `font-variant-numeric: tabular-nums` (or the `.tabular-nums` utility class) on stat values, clocks, and counters to keep digits column-aligned.

### Spacing scale (`space` — 4px-based)
`0 · 1(4) · 2(8) · 3(12) · 4(16) · 5(20) · 6(24) · 8(32) · 10(40) · 12(48) · 16(64)`. Snap legacy odd values (10/14/18/22) to nearest step when migrating.

### Type scale (`fontSize`, `lineHeight`, `tracking`)
- Sizes: `xs(12) · sm(13) · base(14) · md(16) · lg(20) · xl(24) · 2xl(30) · 3xl(36)`
- Line heights: `tight(1.15) · snug(1.3) · normal(1.5)`
- Tracking: `tight(-0.01em) · tighter(-0.02em) · display(-0.03em) · normal(0) · wide(0.04em) · wider(0.1em)`

Use `tracking.display` on hero headings (e.g. Dashboard hero clock).

### Radius — extended
Added `xs(4px)` and `2xl(16px)` alongside existing `sm/md/lg/xl/full`.

### Shadow — layered + focus rings
- `xs · sm · md · lg` — modern minimal layered shadows (15,23,42 base, low opacity)
- `focus` — 3px primary ring for inputs/selects
- `focusRing` — 2px white + 2px primary, for buttons over coloured backgrounds
- Legacy `card · cardHover · btn · xl` aliases preserved

### Motion — duration + ease groups
- `motion.duration`: `instant(80) · fast(150) · base(200) · slow(250) · slower(400)`
- `motion.ease`: `standard · emphasized · exit` (cubic-bezier curves)
- Legacy `fast(120) · normal(200) · slow(320)` aliases preserved

### 12-step neutral scale (`colors.gray`)
`50 → 950`, Linear-flavoured. Use for new surfaces, borders, and text. Existing slate values (`#f1f5f9`, `#e2e8f0`, `#64748b`, etc.) remain valid in legacy classes until per-tier polish migrates them.

### Accessibility — reduced motion
A global `@media (prefers-reduced-motion: reduce)` rule in `index.css` neutralises all transitions and animations app-wide. **Operator scan audio/haptic feedback is JS-driven and intentionally NOT affected** (`AudioContext`, `navigator.vibrate`, `setTimeout` calls).

### Preserved verbatim (do not change)
`colors.delay[]`, `colors.delayBg[]`, `colors.delayText[]`, `colors.priority()`, `colors.platform.{SHOPEE,LAZADA,TIKTOK,DIRECT,OTHER}` — saha-doğrulanmış.

---

## Phase E — Tier 2 High-Traffic Polish (v2.38.2)

Scope-controlled. Full PickerAdmin/PackerAdmin toolbar normalization (those files carry 160+146 inline-style blocks) deferred to a later sub-phase to keep regression risk low. SalesEntry/SalesOrders inline extraction + MonthCalendar/DaySummaryCell typography refinement deferred to Phase F.

### Row flash on real-time arrival
- New `@keyframes row-flash` + `.row-flash` class in `components.css` — 250ms primary-tint pulse, `forwards` fill so no layout shift remains.
- **PickerAdmin / PackerAdmin:** new `freshIds: Set<string>` state + `markFresh(id)` helper (adds ID, removes after 350ms). The socket handlers for `order:staged` / `order:packer-staged` call `markFresh` after `setStagedOrders`. Mount-time Redis-backed pending drain does NOT trigger the flash — only real-time arrivals do, so the signal stays meaningful.

### Sales Dashboard CSS extraction
- New partial `frontend/src/styles/sales-dashboard.css` loaded in `index.css` between `components.css` and `utilities.css`.
- Classes: `.sales-hero` / `.sales-hero-label` / `.sales-hero-title` / `.sales-hero-cta` (Phase C button triad: hover bg/shadow, `:focus-visible` ring, `:active` scale), `.sales-stats-grid`, `.sales-stat-card` + `.sales-stat-card--highlight` (green-gradient highlight for Direct Sales), `.sales-stat-card-icon` / `.sales-stat-card-label` / `.sales-stat-card-value`, `.sales-month-chips` / `.sales-month-chips-strong` / `.sales-month-chip` / `.sales-month-chips-loading`.
- All 13 inline `style={{}}` blocks in `SalesDashboard.tsx` migrated. `StatCard` + `Chip` subcomponents now classname-driven.

### Rule for new sales pages
Use the `sales-*` classes from `sales-dashboard.css`. Add new sales-specific classes to this same partial (not `components.css`) so the sales suite stays grep-able. Future per-tier polish (SalesEntry, SalesOrders, MonthCalendar, DaySummaryCell) will land in this partial too.

---

## Phase D — Tier 1 Showcase Polish (v2.38.1)

Login + Dashboard + Sidebar end-to-end. Heavy Dashboard component refactor (inline-styled MetricCard / PipelineStage / Volume Report buttons) deferred to Phase F.

- **`.login-card`** border-radius 16 → `var(--radius-xl)` (12px). Card shadow kept bespoke (deeper than `--shadow-lg` because the card sits on a dark gradient).
- **`.login-card-heading h2`** font-size → `var(--font-size-xl)` (24, token-driven), color → `var(--color-text-primary)`, letter-spacing → `var(--tracking-display)` (-0.03em, was -0.5px).
- **`.shimmer-btn`** (login submit) aligned to Phase C button pattern — no hover translateY; `:active scale(0.98)` 80ms; new `:focus-visible` ring stacked over shimmer shadow.
- **`.stats-grid`** gap 14px → `var(--space-4)` (16px) — snaps the dashboard stat grid to the 4px scale.
- **Dashboard hero clock** no longer forces SF Mono via inline style — uses body Inter Variable with `tabular-nums` already on `.dashboard-hero-time` (Linear-style).
- **`NumberTicker` default 900ms unchanged** — 250ms is jarring for stat counters; the plan's suggestion to align to `motion.duration.slow` doesn't fit number-ticker UX.
- **Sidebar mobile drawer:** Phase C visual changes verified across the responsive breakpoint; CSS unchanged.

---

## Phase C — Shared Primitives Polish (v2.38.0)

First phase with **real visual changes**. All component APIs unchanged. CSS-only edits in `components.css` + `layout.css`, plus one component file (`ConfirmModal.tsx`) migrated to use the new modal classes.

### Buttons (`.btn*`)
- Hover: bg-darken + shadow lift only — **no `translateY(-1px)`** (modern minimal doesn't bounce).
- Focus-visible: `box-shadow: var(--shadow-focus-ring)` (white-on-primary doubled ring, Linear signature). Per-variant semantic rings for danger/success.
- Active: `transform: scale(0.98)` over 80ms — tactile press feedback.
- Transition narrowed from `all 0.15s ease` to explicit properties using the new motion tokens.

### Tables (`.data-table-wrap tbody tr`)
- Hover bg: `var(--gray-50)` (was bluish `#fafbff`).
- Keyboard focus: `box-shadow: inset 2px 0 0 var(--color-primary)` (left accent rail).
- `.row-d2/d3/d4` saha-doğrulanmış tints **untouched**.

### Inputs / Selects / Pagination
- Unified focus: `border-color: var(--color-primary)` + `box-shadow: var(--shadow-focus)` (3px ring).
- `.styled-select` gains a `:hover` border-strong fade.
- `.pagination-page-btn` and `.pagination-info` gain `font-variant-numeric: tabular-nums`.

### Sidebar (`.sidebar-link*`)
- Active state: glow dropped (`box-shadow` removed from `::before`); pure 2px accent rail.
- Active label + icon color: `#ffffff` (was washed `#60a5fa`).
- Hover: `transform: translateX(2px)` on `.sidebar-link-icon` over 150ms.

### Badges + StatCard typography
- `.count-badge`: 11/600 + `--tracking-wide` + `tabular-nums` (was 12/700).
- `.stat-card-value`: gains `tabular-nums`.
- `.stat-card-label`: 600/600 + `--tracking-wide` (was 500).
- Colors and sizes preserved.

### Modal primitives (new)

Use these for any new modal. Apply via `createPortal` to `document.body`.

| Class | Purpose |
|---|---|
| `.modal-backdrop` | Fixed-inset overlay, `backdrop-filter: blur(8px)`, `rgba(15,23,42,0.55)`, click-outside handler attaches here |
| `.modal-card` | White card, `--radius-2xl`, `--shadow-lg`, scales in `0.96 → 1` in 200ms emphasized ease, max-width 440px |
| `.modal-card--wide` | Variant: max-width 640px |
| `.modal-header` + `.modal-header--danger/--primary` | Header strip with gradient bg by tone |
| `.modal-icon` + `.modal-icon--danger/--primary` | 40px circle icon — tinted border + color |
| `.modal-title` | 16/700 |
| `.modal-body` | 18px/24px padding |
| `.modal-message` | 14/400 with 1.5 line-height |
| `.modal-detail` | Inset secondary note — `--color-surface-alt` bg, 13px |
| `.modal-footer` | Right-aligned button row, top border, `--color-surface-alt` tint |
| `@keyframes modalCardIn` | Scale-in keyframe — referenced by `.modal-card` |

Components handle ESC/click-outside JS. CSS supplies look + motion only.

`ConfirmModal` is the reference implementation — see `components/shared/ConfirmModal.tsx`. Migrate other modals (`BulkScanModal`, `QuickScanModal`, `GenerateDirectModal`, `SlaHistoryModal`, `DayDetailModal`, `DirectOrderFormModal`) when touching their pages in Phases E/F.

---

## Phase B — CSS Partition Map (v2.37.1)

`frontend/src/index.css` is now a 17-line list of `@import` statements. All actual rules live in 6 partials under `frontend/src/styles/`, loaded in cascade order:

| # | File | Contents |
|---|---|---|
| 1 | `tokens.css` | Every design token mirrored as a `:root` CSS custom property (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`, `--font-*`, `--duration-*`, `--ease-*`, `--gray-*`, etc.) |
| 2 | `reset.css` | Global element reset (`*`, `html`, `body`, `button`) + `prefers-reduced-motion` override |
| 3 | `layout.css` | `.app-layout`, `.app-content`, `.sidebar*`, `.panel-*`, sidebar chrome (`.sidebar-hamburger`, `.header-signout-btn`, `.sidebar-close-btn`), `.sidebar-mobile-overlay` |
| 4 | `components.css` | Reusable primitives — `.stat-card*`, `.section-*`, `.count-badge`, `.data-table-wrap*`, `.toolbar-card`, `.btn*`, `.styled-select`, `.empty-state*`, `.stats-grid`, `.spinner*`, `.loading-state`, `.feedback-banner*`, `.pagination*`, `.dashboard-hero*`, `.picker-stat-card`, responsive media-query block (`@media (max-width: 1024px / 768px / 480px)`), `.login-*`, `.shimmer-btn*`, `.scan-input-row`, `celebrate-*` keyframes, `.beam-wrap*`, `.sortable-th*`, `.filter-bar*`, `.bulk-action-bar*` |
| 5 | `utilities.css` | `.tabular-nums`, `.truncate`, `.sr-only` |
| 6 | `legacy.css` | **Removal candidates** — `.inbound-*` (use `.panel-*`), `.order-table-wrap` (use `.data-table-wrap`), `.picker-admin-*` (use `.btn-*` / `.toolbar-card` / `.styled-select` / `.stats-grid`). To be deleted in Phase I once `src/pages/**` grep returns zero hits. |

**Rules for new code:**
- Always add new selectors to the correct partial — never write CSS in `index.css` itself.
- Never use selectors from `legacy.css`; if you find an existing usage you can migrate, do it (or note it for the Phase I cleanup PR).
- Media queries belong in the same partial as the selector they override (so cascade stays positional within the concatenated bundle).
- Keep the `@import` order in `index.css` unchanged. Reordering changes cascade and can break rules silently.

---

## Rules (Non-negotiable)

1. **All UI text must be in English.** No Turkish, no other languages.
2. **Always import tokens from `frontend/src/theme.ts`.** Never hardcode hex values or sizes in components.
3. **Every panel page must use the `PageShell` component** (or the `panel-root / panel-header / panel-body` CSS class structure).
4. **Use shared components** from `frontend/src/components/shared/` instead of re-implementing them.
5. **Do not touch backend files** (`backend/`, `shared/`). The shared package is at `shared/` (npm scope `@dom/shared`); there is no `packages/` directory in this monorepo.

---

## Color Palette (`colors` from `theme.ts`)

### Brand
| Token | Hex | Usage |
|---|---|---|
| `primary` | `#2563eb` | Primary buttons, active states, links |
| `primaryHover` | `#1d4ed8` | Hover state for primary buttons |
| `primaryLight` | `#eff6ff` | Light blue backgrounds, hover fill |
| `primaryRing` | `rgba(59,130,246,0.15)` | Focus ring shadow |

### Surfaces
| Token | Hex | Usage |
|---|---|---|
| `bg` | `#f1f5f9` | Page / panel background |
| `surface` | `#ffffff` | Cards, table, modals |
| `surfaceAlt` | `#f8fafc` | Table headers, secondary cards |

### Borders
| Token | Hex | Usage |
|---|---|---|
| `border` | `#e2e8f0` | Default border color |
| `borderStrong` | `#cbd5e1` | Emphasized borders |

### Text
| Token | Hex | Usage |
|---|---|---|
| `textPrimary` | `#0f172a` | Headings, main content |
| `textSecondary` | `#64748b` | Subtitles, secondary labels |
| `textMuted` | `#94a3b8` | Placeholders, disabled, timestamps |

### Status
| Token | Hex | Usage |
|---|---|---|
| `success` | `#16a34a` | Completed, assigned counts |
| `warning` | `#eab308` | Warnings, D1 delay |
| `danger` | `#ef4444` | Errors, D3 delay, delete actions |
| `dangerLight` | `#fef2f2` | Row background for high-delay orders |
| `dangerBorder` | `#fecaca` | Error state borders |

### Delay Levels (arrays — index = level 0–4)
| Level | Bar Color | Badge Background | Badge Text |
|---|---|---|---|
| D0 | `#64748b` | `#e5e7eb` | `#374151` |
| D1 | `#eab308` | `#fef9c3` | `#854d0e` |
| D2 | `#f97316` | `#fed7aa` | `#9a3412` |
| D3 | `#ef4444` | `#fecaca` | `#991b1b` |
| D4 | `#991b1b` | `#fca5a5` | `#7f1d1d` |

Access via: `colors.delay[level]`, `colors.delayBg[level]`, `colors.delayText[level]`

### Priority Colors (`colors.priority(p: number)`)
| Range | Color |
|---|---|
| p ≥ 1600 | `#be123c` (crimson) |
| p ≥ 800 | `#ef4444` (red) |
| p ≥ 400 | `#f97316` (orange) |
| p ≥ 200 | `#eab308` (yellow) |
| < 200 | `#94a3b8` (gray) |

### Platform Badge Colors (`colors.platform[key]`)
| Platform | Background | Text | Dot |
|---|---|---|---|
| SHOPEE | `#fff4ed` | `#c2410c` | `#f97316` |
| LAZADA | `#eff6ff` | `#1d4ed8` | `#3b82f6` |
| TIKTOK | `#fdf4ff` | `#7e22ce` | `#a855f7` |
| OTHER | `#f9fafb` | `#374151` | `#9ca3af` |

### Avatar Colors (`colors.avatar`)
- Background: `#e0e7ff`
- Text: `#4f46e5`

---

## Typography (`font` from `theme.ts`)

### Font Stacks
- **Base:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
- **Mono:** `'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace`

### Size Scale
| Token | Value | Usage |
|---|---|---|
| `sizeXs` | `11px` | Labels, muted text, table headers, stat labels |
| `sizeSm` | `12px` | Badges, secondary metadata |
| `sizeMd` | `13px` | Buttons, form inputs, body default |
| `sizeLg` | `14px` | Table cells, normal body text |
| `sizeXl` | `15px` | Section titles |
| `size2xl` | `16px` | Panel titles, modal headings |

### Font Weights
- `500` — Labels, secondary text
- `600` — Buttons, table header content, badge text
- `700` — Section headings (`h2`), panel title (`h1`)
- `800` — Stat numbers, metric values

---

## Border Radius (`radius` from `theme.ts`)

| Token | Value | Usage |
|---|---|---|
| `sm` | `6px` | Small buttons, chips |
| `md` | `8px` | Inputs, buttons default |
| `lg` | `10px` | Stat cards |
| `xl` | `12px` | Panels, modals, table wrappers |
| `full` | `9999px` | Pill badges, avatars, progress bars |

---

## Shadows (`shadow` from `theme.ts`)

| Token | Value | Usage |
|---|---|---|
| `card` | `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)` | Default card shadow |
| `cardHover` | `0 4px 12px rgba(0,0,0,0.1)` | Hover state for interactive cards |
| `btn` | `0 2px 8px rgba(37,99,235,0.25)` | Primary button hover shadow |

---

## Shared Component Inventory

All located in `frontend/src/components/shared/`.

| Component | File | Props | Description |
|---|---|---|---|
| `PageShell` | `PageShell.tsx` | `icon, title, subtitle, stats?, children` | Universal panel layout wrapper |
| `StatCard` | `StatCard.tsx` | `label, value, color?, icon?` | Compact header stat tile with colored left bar |
| `Avatar` | `Avatar.tsx` | `username, size?` | Indigo initial-letter avatar circle |
| `PlatformBadge` | `PlatformBadge.tsx` | `platform` | Pill badge for SHOPEE/LAZADA/TIKTOK/OTHER |
| `SectionHeader` | `SectionHeader.tsx` | `title, count?, children?` | `h2` + count pill + right-side action slot |
| `ConfirmModal` | `ConfirmModal.tsx` | `title, message, detail?, confirmLabel?, cancelLabel?, tone?, busy?, onConfirm, onCancel` | createPortal modal replacing `window.confirm()`. `tone="danger"` → red gradient header with `!` icon; `tone="primary"` → blue gradient header with `?`. Inventory module migrated to it in v2.33.0; new pages must use it instead of native confirm. |

### Other components (root of `frontend/src/components/`)

| Component | File | Description |
|---|---|---|
| `DelayBadge` | `DelayBadge.tsx` | `D0`–`D4` delay level pill |
| `OrderTable` | `OrderTable.tsx` | Full inbound order table with delete support |
| `ScanInput` | `ScanInput.tsx` | Barcode scan input with Enter-to-submit |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Modal confirmation dialog |
| `BulkScanModal` | `BulkScanModal.tsx` | Bulk inbound scan — staging list, carrier dropdown, shop combobox; rendered via `createPortal` |
| `ProtectedRoute` | `ProtectedRoute.tsx` | Auth/role guard wrapper |

---

## CSS Class Reference (`frontend/src/index.css`)

### Panel Shell
| Class | Description |
|---|---|
| `.panel-root` | Full-viewport flex column wrapper — use on the outermost div of every panel |
| `.panel-header` | Sticky white header bar with bottom border and shadow |
| `.panel-header-inner` | Max-width 1280px centered row inside the header |
| `.panel-body` | Max-width 1280px centered content area with 28px/32px padding |

### Stat Cards
| Class | Description |
|---|---|
| `.stat-card` | White card with border, flex row, used for header metrics |
| `.stat-card-bar` | 4px wide colored left bar inside a stat card |
| `.stat-card-value` | Large (22px) bold metric number |
| `.stat-card-label` | Small (11px) uppercase muted label |

### Section Headers
| Class | Description |
|---|---|
| `.section-header` | Flex row: space-between for title and right actions |
| `.section-title` | `h2` reset: 15px/700 dark text, flex with gap for badge |
| `.count-badge` | Indigo pill for item counts |

### Data Tables
| Class | Description |
|---|---|
| `.data-table-wrap` | Scroll container with rounded border and subtle shadow |
| `.row-selected` | Blue tint for selected rows |
| `.row-d2` | Amber tint for D2 delay orders |
| `.row-d3` | Red tint for D3 delay orders |
| `.row-d4` | Red tint for D4 delay orders |

### Toolbar
| Class | Description |
|---|---|
| `.toolbar-card` | White card with flex space-between, used above tables |

### Buttons
| Class | Description |
|---|---|
| `.btn` | Base button reset — always combine with a variant |
| `.btn-primary` | Blue filled button |
| `.btn-outline` | Blue outlined button |
| `.btn-ghost` | Transparent button with light border |
| `.btn-danger` | Red outlined button (hover: red filled) |
| `.btn-sm` | Smaller padding/font size modifier |
| `.btn-assign` | Light-blue inline table action button |

### Form Controls
| Class | Description |
|---|---|
| `.styled-select` | Polished `<select>` with focus ring |

### Empty States
| Class | Description |
|---|---|
| `.empty-state` | Centered dashed-border empty container |
| `.empty-state-icon` | Large icon (44px) |
| `.empty-state-title` | Bold title text |
| `.empty-state-desc` | Muted description text |

### Grids
| Class | Description |
|---|---|
| `.stats-grid` | Auto-fill grid, min 220px columns, 14px gap |
| `.picker-stat-card` | Clickable picker workload card inside a grid — hover shows pointer cursor and elevated shadow |

### Modals
Modals are built inline (not a shared component).

**Standard pattern** (small/inline modals inside a panel):
```tsx
<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}>
  <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '680px', ... }}>
    {/* header / body / actions */}
  </div>
</div>
```

**createPortal pattern** (modals that must escape parent CSS stacking contexts):
```tsx
import { createPortal } from 'react-dom'

export default function MyModal({ onClose }: Props) {
  const modal = (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999 }}>
      <div style={{ background: '#fff', borderRadius: '16px', ... }}>
        {/* header / body / footer */}
      </div>
    </div>
  )
  return createPortal(modal, document.body)
}
```
Use `createPortal` when the parent panel has `transform`, `filter`, `will-change`, or `overflow: hidden` — these break `position: fixed` containment. `BulkScanModal` uses this pattern. `zIndex: 9999` ensures it renders above all other layers.

- Nested modals (e.g. confirm dialog on top of order modal) use `zIndex: 1100`
- Overlay click closes the modal (`onClick={onClose}` on overlay, `e.stopPropagation()` on inner panel)
- **Complete** confirm dialogs: green gradient header (`linear-gradient(135deg, #f0fdf4, #f7fef9)`) + checkmark icon
- **Remove/danger** confirm dialogs: red gradient header (`linear-gradient(135deg, #fef2f2, #fff5f5)`) + warning icon
- Both show tracking number pill in middle section; Cancel + action button in footer

### Legacy / Deprecated (do not use in new code)
| Class | Replacement |
|---|---|
| `.inbound-header-inner` | `.panel-header-inner` |
| `.inbound-body` | `.panel-body` |
| `.inbound-section-header` | `.section-header` |
| `.order-table-wrap` | `.data-table-wrap` |
| `.picker-admin-toolbar` | `.toolbar-card` |
| `.picker-admin-select` | `.styled-select` |
| `.picker-admin-btn-primary` | `.btn .btn-primary` |
| `.picker-admin-btn-outline` | `.btn .btn-outline` |
| `.picker-admin-btn-assign` | `.btn-assign` |
| `.picker-admin-stats-grid` | `.stats-grid` |

---

## Panel Structure

Every panel page must follow this structure:

```tsx
<PageShell
  icon="emoji"
  title="Panel Name"
  subtitle={`${user?.username} · ${user?.role}`}
  stats={<>
    <StatCard label="..." value={n} color={colors.primary} />
    {/* more StatCards */}
  </>}
>
  {/* Optional: ScanInput for inbound panels */}
  <SectionHeader title="Section Name" count={n} />
  
  {/* Table or content */}
  <div className="data-table-wrap">
    <table>...</table>
  </div>

  {/* Optional: secondary sections */}
  <div style={{ marginTop: '32px' }}>
    <SectionHeader title="Another Section" />
    <div className="stats-grid">...</div>
  </div>
</PageShell>
```

If you cannot use `PageShell` for some reason, replicate this exact DOM structure:

```html
<div class="panel-root">
  <header class="panel-header">
    <div class="panel-header-inner">
      <!-- icon + title/subtitle left, stats right -->
    </div>
  </header>
  <main class="panel-body">
    <!-- content -->
  </main>
</div>
```

---

## File Map

```
frontend/src/
├── theme.ts                          ← All design tokens (colors, radius, shadow, font)
├── index.css                         ← All CSS classes
├── pages/
│   ├── Inbound.tsx                   ← Inbound panel (uses PageShell)
│   ├── PickerAdmin.tsx               ← Picker admin panel (uses PageShell)
│   ├── PickerMobile.tsx              ← /picker handheld — PIN auth + order list (blue theme)
│   ├── PackerAdmin.tsx               ← Packer admin panel (uses PageShell)
│   ├── PackerMobile.tsx              ← /packer handheld — PIN auth + shared queue (green theme)
│   ├── Outbound.tsx                  ← /outbound — dispatch queue, comparison report, stuck orders
│   └── Login.tsx                     ← Login page (uses .login-* classes)
└── components/
    ├── shared/
    │   ├── PageShell.tsx             ← Panel layout wrapper
    │   ├── StatCard.tsx              ← Header stat tile
    │   ├── Avatar.tsx                ← Username initial avatar
    │   ├── PlatformBadge.tsx         ← Platform pill badge
    │   └── SectionHeader.tsx         ← Section h2 + count + actions
    ├── DelayBadge.tsx                ← Delay level badge
    ├── OrderTable.tsx                ← Inbound order table (carrier + shop columns)
    ├── ScanInput.tsx                 ← Barcode scan input
    ├── ConfirmDialog.tsx             ← Confirm modal
    ├── BulkScanModal.tsx             ← Phase 10: bulk scan staging modal (createPortal)
    ├── SlaAlertBanner.tsx            ← Phase 9: dismissible D4 alert banner (ADMIN + INBOUND_ADMIN only)
    └── ProtectedRoute.tsx            ← Auth guard
```
