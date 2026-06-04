import {
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButton,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '@core/services/analytics';
import { NotificationPermissionService } from '@core/services/notifications/notification-permission.service';
import { ReconsentPromptService } from '@core/services/reconsent';
import { SettingsPreferencesService } from '@core/services/settings/settings-preferences.service';

/**
 * Re-consent sheet for users who updated past the onboarding rev that added the
 * analytics slide. Shown at most once per install from the dashboard. Surfaces
 * only the questions that are still pending (see `ReconsentPromptService`).
 *
 * Non-blocking: dismissed by backdrop / swipe / "Más tarde" — never re-shown.
 * Users can revisit decisions any time in Settings → Privacidad / Notificaciones.
 */
@Component({
  selector: 'app-reconsent-sheet',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonFooter,
    IonList,
    IonItem,
    IonLabel,
    IonToggle,
    IonIcon,
    IonButton,
  ],
  templateUrl: './reconsent-sheet.component.html',
  styleUrls: ['./reconsent-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class ReconsentSheetComponent {
  private readonly reconsent = inject(ReconsentPromptService);
  private readonly analytics = inject(AnalyticsService);
  private readonly permission = inject(NotificationPermissionService);
  private readonly prefs = inject(SettingsPreferencesService);

  /** Modal visibility — driven by the parent component via ngIf-style binding. */
  readonly isOpen = signal(false);

  /** Whether each question is pending for the current user. */
  readonly showNotifications = signal(false);
  readonly showAnalytics = signal(false);

  /** Working state for the toggles. */
  readonly notificationsOn = signal(false);
  readonly analyticsOn = signal(true);

  readonly isSubmitting = signal(false);

  constructor() {
    // Once the modal becomes visible we mark it shown so a hard kill mid-flow
    // (back-button + force-stop) does not re-prompt the user.
    effect(() => {
      if (this.isOpen()) {
        this.reconsent.markShown();
        this.analytics.track(ANALYTICS_EVENTS.RECONSENT_SHEET_SHOWN, {
          asks_notifications: this.showNotifications(),
          asks_analytics: this.showAnalytics(),
        });
      }
    });
  }

  /** Called from the dashboard to evaluate visibility + open the sheet if needed. */
  async maybePresent(): Promise<void> {
    if (this.isOpen()) return;
    if (!(await this.reconsent.shouldShow())) return;

    const { notifications, analytics } = await this.reconsent.resolvePendingQuestions();
    this.showNotifications.set(notifications);
    this.showAnalytics.set(analytics);
    this.notificationsOn.set(false);
    this.analyticsOn.set(true);
    this.reconsent.isSheetOpen.set(true);
    this.isOpen.set(true);
  }

  onNotificationsToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.notificationsOn.set(Boolean(event.detail?.checked));
  }

  onAnalyticsToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.analyticsOn.set(Boolean(event.detail?.checked));
  }

  /** Primary CTA — apply every toggle, persist consent and analytics state. */
  async confirm(): Promise<void> {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);

    let notifGranted = false;
    try {
      if (this.showNotifications() && this.notificationsOn()) {
        notifGranted = await this.permission.request();
        if (notifGranted) {
          const current = await this.prefs.getPreferences();
          await this.prefs.savePreferences({
            ...current,
            notificationsEnabled: true,
            notifyOnExpired: true,
            notifyOnNearExpiry: true,
            notifyOnLowStock: true,
          });
        }
      }

      if (this.showAnalytics()) {
        if (this.analyticsOn()) {
          await this.analytics.optIn();
        } else {
          await this.analytics.optOut();
        }
      }

      this.analytics.track(ANALYTICS_EVENTS.RECONSENT_SHEET_DECIDED, {
        notif_asked: this.showNotifications(),
        notif_granted: notifGranted,
        analytics_asked: this.showAnalytics(),
        analytics_granted: this.showAnalytics() && this.analyticsOn(),
      });
    } finally {
      this.close();
      this.isSubmitting.set(false);
    }
  }

  /** Soft dismiss — no decisions applied, but the sheet is still marked as shown. */
  dismissLater(): void {
    this.analytics.track(ANALYTICS_EVENTS.RECONSENT_SHEET_DECIDED, {
      notif_asked: this.showNotifications(),
      notif_granted: false,
      analytics_asked: this.showAnalytics(),
      analytics_granted: false,
      dismissed: true,
    });
    this.close();
  }

  close(): void {
    this.isOpen.set(false);
    this.reconsent.isSheetOpen.set(false);
  }
}
