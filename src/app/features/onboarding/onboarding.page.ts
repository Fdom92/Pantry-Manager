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
import { OnboardingStateService } from '@core/services/onboarding/onboarding-state.service';
import type { AddOption } from '@core/domain/pantry';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EntityAutocompleteComponent, type AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';
import { FoodTypePickerComponent } from '@shared/components/food-type-picker/food-type-picker.component';
import { RelativeDaysPipe } from '@shared/pipes/date-display.pipes';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    RelativeDaysPipe,
    EntityAutocompleteComponent,
    ExpiryPickerComponent,
    FoodTypePickerComponent,
    IonContent,
    IonButton,
    IonIcon,
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

  /** What the user is typing on the add step, for the "Añadir «X»" option. */
  readonly query = signal('');

  readonly addItems = computed<AutocompleteItem<never, AddOption>[]>(() =>
    this.facade.addOptions().map(option => ({
      id: option.kind === 'basic' ? `basic:${option.seed.key}` : option.item._id,
      title: option.kind === 'basic' ? option.name : option.item.name,
      emoji: option.kind === 'basic' ? option.seed.emoji : undefined,
      meta: option,
    }))
  );

  ngAfterViewInit(): void {
    this.facade.initializeSwiper(this.swiperElement?.nativeElement);
  }

  onSlideChanged(): void {
    this.facade.onSlideChanged(this.swiperElement?.nativeElement);
  }

  async goToNextSlide(): Promise<void> {
    await this.facade.goToNextSlide(this.swiperElement?.nativeElement);
  }

  onOptionSelected(item: AutocompleteItem<never, AddOption>): void {
    if (item.meta) {
      this.facade.addDraft(item.meta);
    }
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
