import { Component, Injector, inject, signal } from '@angular/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { CapacitorPluginMlKitTextRecognition } from '@pantrist/capacitor-plugin-ml-kit-text-recognition';
import { NOTIFICATION_IDS } from '@core/constants';
import { formatDateTimeValue } from '@core/utils/formatting.util';
import { SettingsDevStateService } from '@core/services/settings/settings-dev-state.service';
import { SettingsStateService } from '@core/services/settings/settings-state.service';
import { AlertController } from '@ionic/angular';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSpinner,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

/**
 * The developer panel inside Settings: seeding, notification firing, OCR
 * spikes, PRO simulation, telemetry probes.
 *
 * It lives in its own component because it is the larger half of a screen that
 * ships to users and that none of them can see. Splitting it keeps the Settings
 * page about settings, and keeps every dependency only this panel needs — the
 * pantry query service, the seeder, the scheduler — out of that page's
 * constructor.
 *
 * Rendered only under `@if (isDev)`, and it takes SettingsDevStateService from
 * the parent page, which provides it.
 */
@Component({
  selector: 'app-settings-dev-panel',
  standalone: true,
  imports: [
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonSpinner,
    TranslateModule,
  ],
  templateUrl: './settings-dev-panel.component.html',
  styleUrls: ['../../settings.component.scss'],
})
export class SettingsDevPanelComponent {
  readonly facade = inject(SettingsStateService);
  readonly dev = inject(SettingsDevStateService);
  private readonly injector = inject(Injector);
  private readonly translate = inject(TranslateService);
  private readonly alertCtrl = inject(AlertController);

  protected readonly NOTIFICATION_IDS = NOTIFICATION_IDS;

  // Notifications
  readonly isTestingNotification = signal(false);
  readonly scheduleAtTimeInput = signal('09:00');
  readonly isSchedulingAtTime = signal(false);
  readonly isPreviewingNotification = signal(false);
  readonly isCancellingNotifications = signal(false);
  // Data
  readonly isSeedingMarketing = signal(false);
  readonly isClearingPantry = signal(false);
  // Receipt scan spike (dev-only, feat 5.1)
  readonly isScanningReceipt = signal(false);
  readonly receiptScanLines = signal<string[]>([]);
  readonly receiptScanRaw = signal<string>('');
  // App state
  readonly isResettingOnboarding = signal(false);
  readonly devIsPro = signal(this.dev.isPro());

  /**
   * Dev panel: throw a synthetic error so Sentry's Angular `ErrorHandler`
   * captures it and we can verify the wiring end-to-end without DevTools.
   * Requires analytics consent ON — otherwise `beforeSend` will drop the event.
   */
  triggerTestCrash(): void {
    const ts = new Date().toISOString();
    throw new Error(`[Dev] Sentry wiring test — fired at ${ts}`);
  }

  /**
   * Dev panel: reset every gate that controls the re-consent sheet so the
   * dashboard sheet pops on the next visit. Useful for QA — testing the
   * upgrade path from v4.5 → v4.6 without uninstalling.
   *
   * Flow:
   *  - Keep `hasSeenOnboarding = true` (user must look existing).
   *  - Clear the one-shot `reconsent:shown` flag.
   *  - Wipe the consent decision timestamps from PouchDB preferences so
   *    `ReconsentPromptService.resolvePendingQuestions()` reports both as
   *    pending.
   *  - Hard-reload onto `/dashboard` to ensure the timer-based prompt fires
   *    cleanly (no router race against the freshly-saved prefs doc).
   */
  async triggerReconsentSheet(): Promise<void> {
    await this.dev.prepareReconsentSheet();
    sessionStorage.setItem('sync:postReload', '1');
    window.location.href = '/dashboard';
  }

  /** Pretty-print a pending notification scheduleAt ISO for the dev panel. */
  formatPendingTime(iso?: string): string {
    return formatDateTimeValue(iso, this.facade.getCurrentLocale(), { fallback: '—' });
  }

  async testNotification(): Promise<void> {
    if (this.isTestingNotification()) return;
    this.isTestingNotification.set(true);
    try {
      await this.dev.fireWinning();
    } finally {
      this.isTestingNotification.set(false);
    }
  }

