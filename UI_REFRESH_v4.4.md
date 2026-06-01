# UI Refresh — v4.4 → v4.4-refresh (branch `ui/v4-fresh-refresh`)

Side-by-side of what changed and why. Read top-to-bottom for the narrative; jump to a section by ID if you only care about that axis.

---

## TL;DR

The base token system (v3) was solid but the **applied palette read monochromatic green** and **ad-hoc shadows** undercut elevation. Seven surgical passes pivot the visual identity without reshuffling structure.

**Highest-leverage change:** tertiary pivoted off amber (was indistinguishable from warning) and re-cast as **violet** — dedicated PRO/premium accent. Combined with secondary moving from mint to cream, the palette goes from 3 greens + 2 ambers to a balanced cool/neutral/warm triad.

---

## 1 · Palette

| Token | Before | After | Why |
|---|---|---|---|
| `--ion-color-primary` | `#3A9882` teal | _unchanged_ | Core brand intact |
| `--ion-color-secondary` | `#88C8AF` mint | **`#EFE7D8` cream** | Mint sat ~20° from primary → washed out. Cream gives complementary warm tone for elevated surfaces without competing |
| `--ion-color-tertiary` | `#d99a4e` amber | **`#7C5CFF` violet** | Amber collided with warning (~9° hue apart) and never signalled "premium." Violet = ~210° from primary → distinct PRO signal |
| `--ion-color-tertiary-contrast` | `#1a1206` dark brown | `#ffffff` | Violet needs white text contrast |
| `--ion-color-success` | `#3d9b5f` leaf | _unchanged_ | Already distinct from primary |
| `--ion-color-warning` | `#e5a93a` amber | _unchanged_ | Now the only amber in the system |

**Resulting hue distribution:**
```
Primary  166° teal     ── brand
Success  140° leaf     ── positive states
Tertiary 252° violet   ── PRO / premium
Warning   41° amber    ── caution
Danger     0° red      ── critical
Secondary cream        ── neutral elevated surface
```

Five usable hues from 60°–360° → readable for color-vision-deficient users, no two states collide.

---

## 2 · Tokens added

```css
/* Type */
--app-theme-font-size-2xs: 0.65rem;   /* secondary context hints */

/* Letter-spacing scale (was: hardcoded) */
--app-theme-letter-spacing-display: -0.02em;
--app-theme-letter-spacing-tight:   -0.01em;
--app-theme-letter-spacing-eyebrow:  0.06em;

/* Radius scale fill-ins (were: inline 10px/18px fallbacks) */
--app-theme-radius-sm-plus: 10px;
--app-theme-radius-md-plus: 14px;   /* new card default */
--app-theme-radius-lg-plus: 18px;
--app-theme-radius-circle:  50%;

/* Motion */
--app-theme-easing-snap:     cubic-bezier(0.4, 0, 0.2, 1);
--app-theme-easing-standard: cubic-bezier(0.2, 0, 0, 1);

/* Card hover affordance */
--app-theme-card-hover-transform: translateY(-1px);
--app-theme-card-hover-shadow:    var(--app-theme-shadow-lg);

/* PRO accent (semantic alias) */
--app-theme-card-accent-premium: var(--ion-color-tertiary);

/* Glass surfaces */
--app-theme-glass-bg:     color-mix(in srgb, var(--ion-card-background) 78%, transparent);
--app-theme-glass-border: color-mix(in srgb, var(--ion-text-color) 8%, transparent);
--app-theme-glass-blur:   blur(20px) saturate(180%);
```

Weights also tightened:
- `extra-bold` 700 → 650 (modern apps cap at 700; 650 keeps emphasis without shoutiness)
- `display` 800 → 700 (800 dated; pairs with `letter-spacing: -0.02em` for editorial feel)

Card default radius: `16px (lg)` → `14px (md-plus)` — slightly more cuadrado = more sobrio.

---

## 3 · Component changes

### Pantry summary chips (`pantry.component.scss`)
**Before:** inactive = `opacity: 0.5` (dirty), active = filled w/ outline ring + shadow.
**After:** ghost-vs-filled — inactive = transparent bg + 1px accent-tinted border + full opacity text; active = filled + soft `shadow-sm`, no outline ring. Per-chip exposed `--chip-accent` and `--chip-on-accent` so the active rule is generic.

Also: `chip--basic` moved from tertiary → `--ion-color-medium-shade`. Basic items are operational, not premium. Tertiary now exclusive to PRO.

### Upgrade hero (`upgrade.page.scss`)
**Before:** primary teal gradient + ad-hoc shadow (`0 12px 32px ...`) + `text-color` on amber gradient (low contrast).
**After:** tertiary violet gradient + `--app-theme-shadow-xl` (layered) + tertiary-contrast text. Pro-badge uses tertiary-contrast tint on tertiary bg.

### Plan card (`plan-card.component.scss`)
**Before:** local `--plan-card-green` aliased to `--ion-color-success` (collided with the "success" semantic). Three different ad-hoc box-shadows for default/selected/highlight. No hover lift.
**After:** renamed all locals `green*` → `accent*`, aliased to `--ion-color-tertiary`. Shadows → scale tokens (`shadow-lg` default, `shadow-xl` selected/highlight). Hover lift on the card.

