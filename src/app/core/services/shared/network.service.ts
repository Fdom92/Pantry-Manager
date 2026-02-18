import { Injectable, signal } from '@angular/core';

/**
 * Network connectivity service for mobile apps
 * Uses navigator.onLine API which works in Capacitor/Ionic apps
 */
@Injectable({
  providedIn: 'root',
})
export class NetworkService {
  private readonly isOnline = signal(navigator.onLine);

  constructor() {
    // Listen to online/offline events
    window.addEventListener('online', () => {
      this.isOnline.set(true);
    });

    window.addEventListener('offline', () => {
      this.isOnline.set(false);
    });
  }

  /**
   * Check if device is currently online
   */
  checkConnection(): boolean {
    return navigator.onLine;
  }

  /**
   * Get reactive online status signal
   */
  getOnlineSignal() {
    return this.isOnline.asReadonly();
  }

  /**
   * Get current online status
   */
  isCurrentlyOnline(): boolean {
    return this.isOnline();
  }
}
