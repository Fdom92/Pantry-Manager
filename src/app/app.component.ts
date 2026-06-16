import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { App as CapacitorApp } from '@capacitor/app';
import { PantryQueryService } from '@core/services/pantry';
import { LocalStorageService } from '@core/services/shared';
import { UpgradeRevenuecatService } from '@core/services/upgrade';
import { NotificationSchedulerService } from '@core/services/notifications';
import { RecoveryNotificationsService } from '@core/services/notifications/recovery-notifications.service';
import { SyncService } from '@core/services/sync/sync.service';
import { AnalyticsService } from '@core/services/analytics';
import { AppUpdateService } from '@core/services/app-update';
import { StreakStateService, StreakMilestoneService } from '@core/services/retention';
import { ANALYTICS_EVENTS } from '@core/constants';
// STORAGE_KEYS removed: callers go through LocalStorageService.
import { NavController } from '@ionic/angular';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly handledUrls = new Set<string>();
  private wasProLastCheck: boolean | null = null;

  // DI
  private readonly destroyRef = inject(DestroyRef);
  private readonly pantryQuery = inject(PantryQueryService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);
  private readonly notificationScheduler = inject(NotificationSchedulerService);
  private readonly recoveryNotif = inject(RecoveryNotificationsService);
  private readonly syncService = inject(SyncService);
  private readonly analytics = inject(AnalyticsService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly appUpdate = inject(AppUpdateService);
  private readonly streak = inject(StreakStateService);
  private readonly streakMilestone = inject(StreakMilestoneService);

  constructor() {
    this.redirectToFirstRunFlows();
    void this.initializeApp();
    this.subscribeToNavigation();
  }

  /**
   * Emits a `tab_viewed` analytics event for every top-level route change.
   * Strips query params and only takes the first path segment to keep the
   * cardinality low and stable in PostHog.
   */
  private subscribeToNavigation(): void {
    // Blur the active element before the transition begins. Ionic flags the
    // outgoing page with `aria-hidden="true"` (the `ion-page-hidden` class),
    // and the browser logs a violation if a descendant of that page still
    // owns focus — typically the tab-bar button the user just tapped.
    this.router.events
      .pipe(filter((evt): evt is NavigationStart => evt instanceof NavigationStart))
      .subscribe(() => {
        const el = (typeof document !== 'undefined' ? document.activeElement : null) as
          | (HTMLElement | null);
        if (el && typeof el.blur === 'function') {
          el.blur();
        }
      });

    this.router.events
      .pipe(filter((evt): evt is NavigationEnd => evt instanceof NavigationEnd))
      .subscribe((evt) => {
        const path = (evt.urlAfterRedirects ?? evt.url ?? '').split('?')[0];
        const segment = path.split('/').filter(Boolean)[0] ?? 'root';
        this.analytics.track(ANALYTICS_EVENTS.TAB_VIEWED, { tab: segment });
      });
  }

  private async initializeApp(): Promise<void> {
    await this.initializeRevenueCat();
    this.streakMilestone.bootstrap();
    await this.streak.bootstrap();
    await this.analytics.bootstrap();
    this.analytics.track(ANALYTICS_EVENTS.APP_OPEN);
    // Ask Google Play whether a newer build is available. Fire-and-forget
    // so the rest of the boot sequence is never blocked by a slow store
    // check. The service no-ops on web / non-native platforms.
    void this.appUpdate.checkAndPrompt();
    await this.pantryQuery.initialize();
    await this.pantryQuery.ensureFirstPageLoaded();
    this.pantryQuery.startBackgroundLoad();
    await this.notificationScheduler.scheduleAll();
    // User opened the app — recovery nudges are no longer relevant.
    void this.recoveryNotif.cancelRecoveryWindow();
    await this.handleSyncLaunchUrl();
    this.listenForSyncIntents();
  }

  private async handleSyncLaunchUrl(): Promise<void> {
    try {
      if (sessionStorage.getItem('sync:postReload')) {
        sessionStorage.removeItem('sync:postReload');
        return;
      }
      const result = await CapacitorApp.getLaunchUrl();
      const url = result?.url;
      if (url && this.isSyncFileUrl(url)) {
        this.markHandled(url);
        await this.syncService.handleIncomingIntent(url);
      }
    } catch {
      // getLaunchUrl not available in web context
    }
  }

  private listenForSyncIntents(): void {
    CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      if (url && this.isSyncFileUrl(url) && !this.handledUrls.has(url)) {
        this.markHandled(url);
        void this.syncService.handleIncomingIntent(url);
      }
    });
  }

  private markHandled(url: string): void {
    this.handledUrls.add(url);
    setTimeout(() => this.handledUrls.delete(url), 10_000);
  }

  private isSyncFileUrl(url: string): boolean {
    return url.startsWith('content://') || url.startsWith('file://');
  }

  private async initializeRevenueCat(): Promise<void> {
    const userId = this.getOrCreateUserId();
    await this.revenuecat.init(userId);
    this.detectTrialExpiry();

    // Foreground/background bookkeeping: tracks "session" boundaries from the
    // analytics point of view. On Capacitor, "closing" the app from the user
    // perspective normally means swiping it away from the recents list, which
    // surfaces as `isActive = false` first.
    let lastForegroundAt = Date.now();
    CapacitorApp.addListener('appStateChange', async state => {
      if (state.isActive) {
        this.analytics.track(ANALYTICS_EVENTS.APP_FOREGROUNDED);
        lastForegroundAt = Date.now();
        void this.recoveryNotif.cancelRecoveryWindow();
        await this.revenuecat.restore();
        this.detectTrialExpiry();
        await this.notificationScheduler.scheduleAll();
        void this.streak.bootstrap();
      } else {
        this.analytics.track(ANALYTICS_EVENTS.APP_BACKGROUNDED, {
          session_duration_s: Math.round((Date.now() - lastForegroundAt) / 1000),
        });
      }
    });

    this.revenuecat.isPro$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.detectTrialExpiry());
  }

  private getOrCreateUserId(): string {
    const stored = this.localStorage.revenuecat.getUserId();
    if (stored) return stored;
    const generated = (crypto?.randomUUID?.() ?? `user-${Date.now()}`);
    this.localStorage.revenuecat.setUserId(generated);
    return generated;
  }

  private redirectToFirstRunFlows(): void {
    try {
      const currentUrl = this.router.url ?? '';
      const alreadyOnboarding = currentUrl.startsWith('/onboarding');
      if (!this.localStorage.onboarding.isSeen() && !alreadyOnboarding) {
        void this.navCtrl.navigateRoot('/onboarding');
      }
    } catch (err) {
      console.warn('[AppComponent] first-run check failed', err);
    }
  }

  /**
   * Fires `pro_trial_expired` exactly once after a trial-started user's PRO
   * status flips from true to false. Idempotent across app launches via the
   * `PRO_TRIAL_EXPIRED_FIRED` localStorage flag.
   */
  private detectTrialExpiry(): void {
    const isPro = this.revenuecat.isPro();
    const trialStartedAt = this.localStorage.pro.getTrialStartedAt();
    const fired = this.localStorage.pro.isTrialExpiredFired();

    if (!trialStartedAt || fired) {
      this.wasProLastCheck = isPro;
      return;
    }
    if (this.wasProLastCheck === true && isPro === false) {
      this.analytics.track(ANALYTICS_EVENTS.PRO_TRIAL_EXPIRED);
      this.localStorage.pro.markTrialExpiredFired();
    }
    this.wasProLastCheck = isPro;
  }
}
