export interface Environment {
  production: boolean;
  revenueCatPublicKey: string;
  insightsApiUrl: string;
  analytics: AnalyticsEnvironment;
}

export interface AnalyticsEnvironment {
  /** PostHog project API key (public). Empty string disables analytics entirely. */
  posthogKey: string;
  /** Ingest host. EU region recommended for GDPR. */
  posthogHost: string;
  /** When false, even opted-in users won't send (dev safety). */
  enabled: boolean;
  /**
   * Logical env label sent as a super-property on every event.
   * Lets you filter out dev/local noise inside the PostHog dashboard
   * when sharing a single project between builds.
   */
  envTag: 'dev' | 'prod';
}
