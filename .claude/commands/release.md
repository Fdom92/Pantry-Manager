---
description: Walk a PantryMind release branch from code-complete to published
argument-hint: <version, e.g. 5.6>
disable-model-invocation: true
---

Release: $ARGUMENTS (branch `release/$ARGUMENTS`)

Do each step, report its result, and stop at every step marked **(developer)** — those need
a device, Play Console or an explicit go-ahead.

1. **Branch review** — run the `reviewer` agent over the whole branch against `develop`
   (`git diff develop...HEAD`), asking specifically for cross-commit interactions and
   device-only risks. Fix Critical/Important findings.
2. **Verify** — `npx ng lint`, `node scripts/check-icons.mjs`, the full test suite and
   `npx ng build --configuration production`, all green.
3. **Version** — bump `versionCode` (+1) and `versionName` in `android/app/build.gradle`, and
   `version` in `package.json` (and its lockfile header). Commit `chore(release): X.Y (versionCode N)`.
4. **Device QA (developer)** — debug APK via `npm run prepare:build` + Android Studio. Give them
   the checklist: every device-only item from the branch, plus onboarding, adding/consuming,
   the shopping list and receipt scanning.
5. **Internal testing track (developer)** — signed AAB from Android Studio on Play's internal
   track; confirm the release behaves as installed from Play (e.g. `install_source = 'play'`).
   R8 is on since 5.7: Play reads the `mapping.txt` the AAB already carries; Sentry does not.
   Upload it for readable Java/Kotlin stack traces (needs a Sentry auth token, never commit it):
   `npx @sentry/cli debug-files upload --org <org> --project <project> android/app/build/outputs/mapping/release/mapping.txt`
   Native debug symbols need the NDK installed in Android Studio (SDK Manager → SDK Tools → NDK);
   without it the AAB builds fine but Play keeps the "no native debug symbols" notice.
6. **Merge and tag (developer approves)** — `release/X.Y` → `develop` → `main`, tag `vX.Y`.
   Never push without explicit approval.
7. **After publishing** — update project memory with what shipped, what was verified on device,
   and what was deliberately left out.
