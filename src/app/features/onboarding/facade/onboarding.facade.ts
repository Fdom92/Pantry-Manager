import { Injectable, inject } from '@angular/core';
import { OnboardingStateService } from '@core/services/onboarding';

@Injectable()
export class OnboardingFacade {
  private readonly state = inject(OnboardingStateService);

  readonly slideOptions = this.state.slideOptions;
  readonly currentSlideIndex = this.state.currentSlideIndex;
  readonly availableSlides = this.state.availableSlides;

  initializeSwiper(swiperEl: any): void {
    this.state.initializeSwiper(swiperEl);
  }

  handleSlideChanged(swiperEl: any): void {
    this.state.handleSlideChanged(swiperEl);
  }

  isLastSlide(): boolean {
    return this.state.isLastSlide();
  }

  async goToNextSlide(swiperEl: any): Promise<void> {
    await this.state.goToNextSlide(swiperEl);
  }

  async skipOnboarding(): Promise<void> {
    await this.state.skipOnboarding();
  }

  async completeOnboarding(): Promise<void> {
    await this.state.completeOnboarding();
  }
}

