import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { EntityAutocompleteComponent, type AutocompleteItem } from '@shared/components/entity-autocomplete/entity-autocomplete.component';

export interface EntitySelectorEntry {
  id: string;
  title: string;
  quantity: number;
  maxQuantity?: number;
}

@Component({
  selector: 'app-entity-selector-modal',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonText,
    IonFooter,
    IonSpinner,
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
  @Input() saveLabel = '';
  @Input() saving = false;
  @Input() disableSave = false;
  @Input() items: readonly AutocompleteItem<TRaw, TMeta>[] = [];
  @Input() entries: readonly EntitySelectorEntry[] = [];
  @Input() showSecondaryInfo = false;
  @Input() showMeta = false;
  @Input() showAllOnFocus = true;
  @Input() autofocus = true;

  @Output() willDismiss = new EventEmitter<void>();
  @Output() didDismiss = new EventEmitter<void>();
  @Output() selectItem = new EventEmitter<AutocompleteItem<TRaw, TMeta>>();
  @Output() queryChange = new EventEmitter<string>();
  @Output() emptyAction = new EventEmitter<string>();
  @Output() adjustEntry = new EventEmitter<{ entry: EntitySelectorEntry; delta: number }>();
  @Output() save = new EventEmitter<void>();

  canIncrease(entry: EntitySelectorEntry): boolean {
    if (entry.maxQuantity == null || !Number.isFinite(entry.maxQuantity)) {
      return true;
    }
    return entry.quantity < entry.maxQuantity;
  }
}
