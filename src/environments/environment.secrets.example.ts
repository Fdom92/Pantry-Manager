/**
 * TEMPLATE — committed to git as a reference. Copy this file to
 * `environment.secrets.ts` (gitignored) and fill in real values.
 *
 * The real `environment.secrets.ts` MUST stay out of version control because
 * the repo is public and scrapers harvest API keys from public repos within
 * minutes.
 *
 * NOTE: every value here ends up bundled into the JS that ships with the APK.
 * Hardcoding into `environment.ts` would leak the key to any GitHub search;
 * splitting it out only buys us *some* protection (the key is still in the
 * APK and a determined attacker can extract it). For real protection in the
 * future, proxy ingest through your own backend.
 */
import type { AnalyticsEnvironment } from './environment.model';

export interface EnvironmentSecrets {
  analytics: Pick<AnalyticsEnvironment, 'posthogKey'>;
}

export const environmentSecrets: EnvironmentSecrets = {
  analytics: {
    // Replace with the value you copied from https://eu.posthog.com (Project Settings → Project API Key).
    posthogKey: '',
  },
};
