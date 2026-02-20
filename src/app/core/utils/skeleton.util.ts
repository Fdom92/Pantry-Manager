import { signal, WritableSignal } from '@angular/core';

/**
 * Manages skeleton loading state with a delay to prevent flashing.
 * Only shows skeleton if loading takes longer than the specified delay.
 */
export class SkeletonLoadingManager {
  readonly showSkeleton: WritableSignal<boolean> = signal(false);
  private timeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Start the loading state with a delayed skeleton display.
   * @param delayMs - Milliseconds to wait before showing skeleton (default: 200ms)
   */
  startLoading(delayMs: number = 200): void {
    this.timeout = setTimeout(() => {
      this.showSkeleton.set(true);
    }, delayMs);
  }

  /**
   * Stop the loading state and clear any pending timeout.
   */
  stopLoading(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.showSkeleton.set(false);
  }

  /**
   * Clean up resources (call in ngOnDestroy if needed).
   */
  cleanup(): void {
    this.stopLoading();
  }
}
