import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App as CapacitorApp } from '@capacitor/app';
import { STORAGE_KEYS } from '@core/constants';
import { PantryQueryService } from '@core/services/pantry';
import { MigrationPantryService } from '@core/services/migration/migration-pantry.service';
import { UpgradeRevenuecatService } from '@core/services/upgrade';
import { NotificationSchedulerService } from '@core/services/notifications';
import { SyncService } from '@core/services/sync/sync.service';
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
  private readonly syncService = inject(SyncService);

  constructor() {
    this.redirectToFirstRunFlows();
    void this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    await this.initializeRevenueCat();
    await this.pantryQuery.initialize();
    await this.pantryMigration.migrateIfNeeded();
    await this.pantryQuery.ensureFirstPageLoaded();
    this.pantryQuery.startBackgroundLoad();
    await this.notificationScheduler.scheduleAll();
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
    CapacitorApp.addListener('appStateChange', async state => {
      if (state.isActive) {
        await this.revenuecat.restore();
        await this.notificationScheduler.scheduleAll();
      }
    });
  }

  private getOrCreateUserId(): string {
    const key = 'revenuecat:userId';
    try {
      const stored = localStorage.getItem(key);
      if (stored) return stored;
      const generated = (crypto?.randomUUID?.() ?? `user-${Date.now()}`);
      localStorage.setItem(key, generated);
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
