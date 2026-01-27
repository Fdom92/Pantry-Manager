import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { IonInput, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

export interface AutocompleteItem<TRaw = unknown, TMeta = unknown> {
  id?: string;
  title: string;
  subtitle?: string;
  meta?: TMeta;
  raw?: TRaw;
}

@Component({
  selector: 'app-product-autocomplete',
  standalone: true,
  imports: [CommonModule, IonInput, IonItem, IonLabel, IonList],
  templateUrl: './product-autocomplete.component.html',
  styleUrls: ['./product-autocomplete.component.scss'],
})
export class ProductAutocompleteComponent<TRaw = unknown, TMeta = unknown> implements OnChanges {
  @Input() items: readonly AutocompleteItem<TRaw, TMeta>[] = [];
  @Input() placeholder?: string;
  @Input() label?: string;
  @Input() labelPlacement: 'fixed' | 'floating' | 'stacked' = 'stacked';
  @Input() value = '';
  @Input() disabled = false;
  @Input() minChars = 1;
  @Input() maxOptions = 6;
  @Input() mode: 'consume' | 'add' | 'select' = 'select';
  @Input() showAllOnFocus = false;
  @Input() showSecondaryInfo = false;
  @Input() showMeta = false;
  @Input() emptyLabel = 'No results';
  @Input() autofocus = false;

  @Output() valueChange = new EventEmitter<string>();
  @Output() onSelect = new EventEmitter<AutocompleteItem<TRaw, TMeta>>();
  @Output() onClear = new EventEmitter<void>();
  @Output() onFocus = new EventEmitter<void>();
  @Output() onBlur = new EventEmitter<void>();

  inputValue = '';
  isFocused = false;
  private blurTimeoutId: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('value' in changes) {
      const next = this.value ?? '';
      if (next !== this.inputValue) {
        this.inputValue = next;
      }
    }
  }

  onInput(event: CustomEvent): void {
    const value = this.getEventStringValue(event);
    if (value === '' && this.inputValue !== '') {
      this.onClear.emit();
    }
    this.setValue(value);
  }

  handleFocus(): void {
    this.isFocused = true;
    this.onFocus.emit();
    if (this.blurTimeoutId) {
      clearTimeout(this.blurTimeoutId);
      this.blurTimeoutId = null;
    }
  }

  handleBlur(): void {
    this.blurTimeoutId = setTimeout(() => {
      this.isFocused = false;
      this.onBlur.emit();
      this.blurTimeoutId = null;
    }, 120);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') {
      return;
    }
    const [first] = this.getFilteredOptions();
    if (!first) {
      return;
    }
    event.preventDefault();
    this.selectOption(first);
  }

  selectOption(option: AutocompleteItem<TRaw, TMeta>): void {
    this.setValue('');
    this.isFocused = false;
    this.onSelect.emit(option);
  }

  shouldShowOptions(): boolean {
    if (!this.isFocused) {
      return false;
    }
    const query = this.inputValue.trim();
    if (this.showAllOnFocus) {
      return true;
    }
    return query.length >= this.minChars;
  }

  getFilteredOptions(): AutocompleteItem<TRaw, TMeta>[] {
    const items = Array.isArray(this.items) ? this.items : [];
    if (!items.length) {
      return [];
    }
    const query = this.inputValue.trim().toLowerCase();
    const matches = (!query && this.showAllOnFocus)
      ? items
      : items.filter(item => this.getOptionName(item).toLowerCase().includes(query));
    if (this.maxOptions > 0) {
      return matches.slice(0, this.maxOptions);
    }
    return matches;
  }

  getSecondaryInfo(option: AutocompleteItem<TRaw, TMeta>): string {
    if (!this.showSecondaryInfo) {
      return '';
    }
    return option.subtitle ?? '';
  }

  getMetaInfo(option: AutocompleteItem<TRaw, TMeta>): string {
    if (!this.showMeta) {
      return '';
    }
    if (typeof option.meta === 'string' || typeof option.meta === 'number') {
      return String(option.meta);
    }
    if (option.meta == null) {
      return '';
    }
    return JSON.stringify(option.meta);
  }

  private setValue(next: string): void {
    if (next === this.inputValue) {
      return;
    }
    this.inputValue = next;
    this.valueChange.emit(next);
  }

  trackOption(index: number, option: AutocompleteItem<TRaw, TMeta>): string | number {
    return option?.id ?? option?.title ?? index;
  }

  private getOptionName(option: AutocompleteItem<TRaw, TMeta>): string {
    return (option?.title ?? '').toString();
  }

  private getEventStringValue(event: CustomEvent): string {
    const value = (event.detail as any)?.value ?? '';
    return typeof value === 'string' ? value : String(value);
  }
}
