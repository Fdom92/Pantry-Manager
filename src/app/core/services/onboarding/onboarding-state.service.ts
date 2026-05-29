import { inject, Injectable, signal } from '@angular/core';
import { ONBOARDING_SLIDES } from '@core/constants/onboarding';
import { STORAGE_KEYS } from '@core/constants';
import type { OnboardingSlide } from '@core/models/onboarding';
import { getBooleanFlag, setBooleanFlag } from '@core/utils/storage-flag.util';
import { NavController } from '@ionic/angular';
import { PantryService } from '../pantry/pantry.service';
import { register } from 'swiper/element/bundle';
import type { SwiperOptions } from 'swiper/types';
import { Router } from '@angular/router';

let swiperRegistered = false;

@Injectable()
export class OnboardingStateService {
  private readonly navCtrl = inject(NavController);
  private readonly router = inject(Router);
  private readonly pantryService = inject(PantryService);
  private readonly alreadyCompletedOnboarding = getBooleanFlag(STORAGE_KEYS.ONBOARDING_FLAG);

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
    const idx = this.currentSlideIndex();
    return Number.isFinite(idx) && idx >= 0 && idx >= this.availableSlides.length - 1;
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
    setBooleanFlag(STORAGE_KEYS.ONBOARDING_FLAG, true);
    const items = await this.pantryService.getAll();
    if (!items.length) {
      // User has no items yet — navigate to pantry with add modal open for first engagement
      await this.router.navigate(['/pantry'], { queryParams: { openAddModal: 'true' } });
      return;
    }
    await this.navCtrl.navigateRoot('/dashboard');
  }
}
