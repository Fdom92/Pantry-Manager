import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { sleep } from '@core/utils';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { LocalStorageService } from './local-storage.service';

interface InAppReviewPlugin {
  requestReview: () => Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class ReviewPromptService {
  private readonly alertCtrl = inject(AlertController);
  private readonly translate = inject(TranslateService);
  private readonly storage = inject(LocalStorageService);

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
    if (!this.storage.review.isPending()) {
      return;
    }
    const didPrompt = await this.promptIfEligible();
    if (didPrompt) {
      this.storage.review.clearPending();
    }
  }

  markEngagement(): void {
    if (!this.storageAvailable) {
      return;
    }
    this.noteFirstUse();
    this.storage.review.setPending(true);
  }

  handleProductAdded(): void {
    if (!this.storageAvailable) {
      return;
    }
    this.noteFirstUse();
    const next = this.storage.review.getProductAddCount() + 1;
    this.storage.review.setProductAddCount(next);
    if (next >= this.minProductAddsForPrompt) {
      this.storage.review.setPending(true);
    }
  }

  handleConsumeCompleted(): void {
    if (!this.storageAvailable) {
      return;
    }
    this.noteFirstUse();
    const next = this.storage.review.getConsumeCount() + 1;
    this.storage.review.setConsumeCount(next);
    if (next >= this.minConsumesForPrompt) {
      this.storage.review.setPending(true);
    }
  }

  /**
   * Call immediately after a successful HOY "used ingredients" confirmation.
   * High-intent moment: user just saved food from expiring — peak satisfaction.
   * Skips the launch-count gate. Uses contextual text tied to the action.
   */
  async handleIngredientUsed(): Promise<void> {
    if (!this.storageAvailable) return;
    this.noteFirstUse();
    this.storage.review.setPending(true);
    const didPrompt = await this.promptIfEligibleNoLaunchGate('reviews.promptHoy');
    if (didPrompt) this.storage.review.clearPending();
  }

  /**
   * Generic immediate prompt for positive actions outside the dashboard
   * (e.g. marking items bought, marking fresh items out).
   *
   * Does NOT wait for the next dashboard visit — the user might close the
   * app without ever going to the dashboard, losing the moment entirely.
   * Skips the launch-count gate: the action itself proves engagement.
   */
  async handlePositiveAction(): Promise<void> {
    if (!this.storageAvailable) return;
    this.noteFirstUse();
    this.storage.review.setPending(true);
    const didPrompt = await this.promptIfEligibleNoLaunchGate('reviews.prompt');
    if (didPrompt) this.storage.review.clearPending();
  }

  private noteLaunch(): void {
    this.noteFirstUse();
    this.storage.review.setLaunchCount(this.storage.review.getLaunchCount() + 1);
  }

  private noteFirstUse(): void {
    if (!this.storage.review.getFirstUseAt()) {
      this.storage.review.setFirstUseAt(new Date());
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
    const now = new Date();
    this.storage.review.setLastPromptAt(now);
    if (!accepted) return true;
    const didRequest = await this.requestNativeReview();
    if (didRequest) this.storage.review.setCompletedAt(now);
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
      }).then(alert => alert.present()).catch(err => {
        console.error('Failed to present review alert:', err);
        resolve(false);
      });
    });
  }

  private shouldPrompt(): boolean {
    if (!this.meetsBasicGates()) return false;
    if (this.storage.review.getLaunchCount() < this.minLaunches) return false;
    return true;
  }

  /** Skips launch-count check — for high-intent triggers like HOY ingredient confirmation. */
  private shouldPromptNoLaunchGate(): boolean {
    return this.meetsBasicGates();
  }

  private meetsBasicGates(): boolean {
    if (!Capacitor.isNativePlatform()) return false;
    if (!this.storage.onboarding.isSeen()) return false;

    const completedAt = this.storage.review.getCompletedAt();
    if (completedAt && this.getDaysSince(completedAt) < this.completedCooldownDays) return false;

    const firstUse = this.storage.review.getFirstUseAt();
    if (!firstUse || this.getDaysSince(firstUse) < this.minDaysSinceFirstUse) return false;

    const lastPrompt = this.storage.review.getLastPromptAt();
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

  private getDaysSince(date: Date): number {
    const diffMs = Date.now() - date.getTime();
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }
}
