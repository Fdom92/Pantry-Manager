import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { ONBOARDING_STORAGE_KEY, REVIEW_STORAGE_KEYS } from '@core/constants';
import { getBooleanFlag, setBooleanFlag } from '@core/utils/storage-flag.util';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmService } from './confirm.service';
import { sleep } from './task.util';

interface InAppReviewPlugin {
  requestReview: () => Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class ReviewPromptService {
  private readonly confirm = inject(ConfirmService);
  private readonly translate = inject(TranslateService);

  private readonly minDaysSinceFirstUse = 7;
  private readonly minLaunches = 7;
  private readonly cooldownDays = 30;
  private readonly minProductAddsForPrompt = 3;
  private readonly promptDelayMs = 1500;
  private lastTriggerAt = 0;
  private readonly storageAvailable = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

  async handleDashboardEnter(): Promise<void> {
    if (!this.storageAvailable) {
      return;
    }
    const now = Date.now();
    if (now - this.lastTriggerAt < 1500) {
      return;
    }
    this.lastTriggerAt = now;

    this.noteLaunch();
    if (!getBooleanFlag(REVIEW_STORAGE_KEYS.PENDING)) {
      return;
    }
    const didPrompt = await this.promptIfEligible();
    if (didPrompt) {
      this.clearPendingPrompt();
    }
  }

  markEngagement(): void {
    if (!this.storageAvailable) {
      return;
    }
    this.noteFirstUse();
    setBooleanFlag(REVIEW_STORAGE_KEYS.PENDING, true);
  }

  handleProductAdded(): void {
    if (!this.storageAvailable) {
      return;
    }
    this.noteFirstUse();
    const current = this.getStoredNumber(REVIEW_STORAGE_KEYS.PRODUCT_ADD_COUNT) ?? 0;
    const next = current + 1;
    this.setItem(REVIEW_STORAGE_KEYS.PRODUCT_ADD_COUNT, String(next));
    if (next >= this.minProductAddsForPrompt) {
      setBooleanFlag(REVIEW_STORAGE_KEYS.PENDING, true);
    }
  }

  private noteLaunch(): void {
    this.noteFirstUse();
    const launchCount = this.getStoredNumber(REVIEW_STORAGE_KEYS.LAUNCH_COUNT) ?? 0;
    this.setItem(REVIEW_STORAGE_KEYS.LAUNCH_COUNT, String(launchCount + 1));
  }

  private noteFirstUse(): void {
    const now = new Date().toISOString();
    const firstUse = this.getStoredDate(REVIEW_STORAGE_KEYS.FIRST_USE_AT);
    if (!firstUse) {
      this.setItem(REVIEW_STORAGE_KEYS.FIRST_USE_AT, now);
    }
  }

  private async promptIfEligible(): Promise<boolean> {
    if (!this.shouldPrompt()) {
      return false;
    }

    await sleep(this.promptDelayMs);
    if (!this.shouldPrompt()) {
      return false;
    }

    const accepted = this.confirm.confirm(this.translate.instant('reviews.prompt'));
    const promptTimestamp = new Date().toISOString();
    this.setItem(REVIEW_STORAGE_KEYS.LAST_PROMPT_AT, promptTimestamp);
    if (!accepted) {
      return true;
    }

    const didRequest = await this.requestNativeReview();
    if (didRequest) {
      this.setItem(REVIEW_STORAGE_KEYS.COMPLETED_AT, promptTimestamp);
    }
    return true;
  }

  private clearPendingPrompt(): void {
    try {
      localStorage.removeItem(REVIEW_STORAGE_KEYS.PENDING);
    } catch {
      // Ignore storage failures.
    }
  }

  private shouldPrompt(): boolean {
    if (!Capacitor.isNativePlatform()) {
      return false;
    }
    if (!getBooleanFlag(ONBOARDING_STORAGE_KEY)) {
      return false;
    }
    if (this.getStoredDate(REVIEW_STORAGE_KEYS.COMPLETED_AT)) {
      return false;
    }

    const firstUse = this.getStoredDate(REVIEW_STORAGE_KEYS.FIRST_USE_AT);
    if (!firstUse) {
      return false;
    }
    if (this.getDaysSince(firstUse) < this.minDaysSinceFirstUse) {
      return false;
    }

    const launchCount = this.getStoredNumber(REVIEW_STORAGE_KEYS.LAUNCH_COUNT) ?? 0;
    if (launchCount < this.minLaunches) {
      return false;
    }

    const lastPrompt = this.getStoredDate(REVIEW_STORAGE_KEYS.LAST_PROMPT_AT);
    if (lastPrompt && this.getDaysSince(lastPrompt) < this.cooldownDays) {
      return false;
    }

    return true;
  }

  private async requestNativeReview(): Promise<boolean> {
    try {
      const { registerPlugin } = await import('@capacitor/core');
      const plugin = registerPlugin<InAppReviewPlugin>('InAppReview');
      await plugin.requestReview();
      return true;
    } catch (err) {
      console.warn('[ReviewPromptService] In-app review unavailable', err);
      return false;
    }
  }

  private getStoredDate(key: string): Date | null {
    try {
      const value = localStorage.getItem(key);
      if (!value) {
        return null;
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }

  private getStoredNumber(key: string): number | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }
      const parsed = Number(raw);
      return Number.isNaN(parsed) ? null : parsed;
    } catch {
      return null;
    }
  }

  private setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Ignore storage failures.
    }
  }

  private getDaysSince(date: Date): number {
    const diffMs = Date.now() - date.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }

}
