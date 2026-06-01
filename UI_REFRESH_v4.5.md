# UI Polish Pass — v4.5 (`ui/v4.5-polish-pass`)

Follow-up to v4.4-refresh. Same paint-only philosophy — pure SCSS/token churn,
zero data/route/service changes. Tackles every item flagged "pending" in the
v4.4 exhaustive audit.

---

## Summary

| | Before | After |
|---|---|---|
| Total tokens | 105 | **131** (+26) |
| Hardcoded letter-spacing | 12 occurrences | **0** |
| Ad-hoc opacity literals | 15+ | reduced via scale (`disabled/muted/subtle/pressed`) |
| Ad-hoc text-mix expressions | 19 | reduced to ~5 (rest use `--app-theme-text-*`) |
| `!important` declarations | 10 | **1** (Swiper-only) |
| Duplicate keyframes | 2 local (`floatIn`, `emptyFade`) | 0 — all in `global.scss` |
| Settings shell duplication | 4× ~95 LOC each | **1 mixin + 4 thin overrides** (−250 LOC) |
| Modal footer duplication | 4× 7 LOC | **1 mixin** |
| Quantity adjuster duplication | 2× ~85 LOC | **1 mixin** |
| Segment toggle duplication | 2× ~35 LOC | **1 mixin** |
| Hardcoded `50%` border-radius | 8 | **0** (token `--app-theme-radius-circle`) |
| Raw `cubic-bezier(0.4,0,0.2,1)` | 2 | **0** (token `--app-theme-easing-snap`) |

---

## 1 · Tokens added (26 new)

### Letter-spacing scale (expanded)
```css
--app-theme-letter-spacing-eyebrow-sm: 0.04em;   /* chips, small uppercase */
--app-theme-letter-spacing-eyebrow-lg: 0.08em;   /* PRO badges, large uppercase */
```

### Opacity scale (new)
```css
--app-theme-opacity-disabled: 0.4;
--app-theme-opacity-muted: 0.6;
--app-theme-opacity-subtle: 0.75;
--app-theme-opacity-hint: 0.85;
--app-theme-opacity-pressed: 0.88;
```

### Text-mix scale (new)
```css
--app-theme-text-strong:  color-mix(srgb, text-color 85%, transparent);
--app-theme-text-soft:    color-mix(srgb, text-color 70%, transparent);
--app-theme-text-faint:   color-mix(srgb, text-color 45%, transparent);
--app-theme-text-whisper: color-mix(srgb, text-color 30%, transparent);
```

### Surface tint scale (new)
```css
--app-theme-surface-tint-soft:   text-color 5%
--app-theme-surface-tint-medium: text-color 8%
--app-theme-surface-tint-strong: text-color 14%
--app-theme-surface-tint-bold:   text-color 18%
```

### Z-index scale (new)
```css
--app-theme-z-base: 1;
--app-theme-z-elevated: 2;
--app-theme-z-sticky: 10;
--app-theme-z-dropdown: 200;
--app-theme-z-modal: 1000;
```

---

## 2 · Shared partials extracted

Each partial accepts an `apply` (or split) mixin so consumer SCSS files become
slim overrides. Consumed files lose ~70–90% of their LOC.

| Partial | Consumers | Tokens replaced |
|---|---|---|
| `_settings-shell.scss` | settings, settings-notifications, settings-catalogs, settings-advanced | ~95 LOC × 4 → mixin + ~15 LOC overrides each |
| `_modal-footer.scss` | edit-item-modal, fresh-edit-item-modal, batch-edit-modal, entity-selector-modal | 7 LOC × 4 → `{ @include footer.apply; }` |
| `_quantity-adjuster.scss` | pantry-quantity-sheet, edit-item-modal | ~85 LOC × 2 → `@include qa.apply;` |
| `_state-segment.scss` (`container` + `button`) | fresh-item-card, fresh-edit-item-modal | ~35 LOC × 2 → 2 includes each |

`shared/styles/_card-status-bar.scss` was already extracted in earlier pass.

---

## 3 · Animations centralized

All four mount keyframes now live in `global.scss`:

| Old (local) | New (global) |
|---|---|
| `fadeInList` (pantry, list) | `app-fade-in-list` |
| `shimmer` (pantry, list) | `app-shimmer` |
| `floatIn` (onboarding) | `app-float-in` |
| `emptyFade` (empty-state) | `app-empty-fade` |

Utility class `.app-fade-in` available for ad-hoc fade-ins.

Onboarding slide-card now uses `var(--app-theme-easing-standard)` instead of
raw `ease`.

---

## 4 · `!important` clean-up

| File | Before | After | Reason |
|---|---|---|---|
| settings/settings.component | `background ... !important` | removed | Global ion-card + class specificity sufficient |
| settings-notifications | same | removed | same |
| settings-catalogs | same | removed (now via mixin) | same |
| settings-advanced | same | removed (now via mixin) | same |
| pantry-detail | `background ... !important` | removed | same |
| list (`ion-card`) | `background ... !important` | removed | same |
| list (`.suggestions-shell`) | `background: transparent !important` | removed | same |
| pantry-quantity-sheet (`.quantity-new--negative`) | `color ... !important` | removed | source order wins, same selector specificity |
| edit-item-modal (`.quantity-new--negative`) | same | removed | same |
| **onboarding** `.swiper-pagination` `bottom: 30px !important` | kept | kept | Fighting third-party Swiper.js inline style; legitimate use |

