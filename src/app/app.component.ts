import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { PantryService } from '@core/services/pantry.service';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { App as CapacitorApp } from '@capacitor/app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(
    private readonly pantryService: PantryService,
    private readonly revenuecat: RevenuecatService,
  ) {
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
}
