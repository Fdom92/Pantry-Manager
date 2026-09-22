import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { isSameLocalDay, msUntilNextLocalMidnight } from '@core/domain/shared';

/**
 * The app's "now", as a signal. Anything that classifies by time (expired,
 * near expiry, waste window, "Caduca mañana") must read it inside its
 * computed, or the result freezes: Android keeps the WebView alive, so the
 * app is often resumed the next day without anything else changing.
 *
 * Advances when the app comes back to the foreground and at local midnight.
 * Minute precision is deliberately not a goal: every rule here is per day.
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly document = inject(DOCUMENT);
  private midnightTimer: ReturnType<typeof setTimeout> | null = null;

  readonly now = signal(Date.now());
  /** Changes once per calendar day; cheaper to depend on than `now`. */
  readonly today = computed(() => startOfLocalDay(this.now()), { equal: (a, b) => a === b });

  constructor() {
    const onVisibility = () => {
      if (this.document.visibilityState === 'visible') this.tick();
    };
    this.document.addEventListener('visibilitychange', onVisibility);
    this.scheduleMidnight();
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      if (this.midnightTimer) clearTimeout(this.midnightTimer);
    });
  }

  /** Re-read the time. Skips the write when the day hasn't changed and <1 min passed. */
  tick(nowMs = Date.now()): void {
    const previous = this.now();
    if (isSameLocalDay(previous, nowMs) && nowMs - previous < 60_000) return;
    this.now.set(nowMs);
    this.scheduleMidnight();
  }

  private scheduleMidnight(): void {
    if (this.midnightTimer) clearTimeout(this.midnightTimer);
    // +1s so the timer lands safely inside the new day.
    const delay = msUntilNextLocalMidnight(new Date()) + 1000;
    this.midnightTimer = setTimeout(() => this.tick(), delay);
  }
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
