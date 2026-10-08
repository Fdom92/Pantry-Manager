/**
 * Screens where the Android back button has nowhere left to navigate to, so it means
 * "leave the app": the four tab roots and onboarding. Everything else (settings and
 * its sub-pages, upgrade) sits above a tab and must pop first.
 *
 * Ionic's NavController handler always pops and then hands over to lower-priority
 * handlers, so the exit prompt cannot just sit below it: it has to decide first,
 * by URL, whether this is such a screen.
 */
const EXIT_SCREEN_PATHS: ReadonlySet<string> = new Set([
  '/dashboard',
  '/pantry',
  '/insights',
  '/list',
  '/onboarding',
]);

export function isExitScreenUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return EXIT_SCREEN_PATHS.has(path);
}
