import { Capacitor } from '@capacitor/core';
import { Injectable, inject } from '@angular/core';
import { normalizePackages, pickPreferredPackage, resolveProStatus, type ProStatusInput } from '@core/domain/upgrade';
import { PACKAGE_TYPE, Purchases, PurchasesOffering, PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { LocalStorageService } from '../shared/local-storage.service';
import { LoggerService } from '../shared/logger.service';

/**
 * RevenueCat rejects with `userCancelled` when the user backs out of the native
 * purchase or restore sheet — the most common non-success outcome on this path,
 * and not a failure worth a crash report. The plugin exposes the flag either on
 * the error or inside `userInfo`; `PURCHASE_CANCELLED_ERROR` is code "1".
 */
function isUserCancellation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as {
    userCancelled?: unknown;
    code?: unknown;
    userInfo?: { userCancelled?: unknown } | null;
  };
  return candidate.userCancelled === true
    || candidate.userInfo?.userCancelled === true
    || candidate.code === '1';
}

@Injectable({
  providedIn: 'root',
})
export class UpgradeRevenuecatService {
  private readonly storage = inject(LocalStorageService);
  private readonly logger = inject(LoggerService);
  private userId: string | null = null;
  private readonly publicApiKey = environment.revenueCatPublicKey;
  private readonly proSubject = new BehaviorSubject<boolean>(this.loadStoredState());
  readonly isPro$: Observable<boolean> = this.proSubject.asObservable();
  private readonly trialEligibleSubject = new BehaviorSubject<boolean>(false);
  readonly hasUnusedTrial$: Observable<boolean> = this.trialEligibleSubject.asObservable();
  private readonly preferredPackageTypes: PACKAGE_TYPE[] = [
    PACKAGE_TYPE.MONTHLY,
    PACKAGE_TYPE.ANNUAL,
  ];

  isPro(): boolean {
    return this.proSubject.value;
  }

  /** Dev-only: force a specific PRO state for testing purposes. No-op in production. */
  setDevProState(isPro: boolean): void {
    if (environment.production) return;
    this.updateProState(isPro);
  }

  getUserId(): string | null {
    return this.userId;
  }

  /**
   * RevenueCat is a native-only plugin: under `ng serve` every call rejects
   * with "Web not supported in this plugin". That is an expected condition,
   * not a failure — and since `logger.error` captures a Sentry event, letting
   * it through files three fake issues on every dev page load, which is
   * exactly the noise that trains you to ignore this service's real errors.
   *
   * Every other native-only service in the app guards the same way.
   */
  private get isUnavailable(): boolean {
    return !Capacitor.isNativePlatform();
  }

  async init(userId: string): Promise<void> {
    this.userId = userId;
    if (this.isUnavailable) {
      return;
    }
    if (!this.publicApiKey) {
      this.logger.error('UpgradeRevenuecatService', 'missing public API key in environment');
      return;
    }
    try {
      await Purchases.configure({ apiKey: this.publicApiKey, appUserID: userId });
      Purchases.addCustomerInfoUpdateListener(info => {
        const isPro = this.extractIsPro(info);
        if (isPro === null) {
          this.logger.warn('UpgradeRevenuecatService', 'customerInfo update without entitlement data; keeping previous state');
          return;
        }
        this.updateProState(isPro);
        void this.refreshTrialEligibility();
      });
      const { customerInfo } = await Purchases.getCustomerInfo();
      const isPro = this.extractIsPro(customerInfo);
      if (isPro !== null) {
        this.updateProState(isPro);
      } else {
        this.logger.warn('UpgradeRevenuecatService', 'init: no entitlement data, keeping stored state');
      }
      await this.refreshTrialEligibility();
    } catch (err) {
      this.logger.error('UpgradeRevenuecatService', 'init error', err);
    }
  }

  async getOfferings(): Promise<PurchasesOffering | null> {
    if (this.isUnavailable) {
      return null;
    }
    try {
      const offerings = await Purchases.getOfferings();
      return offerings?.current ?? null;
    } catch (err) {
      this.logger.error('UpgradeRevenuecatService', 'getOfferings error', err);
      return null;
    }
  }

