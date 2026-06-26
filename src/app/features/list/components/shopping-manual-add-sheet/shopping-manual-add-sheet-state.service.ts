import { Injectable, signal } from '@angular/core';

@Injectable()
export class ShoppingManualAddSheetStateService {
  readonly isOpen = signal(false);
  readonly inputValue = signal('');

  open(): void {
    this.inputValue.set('');
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.inputValue.set('');
  }

  setInputValue(value: string): void {
    this.inputValue.set(value);
  }
}
