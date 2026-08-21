import { Injectable, inject, isDevMode } from '@angular/core';
import { SENTRY_REPORTER } from './sentry-reporter';

/**
 * Centralized logging service that respects development/production modes.
 * - In development: All logs are enabled
 * - In production: Only warn and error logs are enabled
 */
@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  private readonly isDev = isDevMode();
  private readonly prefix = '[PantryManager]';
  private readonly sentry = inject(SENTRY_REPORTER);

  /**
   * Log informational messages (development only)
   */
  log(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.log(`${this.prefix} ${message}`, ...args);
    }
  }

  /**
   * Log debug messages (development only)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.debug(`${this.prefix} [DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Log informational messages (development only)
   */
  info(message: string, ...args: unknown[]): void {
    if (this.isDev) {
      console.info(`${this.prefix} [INFO] ${message}`, ...args);
    }
  }

  /**
   * Non-fatal condition. Always printed; leaves a Sentry breadcrumb so it gives
   * context to the next captured error, without creating an event of its own.
   */
  warn(scope: string, message: string, extra?: Record<string, unknown>): void {
    console.warn(`${this.prefix} [${scope}] ${message}`, extra ?? '');
    this.sentry.addBreadcrumb({ level: 'warning', category: scope, message, data: extra });
  }

  /**
   * Failure the user suffers. Always printed and always reported to Sentry.
   * Consent is enforced upstream by the `beforeSend` hook in `main.ts`.
   */
  error(scope: string, message: string, err?: unknown, extra?: Record<string, unknown>): void {
    console.error(`${this.prefix} [${scope}] ${message}`, err ?? '', extra ?? '');
    const error = err instanceof Error
      ? err
      : new Error(err === undefined ? message : `${message}: ${String(err)}`);
    this.sentry.captureException(error, {
      tags: { scope },
      extra: { message, ...extra },
    });
  }

  /**
   * Start a performance timer (development only)
   */
  time(label: string): void {
    if (this.isDev) {
      console.time(`${this.prefix} ${label}`);
    }
  }

  /**
   * End a performance timer (development only)
   */
  timeEnd(label: string): void {
    if (this.isDev) {
      console.timeEnd(`${this.prefix} ${label}`);
    }
  }

  /**
   * Group console logs (development only)
   */
  group(label: string): void {
    if (this.isDev) {
      console.group(`${this.prefix} ${label}`);
    }
  }

  /**
   * End console group (development only)
   */
  groupEnd(): void {
    if (this.isDev) {
      console.groupEnd();
    }
  }
}
