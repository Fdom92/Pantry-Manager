import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  inject,
  ViewChild,
} from '@angular/core';
import { OnboardingStateService } from '@core/services/onboarding/onboarding-state.service';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { OnboardingSeedGridComponent } from './components/seed-grid/seed-grid.component';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [IonContent, IonButton, IonIcon, TranslateModule, OnboardingSeedGridComponent],
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [OnboardingStateService],
})
export class OnboardingPage implements AfterViewInit {
  @ViewChild('swiperRef') swiperElement?: ElementRef<HTMLElement>;
  readonly facade = inject(OnboardingStateService);

  ngAfterViewInit(): void {
    this.facade.initializeSwiper(this.swiperElement?.nativeElement);
  }

  onSlideChanged(): void {
    this.facade.onSlideChanged(this.swiperElement?.nativeElement);
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

  async onAcceptNotifications(): Promise<void> {
    await this.facade.acceptNotifications(this.swiperElement?.nativeElement);
  }

  async onDismissNotifications(): Promise<void> {
    await this.facade.dismissNotifications(this.swiperElement?.nativeElement);
  }

  async onAcceptAnalytics(): Promise<void> {
    await this.facade.acceptAnalytics(this.swiperElement?.nativeElement);
  }

  async onDismissAnalytics(): Promise<void> {
    await this.facade.dismissAnalytics(this.swiperElement?.nativeElement);
  }
}
