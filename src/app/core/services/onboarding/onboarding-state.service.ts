import { computed, inject, Injectable, signal } from '@angular/core';
import { ONBOARDING_SLIDES } from '@core/constants/onboarding';
import { ONBOARDING_STORAGE_KEY, SETUP_STORAGE_KEY } from '@core/constants';
import { isLastIndex } from '@core/domain/onboarding';
import type { OnboardingSlide } from '@core/models/onboarding';
import { NavController } from '@ionic/angular';
import { register } from 'swiper/element/bundle';
import type { SwiperOptions } from 'swiper/types';

let swiperRegistered = false;

@Injectable()
export class OnboardingStateService {
  private readonly navCtrl = inject(NavController);
  private readonly alreadyCompletedOnboarding = this.getStoredFlag(ONBOARDING_STORAGE_KEY);
  private readonly alreadyCompletedSetup = this.getStoredFlag(SETUP_STORAGE_KEY);

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

  readonly availableSlides = computed<OnboardingSlide[]>(() => {
    return ONBOARDING_SLIDES;
  });

  constructor() {
    if (!swiperRegistered) {
      register();
      swiperRegistered = true;
    }
  }

  initializeSwiper(swiperEl: any): void {
    if (!swiperEl) {
      return;
    }
    Object.assign(swiperEl, this.slideOptions);
    swiperEl.initialize?.();
  }

  onSlideChanged(swiperEl: any): void {
    const swiper = swiperEl?.swiper;
    if (!swiper) {
      return;
    }
    this.currentSlideIndex.set(swiper.realIndex ?? swiper.activeIndex ?? 0);
  }

  isLastSlide(): boolean {
    return isLastIndex(this.currentSlideIndex(), this.availableSlides().length);
  }

  async goToNextSlide(swiperEl: any): Promise<void> {
    const swiper = swiperEl?.swiper;
    if (!swiper || swiper.isEnd) {
      await this.completeOnboarding();
      return;
    }
    swiper.slideNext(500);
  }

  async skipOnboarding(): Promise<void> {
    await this.completeOnboarding();
  }

  async completeOnboarding(): Promise<void> {
    this.persistOnboardingFlag();
    if (!this.alreadyCompletedOnboarding && !this.alreadyCompletedSetup) {
      await this.navCtrl.navigateRoot('/setup');
      return;
    }
    await this.navCtrl.navigateRoot('/dashboard');
  }

  private persistOnboardingFlag(): void {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch (err) {
      console.warn('[Onboarding] failed to persist onboarding flag', err);
    }
  }

  private getStoredFlag(key: string): boolean {
    try {
      return Boolean(localStorage.getItem(key));
    } catch {
      return false;
    }
  }
}
