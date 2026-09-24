# PantryMind — Claude Context

PantryMind is a local-first Android app (Angular 20 + Ionic 8 + Capacitor 7) for managing a
pantry and a shopping list. No account: all user data lives on the device (PouchDB). A PRO
tier (RevenueCat) unlocks AI features served by a small backend. The repository is **public**:
never commit secrets or personal data.

## Stack

- **App**: Angular 20 — standalone components only, signals, control flow `@if/@for/@let`
- **Mobile**: Ionic 8 (Material "md" mode) + Capacitor 7. **Android only** (no `ios/`)
- **State**: signals in services; one facade `*StateService` per page. No NgRx/NGXS stores.
  RxJS only where an external API needs it (router, RevenueCat, app state events)
- **Storage**: PouchDB (`pantry-db`, offline-first, no sync) + `localStorage` for per-device flags
- **Backend** (`backend/`): Express + OpenAI (gpt-4o-mini). PRO-only endpoints behind
  `verifyPro`: AI insights and smart receipt parsing
- **Observability**: PostHog (analytics) and Sentry (errors), both only after user consent
- **i18n**: ngx-translate, 6 bundles in `src/assets/i18n` (es is the source language)

## Layout

- `src/app/core/domain` — pure business logic (no Angular), each file with a `.spec.ts`
- `src/app/core/services` — state, storage, Capacitor plugins. Page-scoped services are
  `@Injectable()` and listed in the page's `providers`; root services use `providedIn: 'root'`
- `src/app/core/{models,constants,utils}` — types, constants (`ANALYTICS_EVENTS`, `STORAGE_KEYS`…), helpers
- `src/app/features` — pages: `dashboard`, `pantry` (despensa + fresh + receipt scan), `list`
  (shopping list), `insights`, `settings` (incl. dev panel), `onboarding`, `upgrade`, `tabs`
- `src/app/shared` — reusable UI components
- `android/app/src/main/java/com/fdom/pantrymind` — `MainActivity` + local Capacitor plugins
- `.claude/docs/` — deeper references: GLOSSARY, PATTERNS, I18N, STORAGE, DESIGN-TOKENS

## Commands

```bash
npm start                                              # dev server (browser)
npx ng lint
node scripts/check-icons.mjs                           # every template icon is registered
npx ng test --watch=false --browsers=ChromeHeadless    # add --include='<path>' for one spec
npx ng build --configuration production
npm run prepare:build                                  # web build + cap sync, then run from Android Studio
```

CI (`.github/workflows/ci.yml`) runs lint, check-icons, tests and the production build.

## Conventions

- English for code, comments, commits. Spanish domain words stay as they are in the UI
  (`despensa`, `pendientes`). Comments explain *why*; no boilerplate JSDoc.
- Conventional Commits. Git flow: `release/X.Y` → `develop` → `main` + tag `vX.Y`.
- Business rules go in `core/domain` as pure functions with tests, written test-first.
- Every user-visible string is an i18n key present in **all 6 bundles**; never hardcode text.
  Don't rename existing keys: analytics uses some of them as identifiers (`empty_state_shown`).
- Analytics: event names in `ANALYTICS_EVENTS` (`core/constants/analytics/events.constants.ts`),
  snake_case, **flat** props only (string/number/boolean). No names or free text.
- Dates and spans of days shown to the user go through `DateDisplayService` or its pipes
  (`appExpiry`, `appRelativeDays`, `appDuration`, `appDate`). Never `toLocaleDateString`,
  `DatePipe` or `{{days}} días` in a bundle: i18n strings carry the frame (`Caduca {{when}}`).
- User feedback through `ToastService` (i18n keys), errors through `LoggerService`
  (`error` → Sentry, `warn` → breadcrumb). No `console.*` in `src/app`.

## Before calling a change done

1. `npx ng lint`, `node scripts/check-icons.mjs`, tests, **and the production build**.
   Tests don't mount page components, so a template calling a deleted method only fails the build.
2. Run it in the browser (`npm start`) when the change is visible there.
3. List what only a device can prove — camera, OCR, notifications, native plugins, in-app
   purchases — for manual QA with a debug APK. A green CI has shipped real bugs before.
4. Before merging `release/X.Y` → `main` (publishing to Play also publishes `docs/` on GitHub
   Pages): run the `landing-reviewer` agent if the release changed what's free vs PRO or shipped
   a user-facing feature. The landing page is hand-maintained, not generated — it drifts silently.

## Known traps

- Ionic controllers (`ModalController`, …) must come from `@ionic/angular/standalone` when
  injected in root services; the `@ionic/angular` one isn't provided and blanks the app at boot.
- Anything classified by time (expired, near expiry, waste window) reads `ClockService.now()`
  inside its `computed`/effect. A bare `new Date()` there freezes: Android resumes the app the
  next day with no data change, so nothing recomputes.
- Data read only in `ionViewWillEnter` goes stale: the hook doesn't fire on a tab page when
  coming back from `/settings`, nor in the browser dev server. Derive from signals instead.
- Before deleting a method, grep its bare name in `.html` templates, not only in `.ts`.
- New icons: register them in `src/app/app-icons.ts`. `check-icons` only sees templates, not
  icons passed from TypeScript (action sheets).
- The browser can't open the camera/gallery sheet or run OCR: receipt scanning is APK-only.
- Receipt parser (`core/domain/receipt`): every rule cites the real ticket that needed it and
  comes with that ticket as a test fixture. Layout-specific readers live in their own files.
- `notification_received` almost never fires (needs a live WebView); use
  `notification_delivered_seen`. When analysing PostHog, filter `install_source = 'play'`
  to exclude development installs.

## Don't

- Add NgModules, NgRx/NGXS, or RxJS where a signal works.
- Add accounts, login or cloud sync — the app is local-first by design.
- Break offline behaviour: every free feature must work without network.
- Commit `src/environments/environment.secrets.ts`, `backend/.env` or `.claude/settings.local.json`.
