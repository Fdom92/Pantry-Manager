import { Injectable, inject } from '@angular/core';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { RevenuecatService } from './revenuecat.service';

@Injectable({ providedIn: 'root' })
export class UpgradeStoreService {
  private readonly revenuecat = inject(RevenuecatService);

  readonly isPro$ = this.revenuecat.isPro$;

  isPro(): boolean {
    return this.revenuecat.isPro();
  }

  async getAvailablePackages(): Promise<PurchasesPackage[]> {
    return this.revenuecat.getAvailablePackages();
  }

  async purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
    return this.revenuecat.purchasePackage(pkg);
  }

  async restore(): Promise<boolean> {
    return this.revenuecat.restore();
  }
}

