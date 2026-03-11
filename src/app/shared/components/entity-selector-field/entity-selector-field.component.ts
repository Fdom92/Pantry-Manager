import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, computed, signal } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSearchbar,
  IonToolbar,
} from '@ionic/angular/standalone';
import type { AutocompleteItem } from '../entity-autocomplete/entity-autocomplete.component';

@Component({
  selector: 'app-entity-selector-field',
  standalone: true,
  imports: [IonModal, IonHeader, IonToolbar, IonSearchbar, IonContent, IonList, IonItem, IonLabel, IonIcon],
  templateUrl: './entity-selector-field.component.html',
  styleUrls: ['./entity-selector-field.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntitySelectorFieldComponent<TRaw = unknown, TMeta = unknown> implements OnChanges {
  @Input() items: readonly AutocompleteItem<TRaw, TMeta>[] = [];
  @Input() value = '';
  @Input() label?: string;
  @Input() placeholder = '';
  @Input() searchPlaceholder = '';
  @Input() emptyLabel = 'No results';
  @Input() showEmptyAction = false;
  @Input() showEmptyActionWhenNoExactMatch = false;
  @Input() emptyActionLabel = '';
  @Input() showSearch = true;

  @Output() optionSelected = new EventEmitter<AutocompleteItem<TRaw, TMeta>>();
  @Output() emptyAction = new EventEmitter<string>();

  readonly isSheetOpen = signal(false);
  readonly searchQuery = signal('');

  readonly filteredItems = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const items = Array.isArray(this.items) ? [...this.items] : [];
    if (!q) {
      return items;
    }
    return items.filter(item => (item.title ?? '').toLowerCase().includes(q));
  });

  readonly showEmptyActionItem = computed(() => {
    if (!this.showEmptyAction || !this.emptyActionLabel) {
      return false;
    }
    const q = this.searchQuery().trim();
    if (!q) {
      return false;
    }
    if (!this.showEmptyActionWhenNoExactMatch) {
      return true;
    }
    return !this.hasExactMatch(q);
  });

  ngOnChanges(changes: SimpleChanges): void {
    if ('items' in changes && this.isSheetOpen()) {
      // Recompute filtered items automatically via computed signal
    }
  }

  openSheet(): void {
    this.searchQuery.set('');
    this.isSheetOpen.set(true);
  }

  closeSheet(): void {
    this.isSheetOpen.set(false);
    this.searchQuery.set('');
  }

  selectOption(option: AutocompleteItem<TRaw, TMeta>): void {
    this.closeSheet();
    this.optionSelected.emit(option);
  }

  triggerEmptyAction(): void {
    const q = this.searchQuery().trim();
    this.closeSheet();
    this.emptyAction.emit(q);
  }

  onSearchInput(event: CustomEvent): void {
    const value = (event.detail as { value?: unknown })?.value ?? '';
    this.searchQuery.set(typeof value === 'string' ? value : String(value));
  }

  private hasExactMatch(query: string): boolean {
    const normalized = query.toLowerCase().trim();
    return (this.items ?? []).some(item => (item.title ?? '').toLowerCase().trim() === normalized);
  }
}
