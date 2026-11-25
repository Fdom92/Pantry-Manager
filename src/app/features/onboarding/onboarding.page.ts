import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { OnboardingStateService } from '@core/services/onboarding/onboarding-state.service';
import { IonButton, IonContent, IonIcon, IonInput } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';
import { RelativeDaysPipe } from '@shared/pipes/date-display.pipes';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    RelativeDaysPipe,
    ExpiryPickerComponent,
    IonContent,
    IonButton,
    IonIcon,
    IonInput,
    TranslateModule,
  ],
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [OnboardingStateService],
})
export class OnboardingPage implements AfterViewInit {
  @ViewChild('swiperRef') swiperElement?: ElementRef<HTMLElement>;
  readonly facade = inject(OnboardingStateService);

  /** "Otro producto…" reveals the input for a product that is not a basic. */
  readonly otherOpen = signal(false);
  readonly typed = signal('');

  ngAfterViewInit(): void {
    this.facade.initializeSwiper(this.swiperElement?.nativeElement);
  }

  onSlideChanged(): void {
    this.facade.onSlideChanged(this.swiperElement?.nativeElement);
  }

  async goToNextSlide(): Promise<void> {
    await this.facade.goToNextSlide(this.swiperElement?.nativeElement);
  }

  /** The keyboard shrinks the card after focus, leaving the input below the fold; bring it back. */
  revealInput(input: EventTarget | null): void {
    // Only the card scrolls: scrollIntoView would also shift the page under the swiper.
    setTimeout(() => {
      const el = input as HTMLElement | null;
      const card = el?.closest('.slide-card');
      if (el && card) {
        card.scrollTop = el.offsetTop + el.offsetHeight - card.clientHeight;
      }
    }, 350);
  }

  addTyped(): void {
    this.facade.addDraft(this.typed());
    this.typed.set('');
  }

  async onContinueFromAdd(): Promise<void> {
    await this.facade.continueFromAdd(this.swiperElement?.nativeElement);
  }

  async onStartEmpty(): Promise<void> {
    await this.facade.startEmpty(this.swiperElement?.nativeElement);
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
