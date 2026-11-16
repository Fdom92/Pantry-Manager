import { computed, inject, Injectable, signal } from '@angular/core';
import { ANALYTICS_EVENTS, ONBOARDING_QUICK_SEED_ITEMS, ONBOARDING_SLIDES } from '@core/constants';
import { AnalyticsService } from '../analytics/analytics.service';
import { LocalStorageService } from '../shared/local-storage.service';
import { LoggerService } from '../shared/logger.service';
import type { OnboardingQuickSeedItem } from '@core/constants';
import { FOOD_CLASS_BY_KEY, resolveSuggestedExpiry, type SuggestedExpiry } from '@core/domain/pantry';
import { resolveNotificationsConsent } from '@core/domain/notifications/notification.domain';
import type { OnboardingSlide } from '@core/models/onboarding';
// Direct localStorage usage replaced by `LocalStorageService` (DI below).
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { FirstProductsService } from '../pantry/first-products.service';
import { ClockService } from '../shared/clock.service';
import { NotificationPermissionService } from '../notifications/notification-permission.service';
import { WelcomeNotificationService } from '../notifications/welcome-notification.service';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { register } from 'swiper/element/bundle';
import type { SwiperOptions } from 'swiper/types';

/** Minimal shape of a Swiper web component element we touch. */
interface SwiperElementLike extends HTMLElement {
  initialize?: () => void;
  swiper?: {
    isEnd?: boolean;
    realIndex?: number;
    activeIndex?: number;
    slideNext: (speed?: number) => void;
  };
}

type NotificationsDecision = 'granted' | 'denied' | 'unavailable' | 'later' | null;
type AnalyticsDecision = 'granted' | 'denied' | null;

let swiperRegistered = false;

@Injectable()
export class OnboardingStateService {
  private readonly navCtrl = inject(NavController);
  private readonly firstProducts = inject(FirstProductsService);
  private readonly clock = inject(ClockService);
  private readonly notificationPermission = inject(NotificationPermissionService);
  private readonly preferences = inject(SettingsPreferencesService);
  private readonly welcomeNotif = inject(WelcomeNotificationService);
  private readonly notificationScheduler = inject(NotificationSchedulerService);
  private readonly translate = inject(TranslateService);
  private readonly analytics = inject(AnalyticsService);
  private readonly localStorage = inject(LocalStorageService);
  private readonly logger = inject(LoggerService);

  readonly slideOptions: SwiperOptions = {
    speed: 550,
    spaceBetween: 24,
    grabCursor: true,
    effect: 'creative',
    pagination: { clickable: true },
    creativeEffect: {
      prev: { shadow: true, translate: ['-16%', 0, -1], opacity: 0.5 },
      next: { translate: ['16%', 0, 0], scale: 0.95, opacity: 1 },
    },
  };

  readonly currentSlideIndex = signal(0);

  readonly availableSlides = ONBOARDING_SLIDES as OnboardingSlide[];

  readonly quickSeedItems = ONBOARDING_QUICK_SEED_ITEMS as OnboardingQuickSeedItem[];

  /** Notification permission decision flag. null = not yet asked. */
  readonly notificationsDecision = signal<NotificationsDecision>(null);

  /** Analytics consent decision flag. null = not yet asked. */
  readonly analyticsDecision = signal<AnalyticsDecision>(null);

  /** Set of selected quick-seed item keys (slide 2). */
  readonly selectedSeedKeys = signal<ReadonlySet<string>>(new Set());

  /** Items selected, in stable order from constant. */
  readonly selectedSeedItems = computed(() => {
    const keys = this.selectedSeedKeys();
    return this.quickSeedItems.filter(item => keys.has(item.key));
  });

  readonly selectedCount = computed(() => this.selectedSeedKeys().size);