  async getAvailablePackages(): Promise<PurchasesPackage[]> {
    const offering = await this.getOfferings();
    if (!offering) {
      this.logger.warn('UpgradeRevenuecatService', 'no active offering available');
      return [];
    }

    const candidates = [
      offering.monthly,
      offering.annual,
      ...(offering.availablePackages ?? []),
    ].filter(Boolean) as PurchasesPackage[];

    const sorted = normalizePackages(candidates, this.preferredPackageTypes);

    this.logger.info(
      '[UpgradeRevenuecatService] available packages',
      sorted.map(pkg => `${pkg.packageType}:${pkg.identifier}`).join(', ')
    );

    if (!sorted.length) {
      this.logger.warn('UpgradeRevenuecatService', 'offering has no purchasable packages', {
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
    if (this.isUnavailable) {
      return false;
    }
    try {
      const result = await Purchases.purchasePackage({ aPackage });
      const isPro = this.extractIsPro(result?.customerInfo);
      if (isPro !== null) {
        this.updateProState(isPro);
      }
      return Boolean(isPro ?? this.isPro());
    } catch (err) {
      if (isUserCancellation(err)) {
        this.logger.warn('UpgradeRevenuecatService', 'purchase cancelled by the user', { err: String(err) });
      } else {
        this.logger.error('UpgradeRevenuecatService', 'purchasePackage error', err);
      }
      return false;
    }
  }

  async purchasePro(): Promise<boolean> {
    try {
      const selectedPackage = await this.getPreferredPackage();
      if (!selectedPackage) {
        this.logger.warn('UpgradeRevenuecatService', 'purchasePro aborted: no package available');
        return false;
      }
      return this.purchasePackage(selectedPackage);
    } catch (err) {
      this.logger.error('UpgradeRevenuecatService', 'purchasePro error', err);
      return false;
    }
  }

  async restore(): Promise<boolean> {
    if (this.isUnavailable) {
      return this.isPro();
    }
    try {
      const { customerInfo } = await Purchases.restorePurchases();
      const isPro = this.extractIsPro(customerInfo);
      if (isPro !== null) {
        this.updateProState(isPro);
      }
      return Boolean(isPro ?? this.isPro());
    } catch (err) {
      if (isUserCancellation(err)) {
        this.logger.warn('UpgradeRevenuecatService', 'restore cancelled by the user', { err: String(err) });
      } else {
        this.logger.error('UpgradeRevenuecatService', 'restore error', err);
      }
      return false;
    }
  }

  /**
   * Reads PRO status out of whatever RevenueCat handed back. The decision — and
   * the reasons it can fail to decide — live in resolveProStatus; this only
   * logs what happened, because a customer who cannot be classified is worth a
   * breadcrumb when the next real failure arrives.
   */
  private extractIsPro(info: ProStatusInput | null | undefined): boolean | null {
    const status = resolveProStatus(info);

    if (status.reason === 'entitlements-missing') {
      this.logger.warn('UpgradeRevenuecatService', 'entitlements missing in customer info', { info: String(info) });
    } else if (status.reason === 'active-subscriptions') {
      this.logger.warn('UpgradeRevenuecatService', 'entitlements empty but active subscriptions present', {
        activeSubs: status.activeSubscriptions,
      });
    } else if (status.reason === 'no-active-entitlements') {
      this.logger.warn('UpgradeRevenuecatService', 'no active entitlements found', {
        entitlements: status.entitlementKeys,
        activeSubs: status.activeSubscriptions,
      });
    }

    return status.isPro;
  }

  private updateProState(isPro: boolean): void {
    this.proSubject.next(isPro);
    this.storage.pro.setStatus(isPro);
  }

  private loadStoredState(): boolean {
    return this.storage.pro.getStatus() ?? false;
  }

  /** Recomputes trial eligibility from the current offering's intro price. */
  async refreshTrialEligibility(): Promise<void> {
    try {
      const offering = await this.getOfferings();
      if (!offering) {
        this.trialEligibleSubject.next(false);
        return;
      }
      if (this.isPro()) {
        // Already PRO — never offer a trial CTA.
        this.trialEligibleSubject.next(false);
        return;
      }
      // Only inspect monthly/annual product slots — matches the rest of the
      // service (getAvailablePackages prefers these). Custom non-standard
      // packages with introPrice are intentionally ignored to keep the CTA
      // path predictable.
      const monthlyTrial = offering.monthly?.product?.introPrice?.price === 0;
      const annualTrial = offering.annual?.product?.introPrice?.price === 0;
      this.trialEligibleSubject.next(monthlyTrial || annualTrial);
    } catch (err) {
      this.logger.error('UpgradeRevenuecatService', 'refreshTrialEligibility error', err);
      this.trialEligibleSubject.next(false);
    }
  }
}
