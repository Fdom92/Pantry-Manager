import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SettingsStateService } from '@core/services/settings/settings-state.service';
import { NotificationSchedulerService } from '@core/services/notifications/notification-scheduler.service';
import { PantryQueryService } from '@core/services/pantry/pantry-query.service';
import { UpgradeRevenuecatService } from '@core/services/upgrade/upgrade-revenuecat.service';
import { computeAnnualSavingsPercent } from '@core/domain/upgrade';
import { LanguageService } from '@core/services/shared/language.service';
import { DevMarketingSeederService } from '@core/services/dev/dev-marketing-seeder.service';
import { NOTIFICATION_IDS, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@core/constants';
import { LocalStorageService } from '@core/services/shared';
import { SettingsPreferencesService } from '@core/services/settings/settings-preferences.service';
import { formatDateTimeValue } from '@core/utils/formatting.util';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import packageJson from '../../../../package.json';
import { environment } from 'src/environments/environment';
import { SettingsNotificationsDevStateService } from '@core/services/settings/settings-notifications-dev-state.service';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';
import { SettingsSkeletonComponent } from './components/settings-skeleton/settings-skeleton.component';
import { AlertController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
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
    IonToggle,
    CommonModule,
    RouterLink,
    TranslateModule,
    ProPaywallCardComponent,
    SettingsSkeletonComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  providers: [SettingsStateService, SettingsNotificationsDevStateService],
})
export class SettingsComponent {
  readonly facade = inject(SettingsStateService);
  readonly dev = inject(SettingsNotificationsDevStateService);
  private readonly scheduler = inject(NotificationSchedulerService);
  private readonly pantry = inject(PantryQueryService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly marketingSeeder = inject(DevMarketingSeederService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  private readonly localStorage = inject(LocalStorageService);
  private readonly appPreferences = inject(SettingsPreferencesService);

  readonly appVersion = packageJson.version ?? '0.0.0';
  readonly isDev = !environment.production;
  readonly isPro = this.facade.isPro;
  readonly SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
  readonly currentLanguage = this.language.currentLanguage;
  protected readonly NOTIFICATION_IDS = NOTIFICATION_IDS;

  /** Toggle anonymous analytics opt-in/out via the Privacidad card. */
  async onAnalyticsToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
    const next = Boolean(event.detail?.checked);
    await this.facade.toggleAnalytics(next);
    const messageKey = next
      ? 'settings.privacy.toastEnabled'
      : 'settings.privacy.toastDisabled';
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(messageKey),
      duration: 1500,
      position: 'bottom',
    });
    void toast.present();
  }

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
    this.localStorage.onboarding.setSeen(true);
    // Direct primitive — we want the flag *cleared*, the service only exposes
    // markShown(). Calling the underlying remove is acceptable in a dev tool.
    localStorage.removeItem('reconsent:shown');

    try {
      const prefs = await this.appPreferences.getPreferences();
      await this.appPreferences.savePreferences({
        ...prefs,
        analyticsDecidedAt: null,
        notificationsDecidedAt: null,
        analyticsEnabled: undefined,
      });
    } catch (err) {
      console.warn('[Dev] reconsent reset prefs error', err);
    }

    sessionStorage.setItem('sync:postReload', '1');
    window.location.href = '/dashboard';
  }

  /** Pretty-print a pending notification scheduleAt ISO for the dev panel. */
  formatPendingTime(iso?: string): string {
    return formatDateTimeValue(iso, this.language.getCurrentLocale(), { fallback: '—' });
  }

  // PRO pricing
  readonly monthlyPriceString = signal<string | null>(null);
  readonly annualPriceString = signal<string | null>(null);
  private readonly monthlyPriceNumeric = signal<number | null>(null);
  private readonly annualPriceNumeric = signal<number | null>(null);

  readonly annualSavingsPercent = computed<number | null>(() =>
    computeAnnualSavingsPercent({
      monthlyPrice: this.monthlyPriceNumeric(),
      annualPrice: this.annualPriceNumeric(),
    })
  );

  private async loadPricing(): Promise<void> {
    const offering = await this.revenuecat.getOfferings();
    if (!offering) return;
    const monthly = offering.monthly;
    const annual = offering.annual;
    this.monthlyPriceString.set(monthly?.product?.priceString ?? null);
    this.annualPriceString.set(annual?.product?.priceString ?? null);
    this.monthlyPriceNumeric.set(monthly?.product?.price ?? null);
    this.annualPriceNumeric.set(annual?.product?.price ?? null);
  }

  // Notifications
  readonly isTestingNotification = signal(false);
  readonly scheduleAtTimeInput = signal('09:00');
  readonly isSchedulingAtTime = signal(false);
  readonly isPreviewingNotification = signal(false);
  readonly isCancellingNotifications = signal(false);

  // Data
  readonly isSeedingMarketing = signal(false);
  readonly isClearingPantry = signal(false);

  // App state
  readonly isResettingOnboarding = signal(false);
  readonly devIsPro = signal(this.revenuecat.isPro());

  readonly showSkeleton = signal(false);

  async ionViewWillEnter(): Promise<void> {
    const timer = setTimeout(() => {
      if (!this.facade.isReady()) this.showSkeleton.set(true);
    }, 100);

    await this.facade.ionViewWillEnter();
    clearTimeout(timer);
    this.showSkeleton.set(false);

    if (!this.isPro()) {
      await this.loadPricing();
    }
  }

  // ─── Notifications ────────────────────────────────────────────────────────

  async testNotification(): Promise<void> {
    if (this.isTestingNotification()) return;
    this.isTestingNotification.set(true);
    try {
      await this.scheduler.scheduleTestNotification();
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
      await this.scheduler.scheduleNotificationAtTime(hour, minute);
    } finally {
      this.isSchedulingAtTime.set(false);
    }
  }

  async previewNotification(): Promise<void> {
    if (this.isPreviewingNotification()) return;
    this.isPreviewingNotification.set(true);
    try {
      const result = await this.scheduler.previewNextNotification();
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
      await this.scheduler.cancelAll();
    } finally {
      this.isCancellingNotifications.set(false);
    }
  }

  // ─── Language ─────────────────────────────────────────────────────────────

  async setLanguage(lang: SupportedLanguage): Promise<void> {
    await this.language.setLanguage(lang);
  }

  // ─── Data ─────────────────────────────────────────────────────────────────

  async seedMarketingDatabase(): Promise<void> {
    if (this.isSeedingMarketing()) return;
    const confirmed = window.confirm(this.translate.instant('settings.dev.seedMarketingConfirm'));
    if (!confirmed) return;
    this.isSeedingMarketing.set(true);
    try {
      await this.marketingSeeder.seedMarketingDatabase();
    } finally {
      this.isSeedingMarketing.set(false);
    }
  }

  async clearPantry(): Promise<void> {
    if (this.isClearingPantry()) return;
    const confirmed = window.confirm(this.translate.instant('settings.dev.clearPantryConfirm'));
    if (!confirmed) return;
    this.isClearingPantry.set(true);
    try {
      const items = await this.pantry.getAll();
      for (const item of items) {
        await this.pantry.deleteItem(item._id);
      }
      await this.pantry.reloadFromStart();
    } finally {
      this.isClearingPantry.set(false);
    }
  }

  // ─── App State ────────────────────────────────────────────────────────────

  resetOnboarding(): void {
    if (this.isResettingOnboarding()) return;
    this.isResettingOnboarding.set(true);
    try {
      // Wipe every per-device flag so the Dev "Reset onboarding" button gives
      // a truly fresh-install experience (onboarding + re-consent + review).
      this.localStorage.onboarding.reset();
    } finally {
      this.isResettingOnboarding.set(false);
    }
  }

  togglePro(): void {
    const next = !this.devIsPro();
    this.revenuecat.setDevProState(next);
    this.devIsPro.set(next);
  }

  async showAppState(): Promise<void> {
    const summary = await this.pantry.getSummary();
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
