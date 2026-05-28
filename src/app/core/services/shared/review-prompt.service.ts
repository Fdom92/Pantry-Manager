import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { STORAGE_KEYS } from '@core/constants';
import { getBooleanFlag, setBooleanFlag, sleep } from '@core/utils';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

interface InAppReviewPlugin {
  requestReview: () => Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class ReviewPromptService {
  private readonly alertCtrl = inject(AlertController);
  private readonly translate = inject(TranslateService);

  private readonly minDaysSinceFirstUse = 3;
  private readonly minLaunches = 3;
  private readonly cooldownDays = 30;
  private readonly completedCooldownDays = 90;
  private readonly minProductAddsForPrompt = 2;
  private readonly minConsumesForPrompt = 2;
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
    if (!getBooleanFlag(STORAGE_KEYS.REVIEW_PENDING)) {
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
    setBooleanFlag(STORAGE_KEYS.REVIEW_PENDING, true);
  }

  handleProductAdded(): void {
    if (!this.storageAvailable) {
      return;
    }
    this.noteFirstUse();
    const current = this.getStoredNumber(STORAGE_KEYS.REVIEW_PRODUCT_ADD_COUNT) ?? 0;
    const next = current + 1;
    this.setItem(STORAGE_KEYS.REVIEW_PRODUCT_ADD_COUNT, String(next));
    if (next >= this.minProductAddsForPrompt) {
      setBooleanFlag(STORAGE_KEYS.REVIEW_PENDING, true);
    }
  }

  handleConsumeCompleted(): void {
    if (!this.storageAvailable) {
      return;
    }
    this.noteFirstUse();
    const current = this.getStoredNumber(STORAGE_KEYS.REVIEW_CONSUME_COUNT) ?? 0;
    const next = current + 1;
    this.setItem(STORAGE_KEYS.REVIEW_CONSUME_COUNT, String(next));
    if (next >= this.minConsumesForPrompt) {
      setBooleanFlag(STORAGE_KEYS.REVIEW_PENDING, true);
    }
  }

  /**
   * Call immediately after a successful HOY "used ingredients" confirmation.
   * High-intent moment: user just saved food from expiring — peak satisfaction.
   * Skips the launch-count gate since the trigger itself signals engagement.
   * Uses contextual text tied to the action, not the generic review ask.
   */
  async handleIngredientUsed(): Promise<void> {
    if (!this.storageAvailable) return;
    this.noteFirstUse();
    setBooleanFlag(STORAGE_KEYS.REVIEW_PENDING, true);
    const didPrompt = await this.promptIfEligibleNoLaunchGate('reviews.promptHoy');
    if (didPrompt) this.clearPendingPrompt();
  }

  private noteLaunch(): void {
    this.noteFirstUse();
    const launchCount = this.getStoredNumber(STORAGE_KEYS.REVIEW_LAUNCH_COUNT) ?? 0;
    this.setItem(STORAGE_KEYS.REVIEW_LAUNCH_COUNT, String(launchCount + 1));
  }

  private noteFirstUse(): void {
    const now = new Date().toISOString();
    const firstUse = this.getStoredDate(STORAGE_KEYS.REVIEW_FIRST_USE_AT);
    if (!firstUse) {
      this.setItem(STORAGE_KEYS.REVIEW_FIRST_USE_AT, now);
    }
  }

  private async promptIfEligible(messageKey = 'reviews.prompt'): Promise<boolean> {
    if (!this.shouldPrompt()) return false;
    await sleep(this.promptDelayMs);
    if (!this.shouldPrompt()) return false;
    return this.doPrompt(messageKey);
  }

  /** Same as promptIfEligible but skips the launch-count gate. Used for high-intent moments. */
  private async promptIfEligibleNoLaunchGate(messageKey = 'reviews.prompt'): Promise<boolean> {
    if (!this.shouldPromptNoLaunchGate()) return false;
    await sleep(this.promptDelayMs);
    if (!this.shouldPromptNoLaunchGate()) return false;
    return this.doPrompt(messageKey);
  }

  private async doPrompt(messageKey: string): Promise<boolean> {
    const accepted = await this.showReviewAlert(messageKey);
    const promptTimestamp = new Date().toISOString();
    this.setItem(STORAGE_KEYS.REVIEW_LAST_PROMPT_AT, promptTimestamp);
    if (!accepted) return true;
    const didRequest = await this.requestNativeReview();
    if (didRequest) this.setItem(STORAGE_KEYS.REVIEW_COMPLETED_AT, promptTimestamp);
    return true;
  }

  private showReviewAlert(messageKey: string): Promise<boolean> {
    return new Promise(resolve => {
      this.alertCtrl.create({
        message: this.translate.instant(messageKey),
        buttons: [
          {
            text: this.translate.instant('reviews.decline'),
            role: 'cancel',
            handler: () => resolve(false),
          },
          {
            text: this.translate.instant('reviews.accept'),
            handler: () => resolve(true),
          },
        ],
      }).then(alert => alert.present());
    });
  }

  private clearPendingPrompt(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.REVIEW_PENDING);
    } catch {
      // Ignore storage failures.
    }
  }

  private shouldPrompt(): boolean {
    if (!this.meetsBasicGates()) return false;
    const launchCount = this.getStoredNumber(STORAGE_KEYS.REVIEW_LAUNCH_COUNT) ?? 0;
    if (launchCount < this.minLaunches) return false;
    return true;
  }

  /** Skips launch-count check — for high-intent triggers like HOY ingredient confirmation. */
  private shouldPromptNoLaunchGate(): boolean {
    return this.meetsBasicGates();
  }

  private meetsBasicGates(): boolean {
    if (!Capacitor.isNativePlatform()) return false;
    if (!getBooleanFlag(STORAGE_KEYS.ONBOARDING_FLAG)) return false;

    const completedAt = this.getStoredDate(STORAGE_KEYS.REVIEW_COMPLETED_AT);
    if (completedAt && this.getDaysSince(completedAt) < this.completedCooldownDays) return false;

    const firstUse = this.getStoredDate(STORAGE_KEYS.REVIEW_FIRST_USE_AT);
    if (!firstUse || this.getDaysSince(firstUse) < this.minDaysSinceFirstUse) return false;

    const lastPrompt = this.getStoredDate(STORAGE_KEYS.REVIEW_LAST_PROMPT_AT);
    if (lastPrompt && this.getDaysSince(lastPrompt) < this.cooldownDays) return false;

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
