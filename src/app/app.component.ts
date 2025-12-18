import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { App as CapacitorApp } from '@capacitor/app';
import { ONBOARDING_STORAGE_KEY } from '@core/constants';
import { PantryService } from '@core/services/pantry.service';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { NavController } from '@ionic/angular';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(
    private readonly pantryService: PantryService,
    private readonly revenuecat: RevenuecatService,
    private readonly router: Router,
    private readonly navCtrl: NavController,
  ) {
    this.redirectToOnboardingIfFirstRun();
    void this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    await this.initializeRevenueCat();
    await this.pantryService.initialize();
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

  private redirectToOnboardingIfFirstRun(): void {
    try {
      const hasSeen = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      const alreadyOnboarding = this.router.url?.startsWith('/onboarding');
      if (!hasSeen && !alreadyOnboarding) {
        void this.navCtrl.navigateRoot('/onboarding');
      }
    } catch (err) {
      console.warn('[AppComponent] onboarding check failed', err);
    }
  }
}
