import { Injectable, inject } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { dimColor, isLightColor, parseCssColor, toHex } from '@core/utils/color.util';
import { LoggerService } from './logger.service';

interface SystemBarsNative {
  setStrips(options: { top: string; bottom: string; lightBars?: boolean; durationMs?: number }): Promise<void>;
}

const SystemBars = registerPlugin<SystemBarsNative>('SystemBars');

/** Ionic overlays whose backdrop dims the screen. */
const DIMMING_OVERLAYS = ['Modal', 'Alert', 'ActionSheet', 'Loading'] as const;
/** Ionic's md backdrop opacity, for when the overlay's own value can't be read. */
const DEFAULT_BACKDROP_OPACITY = 0.32;
const DIM_TRANSITION_MS = 250;

/**
 * Keeps the strips under the transparent system bars in step with the app.
 *
 * With edge-to-edge margins the WebView stops short of the status and navigation bars, so
 * what shows there is the native window background, outside the reach of CSS. Two things
 * made it look off: it followed the system theme and not the app's, and an Ionic overlay's
 * backdrop dims the WebView but not those strips, while a native dialog (the camera sheet)
 * dims everything. This sends the toolbar and page colours to the native side, darkened by
 * the backdrop's opacity while an overlay is open.
 */
@Injectable({ providedIn: 'root' })
export class SystemBarsService {
  private readonly logger = inject(LoggerService);
  /** Open overlays and the backdrop opacity each one brings. */
  private readonly overlays = new Map<EventTarget, number>();
  private probe: HTMLElement | null = null;
  private started = false;
  private pendingSync: ReturnType<typeof setTimeout> | null = null;

  init(): void {
    if (this.started || !Capacitor.isNativePlatform()) return;
    this.started = true;

    for (const name of DIMMING_OVERLAYS) {
      document.addEventListener(`ion${name}WillPresent`, e => this.overlayOpened(e));
      document.addEventListener(`ion${name}WillDismiss`, e => this.overlayClosed(e));
      document.addEventListener(`ion${name}DidDismiss`, e => this.overlayClosed(e));
    }
    // The theme switches by class/attribute on <html>, or by the system's own scheme.
    new MutationObserver(() => this.scheduleSync()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.scheduleSync());
    void this.sync(0);
  }

  private overlayOpened(event: Event): void {
    this.overlays.set(event.target as EventTarget, this.backdropOpacityOf(event.target as HTMLElement));
    void this.sync(DIM_TRANSITION_MS);
  }

  private overlayClosed(event: Event): void {
    if (this.overlays.delete(event.target as EventTarget)) {
      void this.sync(DIM_TRANSITION_MS);
    }
  }

  /** Theme classes land a frame after the event that triggers them; debounce and re-read. */
  private scheduleSync(): void {
    if (this.pendingSync) clearTimeout(this.pendingSync);
    this.pendingSync = setTimeout(() => {
      this.pendingSync = null;
      void this.sync(0);
    }, 60);
  }

  private async sync(durationMs: number): Promise<void> {
    const top = this.resolveColor('--ion-toolbar-background');
    const bottom = this.resolveColor('--ion-background-color');
    if (!top || !bottom) return;

    const dim = Math.max(0, ...this.overlays.values());
    try {
      await SystemBars.setStrips({
        top: toHex(dimColor(top, dim)),
        bottom: toHex(dimColor(bottom, dim)),
        lightBars: isLightColor(top),
        durationMs,
      });
    } catch (err) {
      this.logger.warn('SystemBarsService', 'setStrips failed', { err: String(err) });
    }
  }

  /** Resolves a CSS variable to an actual colour through a throwaway element. */
  private resolveColor(variable: string) {
    if (!this.probe) {
      this.probe = document.createElement('div');
      this.probe.setAttribute('aria-hidden', 'true');
      this.probe.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none;visibility:hidden';
      document.body.appendChild(this.probe);
    }
    this.probe.style.backgroundColor = `var(${variable})`;
    return parseCssColor(getComputedStyle(this.probe).backgroundColor);
  }

  private backdropOpacityOf(overlay: HTMLElement): number {
    if ((overlay as HTMLElement & { showBackdrop?: boolean }).showBackdrop === false) return 0;
    const value = parseFloat(getComputedStyle(overlay).getPropertyValue('--backdrop-opacity'));
    return Number.isFinite(value) ? value : DEFAULT_BACKDROP_OPACITY;
  }
}
