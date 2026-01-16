import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  inject,
  ViewChild,
} from '@angular/core';
import { OnboardingStateService } from '@core/services/onboarding';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, CommonModule, TranslateModule],
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [OnboardingStateService],
})
export class OnboardingPage implements AfterViewInit {
  @ViewChild('swiperRef') swiperElement?: ElementRef<any>;
  readonly facade = inject(OnboardingStateService);

  ngAfterViewInit(): void {
    this.facade.initializeSwiper(this.swiperElement?.nativeElement);
  }

  handleSlideChanged(): void {
    this.facade.handleSlideChanged(this.swiperElement?.nativeElement);
  }

  isLastSlide(): boolean {
    return this.facade.isLastSlide();
  }

  async goToNextSlide(): Promise<void> {
    await this.facade.goToNextSlide(this.swiperElement?.nativeElement);
  }

  async skipOnboarding(): Promise<void> {
    await this.facade.skipOnboarding();
  }

  async completeOnboarding(): Promise<void> {
    await this.facade.completeOnboarding();
  }
}
