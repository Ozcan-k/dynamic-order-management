# Design System — Dynamic Order Management

> **For future agents:** Read this file first before touching any frontend code.
> All design decisions are centralised here and in `frontend/src/theme.ts`.

---

## Rules (Non-negotiable)

1. **All UI text must be in English.** No Turkish, no other languages.
2. **Always import tokens from `frontend/src/theme.ts`.** Never hardcode hex values or sizes in components.
3. **Every panel page must use the `PageShell` component** (or the `panel-root / panel-header / panel-body` CSS class structure).
4. **Use shared components** from `frontend/src/components/shared/` instead of re-implementing them.
5. **Do not touch backend files** (`backend/`, `packages/shared/`).

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

### Other components (root of `frontend/src/components/`)

| Component | File | Description |
|---|---|---|
| `DelayBadge` | `DelayBadge.tsx` | `D0`–`D4` delay level pill |
| `OrderTable` | `OrderTable.tsx` | Full inbound order table with delete support |
| `ScanInput` | `ScanInput.tsx` | Barcode scan input with Enter-to-submit |
| `ConfirmDialog` | `ConfirmDialog.tsx` | Modal confirmation dialog |
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
Modals are built inline (not a shared component) with this overlay pattern:
```tsx
<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}>
  <div style={{ background: '#fff', borderRadius: '14px', maxWidth: '680px', ... }}>
    {/* header / body / actions */}
  </div>
</div>
```
- Nested modals (e.g. confirm dialog on top of order modal) use `zIndex: 1100`
- Overlay click closes the modal (`onClick={onClose}` on overlay, `e.stopPropagation()` on inner panel)
- Confirm dialogs use red gradient header (`linear-gradient(135deg, #fef2f2, #fff5f5)`) + trash icon

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
│   └── Login.tsx                     ← Login page (uses .login-* classes)
└── components/
    ├── shared/
    │   ├── PageShell.tsx             ← Panel layout wrapper
    │   ├── StatCard.tsx              ← Header stat tile
    │   ├── Avatar.tsx                ← Username initial avatar
    │   ├── PlatformBadge.tsx         ← Platform pill badge
    │   └── SectionHeader.tsx         ← Section h2 + count + actions
    ├── DelayBadge.tsx                ← Delay level badge
    ├── OrderTable.tsx                ← Inbound order table
    ├── ScanInput.tsx                 ← Barcode scan input
    ├── ConfirmDialog.tsx             ← Confirm modal
    └── ProtectedRoute.tsx            ← Auth guard
```
