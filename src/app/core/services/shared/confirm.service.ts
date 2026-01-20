import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  confirm(message: string): boolean {
    if (typeof window === 'undefined') {
      return true;
    }
    return window.confirm(message);
  }
}

