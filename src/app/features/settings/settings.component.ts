import { CommonModule } from '@angular/common';
import { Component, Injector, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SettingsStateService } from '@core/services/settings/settings-state.service';
import { computeAnnualSavingsPercent } from '@core/domain/upgrade';
import { NOTIFICATION_IDS, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@core/constants';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import packageJson from '../../../../package.json';
import { environment } from 'src/environments/environment';
import { SettingsDevStateService } from '@core/services/settings/settings-dev-state.service';
import { SettingsDevPanelComponent } from './components/settings-dev-panel/settings-dev-panel.component';
import { ProPaywallCardComponent } from '@shared/components/pro-paywall-card/pro-paywall-card.component';
import { SettingsSkeletonComponent } from './components/settings-skeleton/settings-skeleton.component';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    SettingsDevPanelComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonToggle,
    CommonModule,
    RouterLink,
    TranslateModule,
    ProPaywallCardComponent,
    SettingsSkeletonComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  providers: [SettingsStateService, SettingsDevStateService],
})
export class SettingsComponent {
  readonly facade = inject(SettingsStateService);
  readonly dev = inject(SettingsDevStateService);
  private readonly injector = inject(Injector);
  private readonly translate = inject(TranslateService);
  private readonly alertCtrl = inject(AlertController);

  readonly appVersion = packageJson.version ?? '0.0.0';
  readonly isDev = !environment.production;
  readonly isPro = this.facade.isPro;
  readonly SUPPORTED_LANGUAGES = SUPPORTED_LANGUAGES;
  readonly currentLanguage = this.facade.currentLanguage;
  protected readonly NOTIFICATION_IDS = NOTIFICATION_IDS;

  /** Toggle anonymous analytics opt-in/out via the Privacidad card. */
  async onAnalyticsToggle(event: CustomEvent<{ checked: boolean }>): Promise<void> {
    const next = Boolean(event.detail?.checked);
    await this.facade.toggleAnalytics(next);
  }



  markDeviceAsInternal(): void {
    this.dev.markDeviceAsInternal();
  }

  private versionTapCount = 0;
  private versionTapTimer: ReturnType<typeof setTimeout> | null = null;

  onVersionTap(): void {
    this.versionTapCount++;
    if (this.versionTapTimer) clearTimeout(this.versionTapTimer);
    this.versionTapTimer = setTimeout(() => { this.versionTapCount = 0; }, 2000);

    if (this.versionTapCount >= 7) {
      this.versionTapCount = 0;
      void this.alertCtrl.create({
        header: 'Marcar como interno',
        message: '¿Marcar este dispositivo como tester interno? Quedará excluido de las métricas de PostHog.',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Marcar', handler: () => this.markDeviceAsInternal() },
        ],
      }).then(a => a.present());
    }
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
    const offering = await this.facade.getOfferings();
    if (!offering) return;
    const monthly = offering.monthly;
    const annual = offering.annual;
    this.monthlyPriceString.set(monthly?.product?.priceString ?? null);
    this.annualPriceString.set(annual?.product?.priceString ?? null);
    this.monthlyPriceNumeric.set(monthly?.product?.price ?? null);
    this.annualPriceNumeric.set(annual?.product?.price ?? null);
  }





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







  // ─── Language ─────────────────────────────────────────────────────────────

  async setLanguage(lang: SupportedLanguage): Promise<void> {
    await this.facade.setLanguage(lang);
  }

  // ─── Data ─────────────────────────────────────────────────────────────────






  // ─── App State ────────────────────────────────────────────────────────────



}