  async showPreview(): Promise<void> {
    const result = await this.dev.previewNext();
    const message = result
      ? `${result.title}\n\n${result.body}`
      : this.translate.instant('settings.dev.notifications.previewEmpty');
    const alert = await this.alertCtrl.create({
      header: this.translate.instant('settings.dev.notifications.previewResultTitle'),
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  onScheduleAtTimeChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.scheduleAtTimeInput.set(input.value);
  }

  async scheduleAtTime(): Promise<void> {
    if (this.isSchedulingAtTime()) return;
    this.isSchedulingAtTime.set(true);
    try {
      const [hour, minute] = this.scheduleAtTimeInput().split(':').map(Number);
      const at = new Date();
      at.setHours(hour, minute, 0, 0);
      await this.dev.fireWinningAt(at);
    } finally {
      this.isSchedulingAtTime.set(false);
    }
  }

  async previewNotification(): Promise<void> {
    if (this.isPreviewingNotification()) return;
    this.isPreviewingNotification.set(true);
    try {
      const result = await this.dev.previewNext();
      if (result) {
        window.alert(`${result.title}\n\n${result.body}`);
      } else {
        window.alert(this.translate.instant('settings.dev.notificationPreviewNone'));
      }
    } finally {
      this.isPreviewingNotification.set(false);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    if (this.isCancellingNotifications()) return;
    this.isCancellingNotifications.set(true);
    try {
      await this.dev.cancelAll();
    } finally {
      this.isCancellingNotifications.set(false);
    }
  }

  async seedMarketingDatabase(): Promise<void> {
    if (this.isSeedingMarketing()) return;
    const confirmed = window.confirm(this.translate.instant('settings.dev.seedMarketingConfirm'));
    if (!confirmed) return;
    this.isSeedingMarketing.set(true);
    try {
      await this.dev.seedMarketingDatabase(this.translate.currentLang);
    } finally {
      this.isSeedingMarketing.set(false);
    }
  }

  async scanReceiptDev(): Promise<void> {
    if (this.isScanningReceipt()) return;
    this.isScanningReceipt.set(true);
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64,
        source: CameraSource.Prompt,
        promptLabelHeader: this.translate.instant('pantry.receiptScan.promptHeader'),
        promptLabelPhoto: this.translate.instant('pantry.receiptScan.promptGallery'),
        promptLabelPicture: this.translate.instant('pantry.receiptScan.promptCamera'),
      });
      if (!photo.base64String) {
        window.alert(this.translate.instant('settings.dev.receiptScanNoImage'));
        return;
      }
      const result = await CapacitorPluginMlKitTextRecognition.detectText({
        base64Image: photo.base64String,
      });
      const lines = result.blocks
        .flatMap(block => block.lines.map(line => line.text))
        .filter(t => !!t.trim());
      this.receiptScanLines.set(lines);
      // Full geometry payload for parser fixtures (shared as JSON by the share button).
      this.receiptScanRaw.set(JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          lines: result.blocks.flatMap(block =>
            block.lines.map(line => ({
              text: line.text,
              box: line.boundingBox,
            })),
          ),
        },
        null,
        1,
      ));
      if (!lines.length) {
        window.alert(this.translate.instant('settings.dev.receiptScanEmpty'));
      }
    } catch (err) {
      // User cancelled the picker or OCR unavailable (web build)
      const message = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(message)) {
        window.alert(`OCR: ${message}`);
      }
    } finally {
      this.isScanningReceipt.set(false);
    }
  }

  async shareReceiptScanResult(): Promise<void> {
    // Prefer the JSON payload (text + bounding boxes) — it's the parser fixture format.
    const raw = this.receiptScanRaw();
    const lines = this.receiptScanLines();
    if (!raw && !lines.length) return;
    await Share.share({
      title: 'PantryMind receipt OCR',
      text: raw || lines.join('\n'),
    });
  }

  clearReceiptScanResult(): void {
    this.receiptScanLines.set([]);
    this.receiptScanRaw.set('');
  }

  async clearPantry(): Promise<void> {
    if (this.isClearingPantry()) return;
    const confirmed = window.confirm(this.translate.instant('settings.dev.clearPantryConfirm'));
    if (!confirmed) return;
    this.isClearingPantry.set(true);
    try {
      await this.dev.clearPantry();
    } finally {
      this.isClearingPantry.set(false);
    }
  }

  resetOnboarding(): void {
    if (this.isResettingOnboarding()) return;
    this.isResettingOnboarding.set(true);
    try {
      // Wipe every per-device flag so the Dev "Reset onboarding" button gives
      // a truly fresh-install experience (onboarding + re-consent + review).
      this.dev.resetOnboarding();
    } finally {
      this.isResettingOnboarding.set(false);
    }
  }

  togglePro(): void {
    const next = !this.devIsPro();
    this.dev.setProState(next);
    this.devIsPro.set(next);
  }

  async showAppState(): Promise<void> {
    const summary = await this.dev.getPantrySummary();
    const isPro = this.devIsPro();

    window.alert([
      `Total:       ${summary.total}`,
      `Expired:     ${summary.expired}`,
      `Near expiry: ${summary.nearExpiry}`,
      `Low stock:   ${summary.lowStock}`,
      `PRO:         ${isPro ? 'ON ✅' : 'OFF ❌'}`,
    ].join('\n'));
  }
}
