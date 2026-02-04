import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { IonButton, IonIcon, IonInput, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

export interface AutocompleteItem<TRaw = unknown, TMeta = unknown> {
  id?: string;
  title: string;
  subtitle?: string;
  meta?: TMeta;
  raw?: TRaw;
}

@Component({
  selector: 'app-entity-autocomplete',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, IonInput, IonItem, IonLabel, IonList],
  templateUrl: './entity-autocomplete.component.html',
  styleUrls: ['./entity-autocomplete.component.scss'],
})
export class EntityAutocompleteComponent<TRaw = unknown, TMeta = unknown> implements OnChanges {
  // DI
  private readonly host = inject(ElementRef<HTMLElement>);
  // INPUTS
  @Input() items: readonly AutocompleteItem<TRaw, TMeta>[] = [];
  @Input() placeholder?: string;
  @Input() label?: string;
  @Input() labelPlacement: 'fixed' | 'floating' | 'stacked' = 'stacked';
  @Input() value = '';
  @Input() disabled = false;
  @Input() readonly = false;
  @Input() minChars = 1;
  @Input() maxOptions = 6;
  @Input() mode: 'consume' | 'add' | 'select' = 'select';
  @Input() showAllOnFocus = false;
  @Input() showSecondaryInfo = false;
  @Input() showMeta = false;
  @Input() emptyLabel = 'No results';
  @Input() showEmptyAction = false;
  @Input() showEmptyActionWhenNoExactMatch = false;
  @Input() emptyActionLabel = '';
  @Input() autofocus = false;
  @Input() clearOnSelect = true;
  @Input() showClearButton = false;
  // OUTPUTS
  @Output() valueChange = new EventEmitter<string>();
  @Output() onSelect = new EventEmitter<AutocompleteItem<TRaw, TMeta>>();
  @Output() onClear = new EventEmitter<void>();
  @Output() onFocus = new EventEmitter<void>();
  @Output() onBlur = new EventEmitter<void>();
  @Output() emptyAction = new EventEmitter<string>();
  // DATA
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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isFocused) {
      return;
    }
    const target = event.target as Node | null;
    if (!target) {
      return;
    }
    if (this.host.nativeElement.contains(target)) {
      return;
    }
    this.isFocused = false;
  }

  onInput(event: CustomEvent): void {
    if (this.disabled || this.readonly) {
      return;
    }
    const value = this.getEventStringValue(event);
    if (value === '' && this.inputValue !== '') {
      this.onClear.emit();
    }
    this.setValue(value);
  }

  handleFocus(): void {
    if (this.disabled || this.readonly) {
      return;
    }
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
    if (this.disabled || this.readonly) {
      return;
    }
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
    if (this.clearOnSelect) {
      this.setValue('');
    } else {
      this.setValue(option.title ?? '');
    }
    this.isFocused = false;
    this.onSelect.emit(option);
  }

  handleClearClick(): void {
    if (!this.inputValue) {
      return;
    }
    this.setValue('');
    this.onClear.emit();
  }

  triggerEmptyAction(): void {
    if (!this.showEmptyAction || !this.emptyActionLabel) {
      return;
    }
    const currentValue = this.inputValue.trim();
    this.emptyAction.emit(currentValue);
    this.setValue('');
    this.isFocused = false;
  }

  shouldShowOptions(): boolean {
    if (this.disabled || this.readonly) {
      return false;
    }
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

  shouldShowEmptyActionItem(): boolean {
    if (!this.showEmptyAction || !this.emptyActionLabel) {
      return false;
    }
    const query = this.inputValue.trim();
    if (query.length < this.minChars) {
      return false;
    }
    if (!this.items || this.items.length === 0) {
      return true;
    }
    if (!this.showEmptyActionWhenNoExactMatch) {
      return false;
    }
    return !this.hasExactMatch(query);
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

  trackOption(index: number, option: AutocompleteItem<TRaw, TMeta>): string | number {
    return option?.id ?? option?.title ?? index;
  }

  private setValue(next: string): void {
    if (next === this.inputValue) {
      return;
    }
    this.inputValue = next;
    this.valueChange.emit(next);
  }

  private getOptionName(option: AutocompleteItem<TRaw, TMeta>): string {
    return (option?.title ?? '').toString();
  }

  private hasExactMatch(query: string): boolean {
    const normalizedQuery = this.normalizeMatchValue(query);
    if (!normalizedQuery) {
      return false;
    }
    return (this.items ?? []).some(item => {
      const name = this.normalizeMatchValue(this.getOptionName(item));
      return name === normalizedQuery;
    });
  }

  private normalizeMatchValue(value: string): string {
    return (value ?? '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private getEventStringValue(event: CustomEvent): string {
    const value = (event.detail as any)?.value ?? '';
    return typeof value === 'string' ? value : String(value);
  }
}