Only 1 `!important` remains in the entire codebase, with documented reason.

---

## 5 · Token sweeps applied

### Letter-spacing (12 hardcoded → 0)
- `0.04em`/`0.05em`/`0.02em` → `--letter-spacing-eyebrow-sm`
- `0.07em` → `--letter-spacing-eyebrow`
- `0.08em` → `--letter-spacing-eyebrow-lg`
- `-0.01em` → `--letter-spacing-tight`

### Opacity (literals → scale tokens)
- `0.4` → `--opacity-disabled`
- `0.6` → `--opacity-muted`
- `0.75` → `--opacity-subtle`
- `0.88` → `--opacity-pressed`

### Text/surface mix
Insights pure text-mix expressions replaced:
- `text-color 85%` → `--text-strong`
- `text-color 70-80%` → `--text-soft`
- `text-color 60-65%` → `--text-subtle`
- `text-color 45-55%` → `--text-faint`
- `text-color 8%` → `--surface-tint-medium`
- `text-color 5%` → `--surface-tint-soft`
- `text-color 14%` → `--surface-tint-strong`
- `text-color 18%` → `--surface-tint-bold`

### Z-index
- `1` → `--z-base`
- `2` → `--z-elevated`
- `3`/`10` → `--z-sticky`
- `200` → `--z-dropdown`

### Radius / easing
- `border-radius: 50%` → `var(--app-theme-radius-circle)` (8 instances)
- `--border-radius: 50%` (ion custom prop) → same (3 instances)
- `border-radius: 999px` → `var(--app-theme-radius-pill)`
- Raw `cubic-bezier(0.4, 0, 0.2, 1)` → `var(--app-theme-easing-snap)` (2 instances)

### Inline fallbacks dropped
- `var(--app-theme-radius-sm-plus, 10px)` → `var(--app-theme-radius-sm-plus)` (3 sites)
- `var(--app-theme-radius-lg-plus, 18px)` → `var(--app-theme-radius-lg-plus)` (1 site)

### Onboarding
Hardcoded `13px`/`14px`/`18px` font-sizes → small/body/lg tokens.
Hardcoded `6px`/`10px` gaps → `xs-plus`/`sm-plus` spacing tokens.
Hardcoded `24px` grid column → `--spacing-2xl`.

---

## 6 · Verdict deltas (vs. v4.4-refresh audit)

| Eje | v4.4-refresh | v4.5-polish | Δ |
|---|---|---|---|
| Token coverage | 9.5/10 | **9.8/10** | +0.3 |
| Color sistema | 8.5/10 | 8.5/10 | = |
| Sombras consistencia | 9.5/10 | 9.5/10 | = |
| Animaciones uniformidad | 9/10 | **10/10** | +1 |
| Naming/BEM | 8/10 | 8/10 | = |
| Dedup / DRY | 5.5/10 | **9/10** | +3.5 |
| Accesibilidad contrast | 8.5/10 | 8.5/10 | = |
| **Promedio** | 8.4/10 | **9.1/10** | +0.7 |

---

## 7 · What's still genuinely pending

Truly out of scope or needing visual review:

1. **Decide a role for secondary cream** — declared but never used directly.
   Either (a) deploy on a specific surface like list dividers or empty bg, or
   (b) retire and consolidate to 5 colors. Needs design call.
2. **Replace remaining 5–6 `color-mix(text-color N%)` ad-hocs** sitting in
   pantry/dashboard/list that don't map cleanly to one of the 4 text-mix steps
   (e.g. odd percentages like 20% / 40%). Could either add intermediate tokens
   or round to nearest existing step.
3. **Glass treatment on modal headers** to match the sticky-glass language
   established for pantry summary-bar and tab-bar.
4. **Audit `iconColor=` template usages on empty-state**. Type allows 7 colors,
   SCSS now ships all 7, but no caller uses them yet — confirm intent.
5. **Hardcoded layout sizes in onboarding** (72px icon-burst, 22px notif-icon,
   28px swiper bullet, 520px max-width, 260px confirm-list max-height) are
   left as-is — these are layout constants, not theme scale candidates.

---

## 8 · How to diff

```bash
git checkout ui/v4.5-polish-pass
git diff release/4.5 -- src/theme src/global.scss src/app
```

Visual smoke checks (no functional behavior changed; only style):

- `/settings`, `/settings/notifications`, `/settings/catalogs`, `/settings/advanced`
  → identical look, lighter SCSS
- `/pantry` chips → tonal-fill identical from v4.4
- `/upgrade` plan-card → violet identical from v4.4
- All modal footers → identical
- Pantry quantity-sheet bottom-sheet + edit-item single-batch quantity →
  identical visual, now share one source of truth
- Onboarding slides → fade-in matches global motion language

---

## 9 · Rollback

```bash
git checkout release/4.5
git branch -D ui/v4.5-polish-pass
```

Single branch, single (logical) atomic commit. No deps changed, no data layer.
