/**
 * Event payload shape sent to the analytics provider.
 * Keep props flat and JSON-serializable. No PII (no item names, no free text).
 */
export type AnalyticsEventProps = Record<
  string,
  string | number | boolean | null | undefined
>;

/**
 * Persisted event entry used by the offline-first queue.
 * Stored in PouchDB while the user is offline or analytics is opted out.
 */
export interface QueuedAnalyticsEvent {
  /** Unique queue id (uuid). */
  id: string;
  /** Event name (see `ANALYTICS_EVENTS`). */
  event: string;
  /** Event-specific props. */
  props: AnalyticsEventProps;
  /** Timestamp (ms epoch) when the event was queued — used as `$timestamp`. */
  ts: number;
}

/**
 * Super-properties attached to every event. Resolved once at init and on locale / PRO changes.
 */
export interface AnalyticsSuperProps {
  app_version: string;
  platform: string;
  os_version: string;
  locale: string;
  is_pro: boolean;
  /** 'dev' or 'prod'. Used to filter local noise inside a shared PostHog project. */
  environment: 'dev' | 'prod';
}
