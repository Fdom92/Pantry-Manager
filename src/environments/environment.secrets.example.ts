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
  revenuecat: {
    /** Google Play public SDK key for the **dev** RevenueCat project. */
    devKey: string;
    /** Google Play public SDK key for the **prod** RevenueCat project. */
    prodKey: string;
  };
  sentry: {
    /** Sentry DSN for the **dev** project. */
    devDsn: string;
    /** Sentry DSN for the **prod** project. */
    prodDsn: string;
  };
}

export const environmentSecrets: EnvironmentSecrets = {
  analytics: {
    // Replace with the value you copied from https://eu.posthog.com (Project Settings → Project API Key).
    posthogKey: '',
  },
  revenuecat: {
    // Copy from https://app.revenuecat.com → Project → API keys → "Public SDK keys".
    // Public-by-design (the mobile client needs them), but kept out of git so
    // scrapers can't harvest them from the public repo for abuse.
    devKey: '',
    prodKey: '',
  },
  sentry: {
    // Copy from https://sentry.io → Project → Settings → Client Keys (DSN).
    // Use the EU region (de.sentry.io) for GDPR alignment.
    devDsn: '',
    prodDsn: '',
  },
};
