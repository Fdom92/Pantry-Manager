import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectionStrategy, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, ViewChild, computed, signal } from '@angular/core';
import { ONBOARDING_STORAGE_KEY } from '@core/constants';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonicModule, NavController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { register } from 'swiper/element/bundle';
import type { SwiperOptions } from 'swiper/types';
import { addIcons } from 'ionicons';
import {
  apertureOutline,
  bulbOutline,
  chatbubblesOutline,
  layersOutline,
  sparklesOutline,
} from 'ionicons/icons';

interface OnboardingSlide {
  key: string;
  titleKey: string;
  descriptionKey: string;
  icon: string;
  badgeKey?: string | null;
  pro?: boolean;
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [IonicModule, CommonModule, TranslateModule],
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class OnboardingPage implements AfterViewInit {
  @ViewChild('swiperRef') swiper?: ElementRef<any>;

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

  private readonly baseSlides: OnboardingSlide[] = [
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

  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: false });
  readonly slidesToShow = computed<OnboardingSlide[]>(() => {
    const agentSlide = this.isPro() ? this.agentSlideUnlocked : this.agentSlideLocked;
    return [...this.baseSlides, agentSlide];
  });

  readonly activeIndex = signal(0);

  constructor(
    private readonly navCtrl: NavController,
    private readonly revenuecat: RevenuecatService,
  ) {
    addIcons({
      apertureOutline,
      sparklesOutline,
      layersOutline,
      bulbOutline,
      chatbubblesOutline,
    });
    register();
  }

  ngAfterViewInit(): void {
    const swiperEl = this.swiper?.nativeElement;
    if (!swiperEl) {
      return;
    }
    Object.assign(swiperEl, this.slideOptions);
    swiperEl.initialize?.();
  }

  onSlideChanged(): void {
    const swiper = this.swiper?.nativeElement?.swiper;
    if (!swiper) {
      return;
    }
    this.activeIndex.set(swiper.realIndex ?? swiper.activeIndex ?? 0);
  }

  isLastSlide(): boolean {
    return this.activeIndex() >= this.slidesToShow().length - 1;
  }

  async onNext(): Promise<void> {
    const swiper = this.swiper?.nativeElement?.swiper;
    if (!swiper || swiper.isEnd) {
      await this.onStart();
      return;
    }
    swiper.slideNext(500);
  }

  async onSkip(): Promise<void> {
    await this.onStart();
  }

  async onStart(): Promise<void> {
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
}
