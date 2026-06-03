import { computed, inject, Injectable, signal } from '@angular/core';
import { ONBOARDING_QUICK_SEED_ITEMS, ONBOARDING_SLIDES, STORAGE_KEYS } from '@core/constants';
import type { OnboardingQuickSeedItem } from '@core/constants';
import { buildAddItemPayload, FRESH_QTY } from '@core/domain/pantry';
import type { OnboardingSlide } from '@core/models/onboarding';
import type { PantryItem } from '@core/models/pantry';
import { createDocumentId } from '@core/utils';
import { setBooleanFlag } from '@core/utils/storage-flag.util';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { HistoryEventManagerService } from '../history/history-event-manager.service';
import { NotificationPermissionService } from '../notifications/notification-permission.service';
import { RecoveryNotificationsService } from '../notifications/recovery-notifications.service';
import { WelcomeNotificationService } from '../notifications/welcome-notification.service';
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

type NotificationsDecision = 'granted' | 'denied' | 'later' | null;

let swiperRegistered = false;

@Injectable()
export class OnboardingStateService {
  private readonly navCtrl = inject(NavController);
  private readonly pantryStore = inject(PantryStoreService);
  private readonly historyManager = inject(HistoryEventManagerService);
  private readonly notificationPermission = inject(NotificationPermissionService);
  private readonly preferences = inject(SettingsPreferencesService);
  private readonly welcomeNotif = inject(WelcomeNotificationService);
  private readonly recoveryNotif = inject(RecoveryNotificationsService);
  private readonly translate = inject(TranslateService);

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

  /** Set of selected quick-seed item keys (slide 2). */
  readonly selectedSeedKeys = signal<ReadonlySet<string>>(new Set());

  /** Items selected, in stable order from constant. */
  readonly selectedSeedItems = computed(() => {
    const keys = this.selectedSeedKeys();
    return this.quickSeedItems.filter(item => keys.has(item.key));
  });

  readonly selectedCount = computed(() => this.selectedSeedKeys().size);

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
    this.currentSlideIndex.set(swiper.realIndex ?? swiper.activeIndex ?? 0);
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
    this.notificationsDecision.set(granted ? 'granted' : 'denied');
    if (granted) {
      const current = await this.preferences.getPreferences();
      await this.preferences.savePreferences({
        ...current,
        notificationsEnabled: true,
        notifyOnExpired: true,
        notifyOnNearExpiry: true,
        notifyOnLowStock: true,
      });
      await this.welcomeNotif.scheduleWelcomeNotification();
    }
    await this.goToNextSlide(swiperEl);
  }

  /** User postponed notifications on slide 1. */
  async dismissNotifications(swiperEl: SwiperElementLike | null | undefined): Promise<void> {
    this.notificationsDecision.set('later');
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
    await this.completeOnboarding();
  }

  async completeOnboarding(): Promise<void> {
    setBooleanFlag(STORAGE_KEYS.ONBOARDING_FLAG, true);
    await this.bulkCreateSeedItems();
    // Recovery window only makes sense if we can actually push to the user.
    if (this.notificationsDecision() === 'granted') {
      try {
        await this.recoveryNotif.scheduleRecoveryWindow();
      } catch {
        // never block onboarding completion on a scheduling failure
      }
    }
    // First post-onboarding view = pantry so user sees their seeded products.
    // Subsequent app launches default-route back to /dashboard.
    await this.navCtrl.navigateRoot('/pantry');
  }

  /**
   * Create PantryItems for every selected quick-seed entry.
   * Items with `alwaysNoExpiry` get a noExpiry batch; all others stay with no
   * expirationDate set so the user fills it as they actually need it (Option A
   * — never invent dates).
   */
  private async bulkCreateSeedItems(): Promise<void> {
    const selected = this.selectedSeedItems();
    if (!selected.length) {
      return;
    }
    const timestamp = new Date().toISOString();
    const sessionId = selected.length > 1 ? createDocumentId('session') : undefined;
    for (const seed of selected) {
      const name = this.translate.instant(`onboarding.quickSeed.items.${seed.key}`);
      const quantity = seed.productType === 'fresh' ? FRESH_QTY.sufficient : 1;
      const base = buildAddItemPayload({
        id: createDocumentId('item'),
        nowIso: timestamp,
        name,
        quantity,
        noExpiry: seed.alwaysNoExpiry,
      });
      const item: PantryItem = {
        ...base,
        productType: seed.productType,
        foodType: seed.foodType,
      };
      await this.pantryStore.addItem(item);
      await this.historyManager.logAddNewItem(item, quantity, sessionId, timestamp);
    }
  }
}
