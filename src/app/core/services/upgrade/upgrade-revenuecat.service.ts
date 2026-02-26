import { Injectable } from '@angular/core';
import { STORAGE_KEY_PRO } from '@core/constants';
import { normalizePackages, pickPreferredPackage } from '@core/domain/upgrade';
import { PACKAGE_TYPE, Purchases, PurchasesOffering, PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class UpgradeRevenuecatService {
  private userId: string | null = null;
  private readonly publicApiKey = environment.revenueCatPublicKey;
  private readonly proSubject = new BehaviorSubject<boolean>(this.loadStoredState());
  readonly isPro$: Observable<boolean> = this.proSubject.asObservable();
  readonly canUseAgent$: Observable<boolean> = this.isPro$.pipe(map(isPro => isPro || !environment.production));
  private readonly preferredPackageTypes: PACKAGE_TYPE[] = [
    PACKAGE_TYPE.MONTHLY,
    PACKAGE_TYPE.ANNUAL,
  ];

  isPro(): boolean {
    return this.proSubject.value;
  }

  canUseAgent(): boolean {
    return !environment.production || this.isPro();
  }

  /** Dev-only: force a specific PRO state for testing purposes. No-op in production. */
  setDevProState(isPro: boolean): void {
    if (environment.production) return;
    this.updateProState(isPro);
  }

  getUserId(): string | null {
    return this.userId;
  }

  async init(userId: string): Promise<void> {
    this.userId = userId;
    if (!this.publicApiKey) {
      console.error('[UpgradeRevenuecatService] missing public API key in environment');
      return;
    }
    try {
      await Purchases.configure({ apiKey: this.publicApiKey, appUserID: userId });
      Purchases.addCustomerInfoUpdateListener((info: any) => {
        const isPro = this.extractIsPro(info);
        if (isPro === null) {
          console.warn('[UpgradeRevenuecatService] customerInfo update without entitlement data; keeping previous state');
          return;
        }
        this.updateProState(isPro);
      });
      const info = await Purchases.getCustomerInfo();
      const isPro = this.extractIsPro(info);
      if (isPro !== null) {
        this.updateProState(isPro);
      } else {
        console.warn('[UpgradeRevenuecatService] init: no entitlement data, keeping stored state');
      }
    } catch (err) {
      console.error('[UpgradeRevenuecatService] init error', err);
    }
  }

  async getOfferings(): Promise<PurchasesOffering | null> {
    try {
      const offerings = await Purchases.getOfferings();
      return offerings?.current ?? null;
    } catch (err) {
      console.error('[UpgradeRevenuecatService] getOfferings error', err);
      return null;
    }
  }

  async getAvailablePackages(): Promise<PurchasesPackage[]> {
    const offering = await this.getOfferings();
    if (!offering) {
      console.warn('[UpgradeRevenuecatService] no active offering available');
      return [];
    }

    const candidates = [
      offering.monthly,
      offering.annual,
      ...(offering.availablePackages ?? []),
    ].filter(Boolean) as PurchasesPackage[];

    const sorted = normalizePackages(candidates, this.preferredPackageTypes);

    console.info(
      '[UpgradeRevenuecatService] available packages',
      sorted.map(pkg => `${pkg.packageType}:${pkg.identifier}`).join(', ')
    );

    if (!sorted.length) {
      console.warn('[UpgradeRevenuecatService] offering has no purchasable packages', {
        available: offering.availablePackages?.map(pkg => ({
          identifier: pkg.identifier,
          type: pkg.packageType,
        })),
      });
    }

    return sorted;
  }

  async getPreferredPackage(): Promise<PurchasesPackage | null> {
    return pickPreferredPackage(await this.getAvailablePackages(), this.preferredPackageTypes);
  }

  async purchasePackage(aPackage: PurchasesPackage): Promise<boolean> {
    try {
      const result = await Purchases.purchasePackage({ aPackage });
      const isPro = this.extractIsPro(result?.customerInfo);
      if (isPro !== null) {
        this.updateProState(isPro);
      }
      return Boolean(isPro ?? this.isPro());
    } catch (err) {
      console.error('[UpgradeRevenuecatService] purchasePackage error', err);
      return false;
    }
  }

  async purchasePro(): Promise<boolean> {
    try {
      const selectedPackage = await this.getPreferredPackage();
      if (!selectedPackage) {
        console.warn('[UpgradeRevenuecatService] purchasePro aborted: no package available');
        return false;
      }
      return this.purchasePackage(selectedPackage);
    } catch (err) {
      console.error('[UpgradeRevenuecatService] purchasePro error', err);
      return false;
    }
  }

  async restore(): Promise<boolean> {
    try {
      const info = await Purchases.restorePurchases();
      const isPro = this.extractIsPro(info);
      if (isPro !== null) {
        this.updateProState(isPro);
      }
      return Boolean(isPro ?? this.isPro());
    } catch (err) {
      console.error('[UpgradeRevenuecatService] restore error', err);
      return false;
    }
  }

  private extractIsPro(info: any): boolean | null {
    const entitlements = info?.entitlements?.active ?? info?.subscriber?.entitlements?.active;
    if (!entitlements) {
      console.warn('[UpgradeRevenuecatService] entitlements missing in customer info', { info });
      return null;
    }
    const keys = Object.keys(entitlements);
    // accept common names or any active entitlement as PRO
    if (entitlements['pro'] || entitlements['premium']) {
      return true;
    }
    const anyActive = keys.some(key => {
      const value = entitlements[key];
      return Boolean(value?.isActive ?? value);
    });
    if (anyActive) {
      return true;
    }
    const activeSubs: string[] =
      info?.activeSubscriptions ??
      info?.subscriber?.activeSubscriptions ??
      info?.subscriber?.allPurchasedProductIdentifiers ??
      [];
    if (activeSubs.length) {
      console.warn('[UpgradeRevenuecatService] entitlements empty but active subscriptions present', { activeSubs });
      return true;
    }
    console.warn('[UpgradeRevenuecatService] no active entitlements found', { entitlements: keys, activeSubs });
    return false;
  }

  private updateProState(isPro: boolean): void {
    this.proSubject.next(isPro);
    try {
      localStorage.setItem(STORAGE_KEY_PRO, JSON.stringify(isPro));
    } catch (err) {
      console.warn('[UpgradeRevenuecatService] failed to persist state', err);
    }
  }

  private loadStoredState(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PRO);
      return raw ? JSON.parse(raw) : false;
    } catch {
      return false;
    }
  }
}
