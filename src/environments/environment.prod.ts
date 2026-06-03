import { Environment } from './environment.model';
import { environmentSecrets } from './environment.secrets';

export const environment: Environment = {
  production: true,
  revenueCatPublicKey: 'goog_QWDXnEcbnxIKMCjuMLHcOtwxmrR',
  insightsApiUrl: 'https://pantry-manager.onrender.com/insights/analyze',
  analytics: {
    posthogKey: environmentSecrets.analytics.posthogKey,
    posthogHost: 'https://eu.i.posthog.com',
    enabled: true,
    envTag: 'prod',
  },
};
