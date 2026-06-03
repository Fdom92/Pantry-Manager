// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

import { Environment } from './environment.model';
import { environmentSecrets } from './environment.secrets';

export const environment: Environment = {
  production: false,
  revenueCatPublicKey: 'goog_XAdxxyRVPtpNaFLROJWzPwjdJNx',
  insightsApiUrl: 'https://pantry-manager-develop.onrender.com/insights/analyze',
  analytics: {
    // Free-tier limits us to 1 PostHog project so dev shares the prod key,
    // distinguished only by the `environment: 'dev'` super-prop. Real key is
    // loaded from `environment.secrets.ts` (gitignored).
    posthogKey: environmentSecrets.analytics.posthogKey,
    posthogHost: 'https://eu.i.posthog.com',
    // Flip to true to validate event wiring while developing.
    enabled: true,
    envTag: 'dev',
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
