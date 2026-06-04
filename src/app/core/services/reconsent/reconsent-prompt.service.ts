import { Injectable, inject, signal } from '@angular/core';
import { NotificationPermissionService } from '../notifications/notification-permission.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { LocalStorageService } from '../shared/local-storage.service';

/**
 * Decides whether the post-update consent sheet must be shown to existing users
 * who completed the v4.5 (or earlier) onboarding and therefore missed:
 *
 * - The dedicated **analytics** consent slide (added in v4.6).
 * - A retroactive chance to enable **notifications** if the OS permission was
 *   never granted (declined or simply skipped).
 *
 * Strategy: show the sheet **at most once per install** from the dashboard,
 * never as a launch-blocking modal. Tracked via `STORAGE_KEYS.RECONSENT_SHOWN`
 * so a dismiss is final — the user can always change their mind in
 * Settings → Privacidad / Notificaciones.
 */
@Injectable({ providedIn: 'root' })
export class ReconsentPromptService {
  private readonly permission = inject(NotificationPermissionService);
  private readonly prefs = inject(SettingsPreferencesService);
  private readonly localStorage = inject(LocalStorageService);

  /** True while the sheet is open. Used by the dashboard to avoid double-mounting. */
  readonly isSheetOpen = signal(false);

  /**
   * Whether we should surface the re-consent sheet to the current user.
   *
   * Only existing users (`ONBOARDING_FLAG === true`) qualify. Brand-new users
   * see both questions inside the onboarding itself and must never see this.
   */
  async shouldShow(): Promise<boolean> {
    if (!this.localStorage.onboarding.isSeen()) return false;
    if (this.localStorage.reconsent.isShown()) return false;

    const pending = await this.resolvePendingQuestions();
    return pending.notifications || pending.analytics;
  }

  /**
   * Returns which questions still need an answer from the user.
   * Used by the sheet to render only the relevant toggles.
   */
  async resolvePendingQuestions(): Promise<{
    notifications: boolean;
    analytics: boolean;
  }> {
    const prefs = await this.prefs.getPreferences();
    await this.permission.init();

    // Notifications gate:
    //   1. If we recorded a decision in preferences, never ask again here —
    //      the user can revisit in Settings → Notificaciones.
    //   2. If the OS reports the permission is granted or permanently denied,
    //      asking adds nothing (granted = already on; denied = OS dialog won't
    //      reappear on Android).
    //   3. The default `permissionState === 'unknown'` happens in web dev and
    //      occasionally in fresh Capacitor sessions; treat it as "do not ask"
    //      to avoid prompting users whose OS permission may already be on but
    //      we just haven't queried yet.
    const permissionState = this.permission.permissionState();
    const notificationsAlreadyDecided = prefs.notificationsDecidedAt != null;
    const notifications =
      !notificationsAlreadyDecided &&
      permissionState !== 'granted' &&
      permissionState !== 'denied' &&
      permissionState !== 'unknown';

    // Analytics gate: ask only if we have never recorded a decision. Both
    // true and false `analyticsEnabled` after `analyticsDecidedAt` is set
    // mean the user already chose.
    const analytics = prefs.analyticsDecidedAt == null;

    return { notifications, analytics };
  }

  /**
   * Marks the sheet as shown. Called from the sheet on first present so a
   * crash mid-flow doesn't make the prompt reappear forever.
   */
  markShown(): void {
    this.localStorage.reconsent.markShown();
  }
}
