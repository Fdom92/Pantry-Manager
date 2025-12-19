import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ONBOARDING_STORAGE_KEY } from '@core/constants';
import { OnboardingSlide } from '@core/models/onboarding';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { NavController } from '@ionic/angular';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { register } from 'swiper/element/bundle';
import type { SwiperOptions } from 'swiper/types';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, CommonModule, TranslateModule],
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class OnboardingPage implements AfterViewInit {
  @ViewChild('swiperRef') swiperElement?: ElementRef<any>;
  // DI
  private readonly navCtrl = inject(NavController);
  private readonly revenuecat = inject(RevenuecatService);
  // Data
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
  private readonly onboardingCoreSlides: OnboardingSlide[] = [
    {
      key: 'organize',
      titleKey: 'onboarding.slides.organize.title',
      descriptionKey: 'onboarding.slides.organize.description',
      icon: 'sparkles-outline',
    },
    {
      key: 'batches',
      titleKey: 'onboarding.slides.batches.title',
      descriptionKey: 'onboarding.slides.batches.description',
      icon: 'layers-outline',
    },
    {
      key: 'suggestions',
      titleKey: 'onboarding.slides.suggestions.title',
      descriptionKey: 'onboarding.slides.suggestions.description',
      icon: 'bulb-outline',
    },
  ];
  private readonly agentSlideLocked: OnboardingSlide = {
    key: 'agent',
    titleKey: 'onboarding.slides.agent.title',
    descriptionKey: 'onboarding.slides.agent.description',
    icon: 'chatbubbles-outline',
    badgeKey: 'onboarding.slides.agent.badge',
    pro: true,
  };
  private readonly agentSlideUnlocked: OnboardingSlide = {
    key: 'agent',
    titleKey: 'onboarding.slides.agent.titlePro',
    descriptionKey: 'onboarding.slides.agent.descriptionPro',
    icon: 'chatbubbles-outline',
    badgeKey: 'onboarding.slides.agent.badgePro',
    pro: true,
  };
  // Signals
  readonly currentSlideIndex = signal(0);
  readonly isProUser = toSignal(this.revenuecat.isPro$, { initialValue: false });
  // Computed Signals
  readonly availableSlides = computed<OnboardingSlide[]>(() => {
    const agentSlide = this.isProUser() ? this.agentSlideUnlocked : this.agentSlideLocked;
    return [...this.onboardingCoreSlides, agentSlide];
  });

  constructor() {
    // Register the Swiper to make it works
    register();
  }

  ngAfterViewInit(): void {
    const swiperEl = this.swiperElement?.nativeElement;
    if (!swiperEl) {
      return;
    }
    Object.assign(swiperEl, this.slideOptions);
    swiperEl.initialize?.();
  }

  handleSlideChanged(): void {
    const swiper = this.getSwiperInstance();
    if (!swiper) {
      return;
    }
    this.currentSlideIndex.set(swiper.realIndex ?? swiper.activeIndex ?? 0);
  }

  isLastSlide(): boolean {
    return this.currentSlideIndex() >= this.availableSlides().length - 1;
  }

  async goToNextSlide(): Promise<void> {
    const swiper = this.getSwiperInstance();
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
    await this.navCtrl.navigateRoot('/dashboard');
  }

  private persistOnboardingFlag(): void {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch (err) {
      console.warn('[Onboarding] failed to persist onboarding flag', err);
    }
  }
  private getSwiperInstance(): any {
    return this.swiperElement?.nativeElement?.swiper;
  }
}
