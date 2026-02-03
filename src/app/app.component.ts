import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App as CapacitorApp } from '@capacitor/app';
import { ONBOARDING_STORAGE_KEY } from '@core/constants';
import { PantryService } from '@core/services/pantry';
import { PantryMigrationService } from '@core/services/migration/pantry-migration.service';
import { RevenuecatService } from '@core/services/upgrade';
import { NavController } from '@ionic/angular';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  // DI
  private readonly pantryService = inject(PantryService);
  private readonly pantryMigration = inject(PantryMigrationService);
  private readonly revenuecat = inject(RevenuecatService);
  private readonly router = inject(Router);
  private readonly navCtrl = inject(NavController);

  constructor() {
    this.redirectToFirstRunFlows();
    void this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    await this.initializeRevenueCat();
    await this.pantryService.initialize();
    await this.pantryMigration.migrateIfNeeded();
    await this.pantryService.ensureFirstPageLoaded();
    this.pantryService.startBackgroundLoad();
  }

  private async initializeRevenueCat(): Promise<void> {
    const userId = this.getOrCreateUserId();
    await this.revenuecat.init(userId);
    CapacitorApp.addListener('appStateChange', async state => {
      if (state.isActive) {
        await this.revenuecat.restore();
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
      const hasSeenOnboarding = localStorage.getItem(ONBOARDING_STORAGE_KEY);
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
