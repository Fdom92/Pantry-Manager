import { Injectable, inject, signal } from '@angular/core';
import { STORAGE_KEYS } from '@core/constants';
import { getBooleanFlag, setBooleanFlag } from '@core/utils/storage-flag.util';
import { NotificationPermissionService } from '../notifications/notification-permission.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';

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

  /** True while the sheet is open. Used by the dashboard to avoid double-mounting. */
  readonly isSheetOpen = signal(false);

  /**
   * Whether we should surface the re-consent sheet to the current user.
   *
   * Only existing users (`ONBOARDING_FLAG === true`) qualify. Brand-new users
   * see both questions inside the onboarding itself and must never see this.
   */
  async shouldShow(): Promise<boolean> {
    const hasSeenOnboarding = getBooleanFlag(STORAGE_KEYS.ONBOARDING_FLAG);
    if (!hasSeenOnboarding) return false;

    const alreadyShown = getBooleanFlag(STORAGE_KEYS.RECONSENT_SHOWN);
    if (alreadyShown) return false;

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

    // Notifications: ask only if the OS permission has never been granted and
    // is not permanently denied (asking on denied is pointless — Android won't
    // surface the system dialog).
    const notifications =
      !this.permission.isGranted() && !this.permission.isPermanentlyDenied();

    // Analytics: ask only if we have never recorded a decision. Both true and
    // false `analyticsEnabled` after `analyticsDecidedAt` is set mean the user
    // already chose.
    const analytics = prefs.analyticsDecidedAt == null;

    return { notifications, analytics };
  }

  /**
   * Marks the sheet as shown. Called from the sheet on first present so a
   * crash mid-flow doesn't make the prompt reappear forever.
   */
  markShown(): void {
    setBooleanFlag(STORAGE_KEYS.RECONSENT_SHOWN, true);
  }
}
