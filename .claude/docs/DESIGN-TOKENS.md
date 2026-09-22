# Design tokens

Source of truth: `src/theme/variables.scss` (tokens, light + dark) and `src/global.scss`
(global component rules). Read the values there; this file explains how to use them.

## Rules

- Never invent px/rem values or colours: pick the nearest token.
  Scales: `--app-theme-spacing-*` (2xs…5xl), `--app-theme-radius-*` (2xs…2xl, `pill`, `circle`),
  `--app-theme-font-size-*` (2xs…display), `--app-theme-font-weight-*`, `--app-theme-shadow-*`
  (xs…xl, `sheet`), `--app-theme-easing-*`.
- Every token has a dark-mode value; `color-mix()` on tokens stays dark-safe. Check both themes.
- Card default radius is `--app-theme-radius-md-plus`.

## Colour roles

| Token | Role |
|---|---|
| `--ion-color-primary` | Brand teal |
| `--app-theme-primary-deep` | Solid background under white text (AA) |
| `--app-theme-primary-on-surface` | Primary used **as text** on page/card (AA in both themes) |
| `--ion-color-secondary` | Warm neutral surface accent |
| `--ion-color-tertiary` | Violet — **PRO/premium only**, never a generic accent |
| `--ion-color-success` / `-warning` / `-danger` | States; `--app-theme-{success,warning}-deep` for text on tinted backgrounds |
| `--ion-color-medium` | Muted icons and secondary text |

Destructive actions are red: action-sheet `role: 'destructive'` buttons are coloured by a global
rule because Material mode doesn't colour them.

## Surfaces and patterns

- **Sheets**: `ion-modal.app-sheet-modal` + `.sheet-shell` flex column + footer; the global rule
  owns radius, background, density, sentence-case buttons and safe-area padding. Don't override
  per modal. A sheet whose content can be short may need `max-height` so its footer stays visible.
- **Glass**: `--app-theme-glass-*` on sticky bars (summary bar, tab bar), with a
  `@supports not (backdrop-filter)` fallback.
- **Tonal chips/buttons**: soft accent fill + deep accent text instead of solid colour.
- **Hover lift** (`--app-theme-card-hover-*`) only inside `@media (hover: hover)`.
- **Press feedback** on tappable rows: background tint, not scale, when the row contains its own
  button (the scale would leak to the whole row).

## Don't

- Reuse the PRO violet for anything else.
- Add ad-hoc coloured shadows; use `--app-theme-shadow-*`.
- Dim inactive states with `opacity`; use ghost vs filled.
- Rely on newer CSS (e.g. `:has()`) for anything essential: old Android WebViews drop the rule.
