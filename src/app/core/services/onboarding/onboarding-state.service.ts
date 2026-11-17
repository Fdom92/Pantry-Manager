import { computed, inject, Injectable, signal } from '@angular/core';
import { ANALYTICS_EVENTS, ONBOARDING_QUICK_SEED_ITEMS, ONBOARDING_SLIDES } from '@core/constants';
import type { FoodType } from '@core/models/shared';
import { daysUntilExpiry } from '@core/utils/date.util';
import { formatFriendlyName, normalizeProductKey, normalizeTrim } from '@core/utils/normalization.util';
import { AnalyticsService } from '../analytics/analytics.service';
import { LocalStorageService } from '../shared/local-storage.service';
import { LoggerService } from '../shared/logger.service';
import { ToastService } from '../shared/toast.service';
import {
  buildAddOptions,
  expiryAfterFoodTypeChange,
  FOOD_CLASS_BY_KEY,
  resolveFoodClass,
  resolveSuggestedExpiry,
  type AddOption,
} from '@core/domain/pantry';
import { resolveNotificationsConsent } from '@core/domain/notifications/notification.domain';
import type { OnboardingSlide } from '@core/models/onboarding';
// Direct localStorage usage replaced by `LocalStorageService` (DI below).
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { FirstProductsService, type ProductDraft } from '../pantry/first-products.service';
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
  private readonly toast = inject(ToastService);

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

  /** Notification permission decision flag. null = not yet asked. */
  readonly notificationsDecision = signal<NotificationsDecision>(null);

  /** Analytics consent decision flag. null = not yet asked. */
  readonly analyticsDecision = signal<AnalyticsDecision>(null);

  /** The products typed or picked on the add step, saved when the user continues. */
  readonly drafts = signal<ProductDraft[]>([]);

  /** Set once the drafts are in the store; the add step is then read-only. */
  readonly draftsSaved = signal(false);

  readonly firstDraft = computed(() => this.drafts()[0] ?? null);

  /** Days until the first draft expires, for the notification preview; NaN without a date. */
  readonly firstDraftDays = computed(() => daysUntilExpiry(this.firstDraft()?.expirationDate, this.clock.now()));

  /** The 25 basics, translated: a new user has no products of their own to suggest. */
  readonly addOptions = computed<AddOption[]>(() =>
    buildAddOptions(
      [],
      ONBOARDING_QUICK_SEED_ITEMS.map(seed => ({ seed, name: this.translate.instant(`onboarding.quickSeed.items.${seed.key}`) as string })),
      '',
    )
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

  /** A basic picked from the list, or a name the user typed. */
  addDraft(option: AddOption | string): void {
    const draft = typeof option === 'string' ? this.typedDraft(option) : option.kind === 'basic' ? this.basicDraft(option) : null;
    if (!draft) {
      return;
    }
    const key = normalizeProductKey(draft.name);
    if (this.drafts().some(d => normalizeProductKey(d.name) === key)) {
      return;
    }
    this.drafts.update(current => [...current, draft]);
  }

  removeDraft(index: number): void {
    this.drafts.update(current => current.filter((_, i) => i !== index));
  }

  /** A type change re-suggests the date unless the user set it; a class of another type no longer applies. */
  setDraftFoodType(index: number, foodType: FoodType): void {
    this.updateDraft(index, draft => ({
      ...draft,
      foodType,
      classKey: draft.classKey && FOOD_CLASS_BY_KEY.get(draft.classKey)?.foodType === foodType ? draft.classKey : undefined,
      ...expiryAfterFoodTypeChange(draft, foodType, new Date(this.clock.now())),
    }));
  }

  setDraftDate(index: number, date: string | undefined): void {
    this.updateDraft(index, draft => ({
      ...draft,
      expirationDate: date || undefined,
      noExpiry: date ? undefined : draft.noExpiry,
      dateFromUser: true,
    }));
  }

  toggleDraftNoExpiry(index: number): void {
    this.updateDraft(index, draft => ({
      ...draft,
      noExpiry: !draft.noExpiry || undefined,
      expirationDate: draft.noExpiry ? draft.expirationDate : undefined,
      dateFromUser: true,
    }));
  }

  /**
   * "Continuar" on the add step. Saved now, not at the end, so the notification
   * preview already has the product and closing the app mid-way does not lose it.
   */
  async continueFromAdd(swiperEl: SwiperElementLike | null | undefined): Promise<void> {
    if (!(await this.saveDrafts())) {
      return;
    }
    await this.goToNextSlide(swiperEl);
  }

  /** "Empezar vacío": nothing is saved, and the preview falls back to its generic text. */
  async startEmpty(swiperEl: SwiperElementLike | null | undefined): Promise<void> {
    if (!this.draftsSaved()) {
      this.drafts.set([]);
    }
    await this.goToNextSlide(swiperEl);
  }

  private async saveDrafts(): Promise<boolean> {
    if (this.draftsSaved()) {
      return true;
    }
    // Set before awaiting so a double tap or a swipe cannot save the same drafts twice.
    this.draftsSaved.set(true);
    try {
      await this.firstProducts.save(this.drafts());
      return true;
    } catch (err) {
      this.draftsSaved.set(false);
      this.logger.error('OnboardingStateService', 'Saving the first products failed', { err });
      this.toast.error('onboarding.slides.add.saveError');
      return false;
    }
  }

  private basicDraft(option: Extract<AddOption, { kind: 'basic' }>): ProductDraft {
    const cls = FOOD_CLASS_BY_KEY.get(option.seed.classKey)!;
    const { source: _source, ...expiry } = resolveSuggestedExpiry(option.name, cls.foodType, new Date(this.clock.now()), undefined, cls.key);
    return { name: option.name, classKey: cls.key, foodType: cls.foodType, storage: cls.storage, ...expiry, dateFromUser: false, source: 'suggestion' };
  }

  private typedDraft(text: string): ProductDraft | null {
    const trimmed = normalizeTrim(text);
    if (!trimmed) {
      return null;
    }
    const name = formatFriendlyName(trimmed, trimmed);
    const cls = resolveFoodClass(name);
    const { source: _source, ...expiry } = resolveSuggestedExpiry(name, cls?.foodType, new Date(this.clock.now()), undefined, cls?.key);
    return {
      name,
      ...(cls ? { classKey: cls.key, foodType: cls.foodType } : {}),
      storage: cls?.storage ?? 'pantry',
      ...expiry,
      dateFromUser: false,
      source: 'typed',
    };
  }

  private updateDraft(index: number, updater: (draft: ProductDraft) => ProductDraft): void {
    this.drafts.update(current => current.map((draft, i) => (i === index ? updater(draft) : draft)));
  }

  async completeOnboarding(): Promise<void> {
    this.localStorage.onboarding.setSeen(true);

    // Record a decision for any consent the user has not explicitly handled. Without this, the post-update re-consent sheet
    // would later surface the same question on the dashboard — confusing for
    // a user who already chose to bypass the onboarding deliberately.
    await this.recordImplicitConsentDecisions();

    // Final prop set is redesigned with activation_reached (Task B5).
    this.analytics.track(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      notif_granted: this.notificationsDecision() === 'granted',
      analytics_granted: this.analyticsDecision() === 'granted',
    });
    // Safety net: a swipe past the add step skips "Continuar"; its drafts still count.
    await this.saveDrafts();
    // Re-run so projected notifications reflect the new items.
    void this.notificationScheduler.scheduleAll();
    // First post-onboarding view = pantry so the user sees their first products.
    // Subsequent app launches default-route back to /dashboard.
    await this.navCtrl.navigateRoot('/pantry');
  }

  /**
   * Persist an explicit "no" decision for every consent flow the user did not
   * confirm during onboarding. Prevents the re-consent sheet from re-asking the
   * same question on the dashboard right after onboarding — that would feel
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