  /**
   * What the confirm slide promises each selected seed will get. It resolves
   * the date through the same function the creation does, from the same
   * declared food type, so the preview cannot drift from what is saved a tap
   * later. Before this the slide said "date pending" for every row, which
   * stopped being true once the app started inferring dates.
   */
  readonly selectedSeedPreviews = computed(() =>
    this.selectedSeedItems().map(seed => {
      const name = this.translate.instant(`onboarding.quickSeed.items.${seed.key}`);
      const cls = FOOD_CLASS_BY_KEY.get(seed.classKey)!;
      const suggested: SuggestedExpiry = resolveSuggestedExpiry(name, cls.foodType, new Date(this.clock.now()), undefined, seed.classKey);
      return { seed, name, ...suggested };
    })
  );

  constructor() {
    if (!swiperRegistered) {
      register();
      swiperRegistered = true;
    }
  }

  initializeSwiper(swiperEl: SwiperElementLike | null | undefined): void {
    if (!swiperEl) {
      return;
    }
    Object.assign(swiperEl, this.slideOptions);
    swiperEl.initialize?.();
  }

  onSlideChanged(swiperEl: SwiperElementLike | null | undefined): void {
    const swiper = swiperEl?.swiper;
    if (!swiper) {
      return;
    }
    const idx = swiper.realIndex ?? swiper.activeIndex ?? 0;
    this.currentSlideIndex.set(idx);
    const slide = this.availableSlides[idx];
    if (slide) {
      // Only fires for users who already opted in on the analytics slide; the
      // analytics slide itself records its own event via accept/dismiss handlers.
      this.analytics.track(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, {
        step_index: idx,
        step_key: slide.key,
      });
    }
  }

  isLastSlide(): boolean {
    const idx = this.currentSlideIndex();
    return Number.isFinite(idx) && idx >= 0 && idx >= this.availableSlides.length - 1;
  }

  async goToNextSlide(swiperEl: SwiperElementLike | null | undefined): Promise<void> {
    const swiper = swiperEl?.swiper;
    if (!swiper || swiper.isEnd) {
      await this.completeOnboarding();
      return;
    }
    swiper.slideNext(500);
  }

  /** User accepted notifications on slide 1. Requests OS permission and persists prefs. */
  async acceptNotifications(swiperEl: SwiperElementLike | null | undefined): Promise<void> {
    const granted = await this.notificationPermission.request();
    const { decision, shouldPersistDecision } = resolveNotificationsConsent(
      granted,
      this.notificationPermission.isUnavailable()
    );
    this.notificationsDecision.set(decision);
    const current = await this.preferences.getPreferences();
    await this.preferences.savePreferences({
      ...current,
      notificationsEnabled: granted ? true : current.notificationsEnabled,
      notifyOnExpired: granted ? true : current.notifyOnExpired,
      notifyOnNearExpiry: granted ? true : current.notifyOnNearExpiry,
      notifyOnLowStock: granted ? true : current.notifyOnLowStock,
      // A plugin failure isn't a decision — leave this unset so the
      // re-consent sheet's live permissionState() check gets a real chance
      // to ask again once the plugin recovers, instead of being permanently
      // blocked by a decidedAt stamp that never reflected a real choice.
      ...(shouldPersistDecision ? { notificationsDecidedAt: new Date().toISOString() } : {}),
    });
    if (granted) {
      await this.welcomeNotif.scheduleWelcomeNotification();
    }
    await this.goToNextSlide(swiperEl);
  }

  /** Haptics are best-effort on the seed grid; never block the toggle on it. */
  logSeedGridHapticsFailure(err: unknown): void {
    this.logger.warn('OnboardingStateService', 'Seed grid Haptics.impact failed', { err });
  }

  /** User postponed notifications on slide 1. */
  async dismissNotifications(swiperEl: SwiperElementLike | null | undefined): Promise<void> {
    this.notificationsDecision.set('later');
    // Record the implicit decline so the re-consent sheet does not re-ask
    // immediately on the dashboard.
    const current = await this.preferences.getPreferences();
    await this.preferences.savePreferences({
      ...current,
      notificationsDecidedAt: new Date().toISOString(),
    });
    await this.goToNextSlide(swiperEl);
  }

