/**
 * Where the running APK came from. 'unknown' is never produced here: it is
 * what the caller reports when it could not ask at all (web, plugin failure).
 *
 * Why it exists: every production APK installed from Android Studio for QA
 * showed up in PostHog as a new real user — the developer's phone counted as
 * three people, and the only PRO purchase of the period was a tester one.
 * Filtering on `install_source = 'play'` removes them without anyone having
 * to remember to mark a device.
 */
export type InstallSourceKind = 'play' | 'sideload' | 'other' | 'unknown';

const PLAY_STORE = 'com.android.vending';
const SIDELOAD_INSTALLERS: ReadonlySet<string> = new Set([
  'com.google.android.packageinstaller',
  'com.android.packageinstaller',
  'com.android.shell',
]);

export function classifyInstallSource(installer: string | null | undefined): InstallSourceKind {
  if (!installer) return 'sideload';
  if (installer === PLAY_STORE) return 'play';
  if (SIDELOAD_INSTALLERS.has(installer)) return 'sideload';
  return 'other';
}