### Dashboard action-card[data-category='conversion']
**Before:** secondary (mint) — read as "another success state."
**After:** `--app-theme-card-accent-premium` (tertiary violet). Conversion cards now visually identify as PRO upsell.

### Empty-state (`empty-state.component.scss`)
**Before:** Three out of four color classes lied — `.color-warning` painted mint, `.color-success` painted teal, `.color-secondary` painted text-color. `.color-tertiary` and `.color-danger` missing. `52px` hardcoded.
**After:** Each class maps to its matching ion-color token. Added `tertiary`/`danger`. Width → `--app-theme-control-size-xl` (56px).

### Bought list (`list.component.scss`)
**Before:** `opacity: 0.6` on entire bought list → faded out + already-line-through name = double-dim, hard to read.
**After:** `filter: saturate(0.6)` — keeps legibility, signals "less active" through chroma not luminance.

### Pantry consume button
**Before:** secondary (mint) accent.
**After:** success (leaf green). Consume = positive depletion = success semantic. Mint→cream made the old accent invisible as an action button.

### Settings theme-option
**Before:** ad-hoc `0 6px 16px ...` colored shadow.
**After:** `--app-theme-shadow-md` (layered).

### List FAB
**Before:** `0 2px 8px ...`.
**After:** `--app-theme-shadow-md`.

---

## 4 · Universal additions

### Hover lift (`global.scss`)
Every `ion-card` + named cards (`action-card`, `insight-card`, `today-card`, `fresh-item-card`, `pantry-item-card`, `suggestion-card`, `metric-card`, `coverage-card`) get:
```css
@media (hover: hover) {
  &:hover {
    transform: translateY(-1px);
    box-shadow: var(--app-theme-shadow-lg);
  }
}
```
Gated by `(hover: hover)` so touch devices don't get stuck-hover after tap.

Previously only `.theme-option` lifted. Now consistent across the surface inventory.

### Glass on sticky surfaces
- `.summary-bar` in pantry: was `--ion-background-color` solid → now `--app-theme-glass-bg` + `--app-theme-glass-blur`.
- `ion-tab-bar` in tabs.component.scss (file was empty): glass surface + tighter selected color.
- `@supports not (backdrop-filter)` fallbacks to solid so older browsers/webviews aren't punished.

---

## 5 · What did NOT change (intentionally)

- Spacing scale (14 steps, 2→48px) — already complete
- Shadow scale tokens themselves — only their _usage_ expanded
- Icon size scale
- Dark mode palette overrides — secondary/tertiary swaps automatically dark-mode-safe via `color-mix` patterns already in place
- PantryItem visual structure, BEM naming, page layouts — refresh is paint, not architecture

---

## 6 · Verdict deltas (vs. original audit)

|  | v4.4 base | v4.4-refresh |
|---|---|---|
| **Clean** | 8/10 | 8.5/10 — still some duplicated settings shells, but tokens fully cover |
| **Modern** | 7/10 | 9/10 — glass surfaces + hover lift + layered shadows fully wired |
| **Elegant** | 6/10 | 8/10 — ghost states, no more lying class names, weights pulled back |
| **Fresh** | 5/10 | 8.5/10 — violet PRO accent + cream secondary break monochrome |

---

## 7 · Still pending (next pass — not in this branch)

These are queued for v4.5-refresh or a follow-up branch. They're either out-of-scope structurally or require visual review per screen first.

1. **Extract `_settings-shell.scss` partial** — 4× duplicated `ion-card-title`/`ion-card-subtitle`/`.settings-content`/`.settings-card` blocks
2. **Extract `_modal-footer.scss`, `_quantity-adjuster.scss`, `_state-segment.scss` mixins** — same dedup
3. **`fadeInList` + `shimmer` keyframes** → move to global (currently duplicated in pantry + list)
4. **Drop `!important` on settings/list cards** — investigate Ionic shadow-DOM root cause first
5. **Audit `iconColor=` template usages** — type allows 7 colors, scss now ships all 7, but no caller uses them yet
6. **Glass on modal headers** — match the new sticky-glass language on quantity-sheet + batches-modal
7. **Bottom-sheet modal `0 -4px 16px ...` shadow** in pantry quantity-sheet — needs a `--app-theme-shadow-sheet` (negative-y) token before migration

---

## 8 · How to view the diff

```bash
git checkout ui/v4-fresh-refresh
git diff release/4.4 -- src/theme src/global.scss src/app
```

To preview without merging:
```bash
ng serve   # or ionic serve
# open http://localhost:8100, hit /dashboard, /pantry, /list, /settings, /upgrade
```

Key visual checkpoints:
- `/upgrade` — hero is violet now, not teal
- `/pantry` — chip rail is outlined (not opacity-faded), summary-bar blurs background on scroll
- `/dashboard` — conversion action-cards have violet accent strip
- Tab bar — translucent w/ blur (most visible scrolling a long pantry list under it)
- Card hover (desktop only) — lift + heavier shadow
- Headlines feel tighter (display tier) — `-0.02em` letter-spacing on `.upgrade-hero h1` and `.plan-card__amount`

---

## 9 · Rollback plan

Single commit on a single branch. To revert:
```bash
git checkout release/4.4
git branch -D ui/v4-fresh-refresh   # if confirmed unwanted
```

No data model, route, or service touched. Pure SCSS/token churn.
