import { inject, Injectable, signal } from '@angular/core';
import { ONBOARDING_SLIDES } from '@core/constants/onboarding';
import { ONBOARDING_STORAGE_KEY, SETUP_STORAGE_KEY } from '@core/constants';
import { isLastIndex } from '@core/domain/onboarding';
import type { OnboardingSlide } from '@core/models/onboarding';
import { getBooleanFlag, setBooleanFlag } from '@core/utils/storage-flag.util';
import { NavController } from '@ionic/angular';
import { register } from 'swiper/element/bundle';
import type { SwiperOptions } from 'swiper/types';

let swiperRegistered = false;

@Injectable()
export class OnboardingStateService {
  private readonly navCtrl = inject(NavController);
  private readonly alreadyCompletedOnboarding = getBooleanFlag(ONBOARDING_STORAGE_KEY);
  private readonly alreadyCompletedSetup = getBooleanFlag(SETUP_STORAGE_KEY);

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
    return isLastIndex(this.currentSlideIndex(), this.availableSlides.length);
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
    setBooleanFlag(ONBOARDING_STORAGE_KEY, true);
    if (!this.alreadyCompletedOnboarding && !this.alreadyCompletedSetup) {
      await this.navCtrl.navigateRoot('/setup');
      return;
    }
    await this.navCtrl.navigateRoot('/dashboard');
  }
}
