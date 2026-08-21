import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FoodType } from '@core/models/shared/enums.model';
import { assertNever } from '@core/utils/assert-never.util';
import { IonChip, IonContent, IonIcon, IonLabel, IonModal } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Single chip showing a product's food type, tapping it opens a sheet with the
 * seven options.
 *
 * The type is normally inferred from the product name, and the inference also
 * drives the suggested expiry date. Showing it here is what makes that date
 * explainable: without the type on screen, a pre-filled date looks like it came
 * from nowhere. Correcting the type is also the escape hatch when the guess is
 * wrong or the name is unknown.
 *
 * @input  foodType       - current type, or null when nothing was inferred
 * @output foodTypeChange - emits the picked type
 */
@Component({
  selector: 'app-food-type-picker',
  standalone: true,
  imports: [IonChip, IonLabel, IonIcon, IonModal, IonContent, TranslateModule],
  template: `
    <ion-chip
      class="food-type-chip"
      [class.food-type-chip--unset]="!foodType"
      button="true"
      [attr.aria-label]="'pantry.form.foodType.label' | translate"
      (click)="sheetOpen.set(true)">
      <ion-icon [name]="foodType ? iconFor(foodType) : 'help-circle-outline'"></ion-icon>
      <ion-label>
        @if (foodType) {
          {{ 'pantry.form.foodType.' + foodType | translate }}
        } @else {
          {{ 'pantry.form.foodType.unassigned' | translate }}
        }
      </ion-label>
    </ion-chip>

    <ion-modal
      class="app-sheet-modal food-type-picker-sheet"
      [isOpen]="sheetOpen()"
      [breakpoints]="[0, 0.5]"
      [initialBreakpoint]="0.5"
      [handle]="true"
      (didDismiss)="sheetOpen.set(false)">
      <ng-template>
        <ion-content>
          <div class="food-type-sheet">
            <h2 class="food-type-sheet__title">{{ 'pantry.form.foodType.label' | translate }}</h2>
            <div class="food-type-sheet__options">
              @for (type of foodTypes; track type) {
                <ion-chip
                  class="food-type-option"
                  [class.food-type-option--active]="foodType === type"
                  button="true"
                  [attr.aria-pressed]="foodType === type"
                  (click)="pick(type)">
                  <ion-icon [name]="iconFor(type)"></ion-icon>
                  <ion-label>{{ 'pantry.form.foodType.' + type | translate }}</ion-label>
                </ion-chip>
              }
            </div>
          </div>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styleUrls: ['./food-type-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FoodTypePickerComponent {
  @Input() foodType: FoodType | null = null;
  @Output() readonly foodTypeChange = new EventEmitter<FoodType>();

  readonly foodTypes = Object.values(FoodType);
  readonly sheetOpen = signal(false);

  pick(type: FoodType): void {
    this.foodTypeChange.emit(type);
    this.sheetOpen.set(false);
  }

  /**
   * Ionicons name per type — keeps the chip readable when space is tight.
   *
   * No two of these should be confusable at chip size, which is why the fruit
   * icon is the apple and not the flower: `nutrition-outline` IS an apple, so
   * having it stand for carbs while fruit got a flower had them backwards.
   */
  iconFor(type: FoodType): string {
    switch (type) {
      case FoodType.PROTEIN:   return 'fish-outline';
      case FoodType.CARB:      return 'pizza-outline';
      case FoodType.VEGETABLE: return 'leaf-outline';
      case FoodType.FRUIT:     return 'nutrition-outline';
      case FoodType.DAIRY:     return 'ice-cream-outline';
      case FoodType.BEVERAGE:  return 'water-outline';
      case FoodType.NON_PERISHABLE: return 'flask-outline';
      case FoodType.HOUSEHOLD: return 'home-outline';
      case FoodType.OTHER:     return 'ellipsis-horizontal-outline';
    }
    // No `default`: a new FoodType must choose an icon here rather than quietly
    // rendering the "other" dots.
    return assertNever(type);
  }
}
