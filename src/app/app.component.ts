import { Component, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { App as CapacitorApp } from '@capacitor/app';
import { STORAGE_KEYS } from '@core/constants';
import { PantryQueryService } from '@core/services/pantry';
import { MigrationPantryService } from '@core/services/migration/migration-pantry.service';
import { UpgradeRevenuecatService } from '@core/services/upgrade';
import { NotificationSchedulerService } from '@core/services/notifications';
import { RecoveryNotificationsService } from '@core/services/notifications/recovery-notifications.service';
import { SyncService } from '@core/services/sync/sync.service';
import { AnalyticsService } from '@core/services/analytics';
import { ANALYTICS_EVENTS } from '@core/constants';
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

  // DI
  private readonly pantryQuery = inject(PantryQueryService);
  private readonly pantryMigration = inject(MigrationPantryService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);
  private readonly notificationScheduler = inject(NotificationSchedulerService);
  private readonly recoveryNotif = inject(RecoveryNotificationsService);
  private readonly syncService = inject(SyncService);
  private readonly analytics = inject(AnalyticsService);

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
    await this.analytics.bootstrap();
    this.analytics.track(ANALYTICS_EVENTS.APP_OPEN);
    await this.pantryQuery.initialize();
    await this.pantryMigration.migrateIfNeeded();
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
        await this.notificationScheduler.scheduleAll();
      } else {
        this.analytics.track(ANALYTICS_EVENTS.APP_BACKGROUNDED, {
          session_duration_s: Math.round((Date.now() - lastForegroundAt) / 1000),
        });
      }
    });
  }

  private getOrCreateUserId(): string {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.REVENUECAT_USER_ID);
      if (stored) return stored;
      const generated = (crypto?.randomUUID?.() ?? `user-${Date.now()}`);
      localStorage.setItem(STORAGE_KEYS.REVENUECAT_USER_ID, generated);
      return generated;
    } catch {
      return 'local-user';
    }
  }

  private redirectToFirstRunFlows(): void {
    try {
      const hasSeenOnboarding = localStorage.getItem(STORAGE_KEYS.ONBOARDING_FLAG);
      const currentUrl = this.router.url ?? '';
      const alreadyOnboarding = currentUrl.startsWith('/onboarding');
      if (!hasSeenOnboarding && !alreadyOnboarding) {
        void this.navCtrl.navigateRoot('/onboarding');
      }
    } catch (err) {
      console.warn('[AppComponent] first-run check failed', err);
    }
  }
}
