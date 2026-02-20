import { Injectable, isDevMode } from '@angular/core';

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

  /**
   * Log informational messages (development only)
   */
  log(message: string, ...args: any[]): void {
    if (this.isDev) {
      console.log(`${this.prefix} ${message}`, ...args);
    }
  }

  /**
   * Log debug messages (development only)
   */
  debug(message: string, ...args: any[]): void {
    if (this.isDev) {
      console.debug(`${this.prefix} [DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Log informational messages (development only)
   */
  info(message: string, ...args: any[]): void {
    if (this.isDev) {
      console.info(`${this.prefix} [INFO] ${message}`, ...args);
    }
  }

  /**
   * Log warning messages (always enabled)
   */
  warn(message: string, ...args: any[]): void {
    console.warn(`${this.prefix} [WARN] ${message}`, ...args);
  }

  /**
   * Log error messages (always enabled)
   */
  error(message: string, error?: Error | any, ...args: any[]): void {
    if (error instanceof Error) {
      console.error(`${this.prefix} [ERROR] ${message}`, error, ...args);
    } else {
      console.error(`${this.prefix} [ERROR] ${message}`, error, ...args);
    }
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
