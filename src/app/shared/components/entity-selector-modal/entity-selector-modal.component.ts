import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import {
  IonButton,
  IonIcon,
  IonModal,
  IonSpinner,
  IonFooter,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EntityAutocompleteComponent, type AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';
import { ExpiryPickerComponent } from '@shared/components/expiry-picker/expiry-picker.component';
import { FoodTypePickerComponent } from '@shared/components/food-type-picker/food-type-picker.component';
import type { FoodType } from '@core/models/shared/enums.model';

export interface EntitySelectorEntry {
  id: string;
  title: string;
  quantity: number;
  maxQuantity?: number;
  expirationDate?: string;
  noExpiry?: boolean;
  foodType?: FoodType | null;
}

@Component({
  selector: 'app-entity-selector-modal',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    IonModal,
    IonButton,
    IonIcon,
    IonSpinner,
    IonFooter,
    ExpiryPickerComponent,
    FoodTypePickerComponent,
    EntityAutocompleteComponent,
  ],
  templateUrl: './entity-selector-modal.component.html',
  styleUrls: ['./entity-selector-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntitySelectorModalComponent<TRaw = unknown, TMeta = unknown> {
  @Input() isOpen = false;
  @Input() title = '';
  @Input() cardTitle = '';
  @Input() subtitle = '';
  @Input() placeholder = '';
  @Input() emptyLabel = '';
  @Input() emptyActionLabel = '';
  @Input() showEmptyAction = false;
  @Input() showEmptyActionWhenNoExactMatch = false;
  @Input() entriesEmptyLabel = '';
  /**
   * Optional note shown under the picked entries. Sits here rather than in the
   * header so it appears next to the values it explains, and only once there is
   * something on screen to explain.
   */
  @Input() entriesHint = '';
  @Input() saveLabel = '';
  @Input() saving = false;
  @Input() disableSave = false;
  @Input() items: readonly AutocompleteItem<TRaw, TMeta>[] = [];
  @Input() entries: readonly EntitySelectorEntry[] = [];
  @Input() showSecondaryInfo = false;
  @Input() showMeta = false;
  @Input() showEntryDate = true;
  @Input() showEntryNoExpiry = false;
  @Input() showEntryQuantity = true;
  @Input() entryDateQuickOnly = false;
  @Input() showAllOnFocus = true;
  @Input() autofocus = true;
  @Input() maxOptions = 0;
  /** Shows an editable food-type chip per entry; also explains the suggested date. */
  @Input() showEntryFoodType = false;
@Output() willDismiss = new EventEmitter<void>();
  @Output() didDismiss = new EventEmitter<void>();
  @Output() selectItem = new EventEmitter<AutocompleteItem<TRaw, TMeta>>();
  @Output() queryChange = new EventEmitter<string>();
  @Output() emptyAction = new EventEmitter<string>();
  @Output() adjustEntry = new EventEmitter<{ entry: EntitySelectorEntry; delta: number }>();
  @Output() entryDateChange = new EventEmitter<{ entry: EntitySelectorEntry; date: string | undefined }>();
  @Output() entryNoExpiryToggle = new EventEmitter<{ entry: EntitySelectorEntry }>();
  @Output() entryFoodTypeChange = new EventEmitter<{ entry: EntitySelectorEntry; foodType: FoodType }>();
  @Output() save = new EventEmitter<void>();
  canIncrease(entry: EntitySelectorEntry): boolean {
    if (entry.maxQuantity == null || !Number.isFinite(entry.maxQuantity)) {
      return true;
    }
    return entry.quantity < entry.maxQuantity;
  }
}