  /** User accepted anonymous analytics on the analytics slide. */
  async acceptAnalytics(swiperEl: SwiperElementLike | null | undefined): Promise<void> {
    this.analyticsDecision.set('granted');
    await this.analytics.optIn();
    await this.goToNextSlide(swiperEl);
  }

  /** User declined anonymous analytics. */
  async dismissAnalytics(swiperEl: SwiperElementLike | null | undefined): Promise<void> {
    this.analyticsDecision.set('denied');
    await this.analytics.optOut();
    await this.goToNextSlide(swiperEl);
  }

  /** Toggle quick-seed item selection (slide 2). */
  toggleSeedItem(key: string): void {
    const current = new Set(this.selectedSeedKeys());
    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }
    this.selectedSeedKeys.set(current);
  }

  isSeedItemSelected(key: string): boolean {
    return this.selectedSeedKeys().has(key);
  }

  async skipOnboarding(): Promise<void> {
    this.analytics.track(ANALYTICS_EVENTS.ONBOARDING_SKIPPED, {
      from_slide_index: this.currentSlideIndex(),
    });
    await this.completeOnboarding({ skipped: true });
  }

  async completeOnboarding(options?: { skipped?: boolean }): Promise<void> {
    this.localStorage.onboarding.setSeen(true);

    // Record a decision for any consent the user has not explicitly handled
    // (typically via "Skip"). Without this, the post-update re-consent sheet
    // would later surface the same question on the dashboard — confusing for
    // a user who already chose to bypass the onboarding deliberately.
    await this.recordImplicitConsentDecisions();

    this.analytics.track(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      seed_count: this.selectedCount(),
      notif_granted: this.notificationsDecision() === 'granted',
      analytics_granted: this.analyticsDecision() === 'granted',
      skipped: options?.skipped ?? false,
    });
    await this.firstProducts.save(
      this.selectedSeedItems().map(seed => {
        const cls = FOOD_CLASS_BY_KEY.get(seed.classKey)!;
        return {
          name: this.translate.instant(`onboarding.quickSeed.items.${seed.key}`),
          classKey: seed.classKey,
          storage: cls.storage,
          dateFromUser: false,
          source: 'suggestion' as const,
        };
      })
    );
    // Re-run after seeding so projected notifications reflect the new items.
    void this.notificationScheduler.scheduleAll();
    // First post-onboarding view = pantry so user sees their seeded products.
    // Subsequent app launches default-route back to /dashboard.
    await this.navCtrl.navigateRoot('/pantry');
  }

  /**
   * Persist an explicit "no" decision for every consent flow the user did not
   * confirm during onboarding. Prevents the re-consent sheet from re-asking the
   * same question on the dashboard immediately after a skip — that would feel
   * nagging.
   *
   * Only stamps `analyticsDecidedAt` and `notificationsDecidedAt`. The actual
   * `analyticsEnabled` / `notificationsEnabled` flags stay at whatever
   * `acceptAnalytics` / `acceptNotifications` already wrote, or the safe
   * default of false.
   */
  private async recordImplicitConsentDecisions(): Promise<void> {
    const current = await this.preferences.getPreferences();
    const now = new Date().toISOString();
    const patch: Partial<typeof current> = {};

    if (current.analyticsDecidedAt == null) {
      patch.analyticsDecidedAt = now;
      if (typeof current.analyticsEnabled !== 'boolean') {
        patch.analyticsEnabled = false;
      }
    }
    if (current.notificationsDecidedAt == null) {
      patch.notificationsDecidedAt = now;
    }

    if (Object.keys(patch).length) {
      await this.preferences.savePreferences({ ...current, ...patch });
    }
  }
}
