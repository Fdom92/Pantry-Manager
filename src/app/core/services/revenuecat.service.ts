import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Purchases } from '@revenuecat/purchases-capacitor';

const PUBLIC_API_KEY = 'REVENUECAT_PUBLIC_API_KEY';
const STORAGE_KEY = 'revenuecat:isPro';

@Injectable({
  providedIn: 'root',
})
export class RevenuecatService {
  private initialized = false;
  private userId: string | null = null;
  private readonly proSubject = new BehaviorSubject<boolean>(this.loadStoredState());
  readonly isPro$: Observable<boolean> = this.proSubject.asObservable();

  async init(userId: string): Promise<void> {
    this.userId = userId;
    try {
      await Purchases.configure({ apiKey: PUBLIC_API_KEY, appUserID: userId });
      Purchases.addCustomerInfoUpdateListener((info: any) => {
        this.updateProState(this.extractIsPro(info));
      });
      const info = await Purchases.getCustomerInfo();
      this.updateProState(this.extractIsPro(info));
      this.initialized = true;
    } catch (err) {
      console.error('[RevenuecatService] init error', err);
    }
  }

  getUserId(): string | null {
    return this.userId;
  }

  async getOfferings(): Promise<any | null> {
    try {
      const offerings = await Purchases.getOfferings();
      return offerings?.current ?? null;
    } catch (err) {
      console.error('[RevenuecatService] getOfferings error', err);
      return null;
    }
  }

  async purchasePro(): Promise<boolean> {
    try {
      const offering = await this.getOfferings();
      const monthly = offering?.availablePackages?.find((pkg: any) => pkg.packageType === 'MONTHLY') ?? offering?.monthly;
      if (!monthly) {
        return false;
      }
      const result = await Purchases.purchasePackage(monthly);
      const isPro = this.extractIsPro(result?.customerInfo);
      this.updateProState(isPro);
      return Boolean(isPro);
    } catch (err) {
      console.error('[RevenuecatService] purchasePro error', err);
      return false;
    }
  }

  async restore(): Promise<boolean> {
    try {
      const info = await Purchases.restorePurchases();
      const isPro = this.extractIsPro(info);
      this.updateProState(isPro);
      return Boolean(isPro);
    } catch (err) {
      console.error('[RevenuecatService] restore error', err);
      return false;
    }
  }

  isPro(): boolean {
    return this.proSubject.value;
  }

  private extractIsPro(info: any): boolean {
    const entitlements = info?.entitlements?.active;
    if (!entitlements) return false;
    return Boolean(entitlements['pro'] ?? entitlements['premium']);
  }

  private updateProState(isPro: boolean): void {
    this.proSubject.next(isPro);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(isPro));
    } catch (err) {
      console.warn('[RevenuecatService] failed to persist state', err);
    }
  }

  private loadStoredState(): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : false;
    } catch {
      return false;
    }
  }
}
