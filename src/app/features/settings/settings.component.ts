import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SettingsStateService } from '@core/services/settings/settings-state.service';
import { NotificationSchedulerService } from '@core/services/notifications/notification-scheduler.service';
import { PantryService } from '@core/services/pantry/pantry.service';
import { UpgradeRevenuecatService } from '@core/services/upgrade/upgrade-revenuecat.service';
import { LanguageService } from '@core/services/shared/language.service';
import { DevMarketingSeederService } from '@core/services/dev/dev-marketing-seeder.service';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@core/constants';
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
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import packageJson from '../../../../package.json';
import { environment } from 'src/environments/environment';

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
    CommonModule,
    RouterLink,
    TranslateModule,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  providers: [SettingsStateService],
})
export class SettingsComponent {
  readonly facade = inject(SettingsStateService);
  private readonly scheduler = inject(NotificationSchedulerService);
  private readonly pantry = inject(PantryService);
  private readonly revenuecat = inject(UpgradeRevenuecatService);
  private readonly translate = inject(TranslateService);
  private readonly language = inject(LanguageService);
  private readonly marketingSeeder = inject(DevMarketingSeederService);

  readonly appVersion = packageJson.version ?? '0.0.0';
  readonly isDev = !environment.production;
  readonly isPro = this.facade.isPro;
  readonly SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
  readonly currentLanguage = this.language.currentLanguage;

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

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
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
      localStorage.removeItem('hasSeenOnboarding');
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
