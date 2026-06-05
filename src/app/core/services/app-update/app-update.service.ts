import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  AppUpdate,
  AppUpdateAvailability,
  FlexibleUpdateInstallStatus,
} from '@capawesome/capacitor-app-update';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { LoggerService } from '../shared/logger.service';

/**
 * Wraps the Google Play in-app update API.
 *
 * Strategy:
 * - Runs on native Android only (no-op on web / iOS web bridge).
 * - On every cold launch, asks Google whether an update is available and
 *   what update modes the new build supports.
 * - **Immediate** update (a full-screen Google overlay that blocks app use
 *   until the install completes) is preferred — cleanest UX, no half-state.
 * - Falls back to **flexible** update (background download with a small
 *   prompt to restart) when the new build does not allow immediate.
 * - Listens to flexible install progress so we can prompt the user to
 *   reload once the download has finished.
 *
 * Plugin docs: https://capawesome.io/plugins/app-update/
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly analytics = inject(AnalyticsService);
  private readonly logger = inject(LoggerService);

  /** Guard so we don't trigger the prompt twice per session. */
  private alreadyHandled = false;

  /**
   * Entry point. Called from `AppComponent.initializeApp()` after the
   * analytics SDK is up. Failure is swallowed and logged — we never block
   * app startup on an update check.
   */
  async checkAndPrompt(): Promise<void> {
    if (this.alreadyHandled) return;
    if (!Capacitor.isNativePlatform()) return;
    this.alreadyHandled = true;

    try {
      const info = await AppUpdate.getAppUpdateInfo();
      this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_CHECK, {
        availability: info.updateAvailability,
        current_version: info.currentVersionCode,
        available_version: info.availableVersionCode,
      });

      if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) {
        return;
      }

      this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_AVAILABLE, {
        immediate_allowed: info.immediateUpdateAllowed,
        flexible_allowed: info.flexibleUpdateAllowed,
        update_priority: info.updatePriority,
        staleness_days: info.clientVersionStalenessDays,
      });

      if (info.immediateUpdateAllowed) {
        await this.startImmediateUpdate();
      } else if (info.flexibleUpdateAllowed) {
        await this.startFlexibleUpdate();
      } else {
        // Neither mode supported by the new build — open the store as a
        // last resort so the user can manually update.
        await AppUpdate.openAppStore();
      }
    } catch (err) {
      this.logger.warn('[AppUpdate] check failed', err);
      this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_FAILED, {
        reason: 'check_failed',
      });
    }
  }

  private async startImmediateUpdate(): Promise<void> {
    this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_STARTED, { mode: 'immediate' });
    try {
      const result = await AppUpdate.performImmediateUpdate();
      this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_COMPLETED, {
        mode: 'immediate',
        code: result.code,
      });
    } catch (err) {
      this.logger.warn('[AppUpdate] immediate update failed', err);
      this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_FAILED, {
        mode: 'immediate',
        reason: 'rejected_or_error',
      });
    }
  }

  private async startFlexibleUpdate(): Promise<void> {
    this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_STARTED, { mode: 'flexible' });
    // Subscribe to install state BEFORE kicking off the download so we
    // don't miss the "DOWNLOADED" event on fast networks.
    await AppUpdate.addListener('onFlexibleUpdateStateChange', async (state) => {
      if (state.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
        try {
          await AppUpdate.completeFlexibleUpdate();
          this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_COMPLETED, {
            mode: 'flexible',
          });
        } catch (err) {
          this.logger.warn('[AppUpdate] completeFlexibleUpdate failed', err);
        }
      } else if (state.installStatus === FlexibleUpdateInstallStatus.FAILED) {
        this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_FAILED, {
          mode: 'flexible',
          reason: 'install_failed',
        });
      }
    });

    try {
      const result = await AppUpdate.startFlexibleUpdate();
      this.logger.info('[AppUpdate] flexible update started', { code: result.code });
    } catch (err) {
      this.logger.warn('[AppUpdate] flexible update failed', err);
      this.analytics.track(ANALYTICS_EVENTS.APP_UPDATE_FAILED, {
        mode: 'flexible',
        reason: 'start_failed',
      });
    }
  }
}
