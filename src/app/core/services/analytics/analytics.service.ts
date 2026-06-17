import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { App as CapacitorApp } from '@capacitor/app';
import { Device } from '@capacitor/device';
import { TranslateService } from '@ngx-translate/core';
import posthog, { type PostHog } from 'posthog-js';
import { environment } from 'src/environments/environment';
import { ANALYTICS_EVENTS } from '@core/constants';
import { LocalStorageService } from '../shared/local-storage.service';
import type {
  AnalyticsEventProps,
  AnalyticsSuperProps,
} from '@core/models/analytics';
import { LoggerService } from '../shared/logger.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { UpgradeRevenuecatService } from '../upgrade/upgrade-revenuecat.service';

/**
 * AnalyticsService — single facade for product analytics.
 *
 * Design goals:
 * - **Consent-gated**: never sends until user opts in via preferences.
 * - **Offline-friendly**: posthog-js persists events to localStorage and retries —
 *   no custom queue needed.
 * - **Vendor-abstracted**: callers use `track(name, props)` constants from
 *   `ANALYTICS_EVENTS`. Swapping providers later means changing only this file.
 * - **No PII**: only IDs, kinds, counts and source labels are emitted by callers.
 *   The provider runs with `autocapture: false` to avoid implicit DOM scraping.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly prefs = inject(SettingsPreferencesService);
  private readonly logger = inject(LoggerService);
  private readonly translate = inject(TranslateService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly localStorage = inject(LocalStorageService);

  private posthog: PostHog | null = null;
  private superProps: AnalyticsSuperProps | null = null;

  // Signals so UI (Settings page) can react.
  private readonly readySignal = signal(false);
  private readonly optedInSignal = signal(false);
  readonly isReady = computed(() => this.readySignal());
  readonly isOptedIn = computed(() => this.optedInSignal());

  /**
   * Bootstrap: called once from `AppComponent`. Reads consent from preferences.
   * If consent is granted → initialises posthog-js. Otherwise stays idle.
   */
  async bootstrap(): Promise<void> {
    if (!this.isProviderConfigured()) {
      this.logger.info('[Analytics] provider disabled or missing key — skipping init');
      return;
    }

    const prefs = await this.prefs.getPreferences();
    this.superProps = await this.resolveSuperProps();
    this.subscribeToReactiveSuperProps();

    // Keep the localStorage mirror used by the Sentry `beforeSend` gate aligned
    // with the canonical PouchDB preference. Important after a backup-restore
    // or any path that bypasses `optIn/optOut`.
    this.localStorage.errorReporting.setEnabled(prefs.analyticsEnabled === true);

    if (prefs.analyticsEnabled === true) {
      this.startPosthog();
    } else {
      // Either never-asked (undefined) or explicit opt-out (false) — stay idle.
      this.logger.info('[Analytics] consent not granted — track() will no-op');
    }
  }

  /**
   * Wire RevenueCat PRO status and ngx-translate locale changes into super-props.
   * Idempotent: takeUntilDestroyed unsubscribes when the root injector is torn down.
   */
  private subscribeToReactiveSuperProps(): void {
    this.revenuecat.isPro$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isPro) => this.setSuperProps({ is_pro: isPro }));

    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evt) => this.setSuperProps({ locale: evt.lang }));
  }

  /**
   * Record consent decision. Persists to preferences and starts/stops the provider.
   */
  async optIn(): Promise<void> {
    const current = await this.prefs.getPreferences();
    await this.prefs.savePreferences({
      ...current,
      analyticsEnabled: true,
      analyticsDecidedAt: new Date().toISOString(),
    });
    // Mirror to localStorage so the Sentry `beforeSend` callback (which runs
    // before PouchDB is ready) can read consent synchronously on next launch.
    this.localStorage.errorReporting.setEnabled(true);
    if (this.isProviderConfigured() && !this.posthog) {
      this.startPosthog();
    } else if (this.posthog) {
      this.posthog.opt_in_capturing();
    }
    this.optedInSignal.set(true);
    this.track(ANALYTICS_EVENTS.ANALYTICS_OPT_IN);
  }

  async optOut(): Promise<void> {
    const current = await this.prefs.getPreferences();
    await this.prefs.savePreferences({
      ...current,
      analyticsEnabled: false,
      analyticsDecidedAt: new Date().toISOString(),
    });
    this.localStorage.errorReporting.setEnabled(false);
    // Send opt-out event BEFORE killing the client so it actually flushes.
    this.track(ANALYTICS_EVENTS.ANALYTICS_OPT_OUT);
    if (this.posthog) {
      this.posthog.opt_out_capturing();
      this.posthog.reset();
    }
    this.optedInSignal.set(false);
    this.readySignal.set(false);
  }

  /**
   * Mark the current device as an internal/developer device so it can be
   * filtered out of PostHog dashboards with `is_internal ≠ true`.
   * Call once per device from the dev panel; the property persists on the
   * PostHog Person profile across sessions.
   */
  markAsInternal(): void {
    if (!this.posthog) return;
    this.posthog.people.set({ is_internal: true });
    this.logger.info('[Analytics] device marked as internal');
  }

  getDistinctId(): string | undefined {
    return this.posthog?.get_distinct_id();
  }

  /**
   * Track a product event. No-op if not opted in or not initialised.
   */
  track(event: string, props?: AnalyticsEventProps): void {
    if (!this.posthog || !this.readySignal()) {
      return;
    }
    try {
      this.posthog.capture(event, this.sanitizeProps(props));
    } catch (err) {
      this.logger.warn('[Analytics] track failed', { event, err });
    }
  }

  /**
   * Update super-properties — called when PRO status changes or locale switches.
   */
  setSuperProps(partial: Partial<AnalyticsSuperProps>): void {
    if (!this.superProps) {
      return;
    }
    this.superProps = { ...this.superProps, ...partial };
    if (this.posthog) {
      this.posthog.register(this.buildRegisterPayload());
    }
  }

  /**
   * Compose the props passed to `posthog.register()`. Adds privacy flags that
   * are not part of `AnalyticsSuperProps` but must ride along with every event.
   *
   * - `$geoip_disable: true` tells the PostHog ingestion server to skip the
   *   IP-based geolocation enrichment (city / lat-lng / postal code), which
   *   would otherwise contradict the "no location" promise in the consent
   *   screen copy.
   */
  private buildRegisterPayload(): Record<string, unknown> {
    return {
      ...(this.superProps ?? {}),
      $geoip_disable: true,
    };
  }

  // --- Internals ---------------------------------------------------------

  private isProviderConfigured(): boolean {
    const cfg = environment.analytics;
    return Boolean(cfg && cfg.enabled && cfg.posthogKey);
  }

  private startPosthog(): void {
    const cfg = environment.analytics;
    try {
      this.posthog = posthog.init(cfg.posthogKey, {
        api_host: cfg.posthogHost,
        // Privacy + lean-by-default:
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        persistence: 'localStorage',
        // Respect Do Not Track headers if the WebView ever sets them.
        respect_dnt: true,
        // We manage opt-in/out manually via preferences.
        opt_out_capturing_by_default: false,
        // Strip browser-injected props that either leak coarse location
        // (timezone) or duplicate first-class super-props (browser language ≡
        // our `locale`). Server-side GeoIP enrichment is already disabled via
        // `$geoip_disable` in `buildRegisterPayload()`.
        property_blacklist: [
          '$timezone',
          '$timezone_offset',
          '$browser_language',
          '$browser_language_prefix',
        ],
        loaded: (ph) => {
          ph.register(this.buildRegisterPayload());
          this.readySignal.set(true);
          this.optedInSignal.set(true);
          this.logger.info('[Analytics] posthog ready');
        },
      }) as PostHog;
    } catch (err) {
      this.logger.error('[Analytics] posthog init failed', err);
      this.posthog = null;
      this.readySignal.set(false);
    }
  }

  private async resolveSuperProps(): Promise<AnalyticsSuperProps> {
    const [appInfo, deviceInfo] = await Promise.all([
      CapacitorApp.getInfo().catch(() => null),
      Device.getInfo().catch(() => null),
    ]);
    return {
      app_version: appInfo?.version ?? 'unknown',
      platform: deviceInfo?.platform ?? 'web',
      os_version: deviceInfo?.osVersion ?? 'unknown',
      locale: this.translate.currentLang ?? 'unknown',
      is_pro: this.revenuecat.isPro(),
      environment: environment.analytics.envTag,
    };
  }

  /**
   * Strip undefined values and cap string length to avoid bloated payloads.
   */
  private sanitizeProps(props?: AnalyticsEventProps): AnalyticsEventProps {
    if (!props) return {};
    const out: AnalyticsEventProps = {};
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined) continue;
      out[k] = typeof v === 'string' && v.length > 200 ? v.slice(0, 200) : v;
    }
    return out;
  }
}
