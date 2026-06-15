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
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonToggle,
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

  /**
   * Working state for the toggles. **Both default to false**: GDPR-aligned
   * opt-in by default. Tapping "Hecho" without flipping a toggle records
   * the user's lack of choice as an explicit decline (`opt_out`), not an
   * implicit acceptance.
   */
  readonly notificationsOn = signal(false);
  readonly analyticsOn = signal(false);

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
    // Both toggles default OFF — see comment on the signals above.
    this.notificationsOn.set(false);
    this.analyticsOn.set(false);
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
      // Notifications branch — only request OS permission if the user actually
      // flipped the toggle on. Always stamp `notificationsDecidedAt` if the
      // question was asked, so the re-consent sheet does not re-prompt.
      if (this.showNotifications()) {
        const current = await this.prefs.getPreferences();
        const now = new Date().toISOString();
        if (this.notificationsOn()) {
          notifGranted = await this.permission.request();
        }
        await this.prefs.savePreferences({
          ...current,
          notificationsEnabled: notifGranted ? true : current.notificationsEnabled,
          notifyOnExpired: notifGranted ? true : current.notifyOnExpired,
          notifyOnNearExpiry: notifGranted ? true : current.notifyOnNearExpiry,
          notifyOnLowStock: notifGranted ? true : current.notifyOnLowStock,
          notificationsDecidedAt: now,
        });
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

  /** Template-friendly fire-and-forget wrapper for `dismissLater`. */
  onDismissLater(): void {
    void this.dismissLater();
  }

  /**
   * Soft dismiss — the user did not flip any toggle. Persist an explicit
   * "no decision yet, asked though" timestamp so the question is not
   * surfaced again automatically. The user can still revisit in Settings.
   */
  async dismissLater(): Promise<void> {
    const current = await this.prefs.getPreferences();
    const now = new Date().toISOString();
    const patch: Partial<typeof current> = {};
    if (this.showNotifications() && current.notificationsDecidedAt == null) {
      patch.notificationsDecidedAt = now;
    }
    if (this.showAnalytics() && current.analyticsDecidedAt == null) {
      patch.analyticsDecidedAt = now;
      patch.analyticsEnabled = current.analyticsEnabled ?? false;
    }
    if (Object.keys(patch).length) {
      await this.prefs.savePreferences({ ...current, ...patch });
    }

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
