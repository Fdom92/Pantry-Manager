import { InjectionToken } from '@angular/core';
import { addBreadcrumb, captureException } from '@sentry/angular';

export interface SentryBreadcrumb {
  level?: 'warning';
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface SentryCaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

/**
 * Indirection over the Sentry SDK so LoggerService can be tested with a double.
 * The real implementation is the SDK itself; consent is enforced upstream by the
 * `beforeSend` hook configured in `main.ts`.
 */
export interface SentryReporter {
  captureException(error: unknown, context?: SentryCaptureContext): void;
  addBreadcrumb(breadcrumb: SentryBreadcrumb): void;
}

export const SENTRY_REPORTER = new InjectionToken<SentryReporter>('SENTRY_REPORTER', {
  providedIn: 'root',
  factory: (): SentryReporter => ({
    captureException: (error, context) => captureException(error, context),
    addBreadcrumb: breadcrumb => addBreadcrumb(breadcrumb),
  }),
});
