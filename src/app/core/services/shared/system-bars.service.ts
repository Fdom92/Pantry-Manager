import { Injectable, inject } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { sheetBackdropFactor } from '@core/utils/backdrop.util';
import { dimColor, isLightColor, parseCssColor, toHex, type Rgb } from '@core/utils/color.util';
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
  /**
   * Open overlays: the backdrop opacity each brings and, for one anchored to the bottom
   * (a sheet), its own background, which the bottom strip should continue.
   */
  private readonly overlays = new Map<EventTarget, { opacity: number; bottom: Rgb | null }>();
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
    // A sheet that settles at another breakpoint (or is dragged to one) dims by another amount.
    document.addEventListener('ionBreakpointDidChange', e => this.breakpointChanged(e as CustomEvent<{ breakpoint?: number }>));
    // The theme switches by class/attribute on <html>, or by the system's own scheme.
    new MutationObserver(() => this.scheduleSync()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.scheduleSync());
    void this.sync(0);
  }

  private overlayOpened(event: Event): void {
    const overlay = event.target as HTMLElement;
    this.overlays.set(overlay, { opacity: this.backdropOpacityOf(overlay), bottom: this.sheetBackgroundOf(overlay) });
    void this.sync(DIM_TRANSITION_MS);
  }

  private breakpointChanged(event: CustomEvent<{ breakpoint?: number }>): void {
    const overlay = event.target as HTMLElement;
    const breakpoint = event.detail?.breakpoint;
    if (!this.overlays.has(overlay) || typeof breakpoint !== 'number') return;
    this.overlays.set(overlay, { opacity: this.backdropOpacityOf(overlay, breakpoint), bottom: this.sheetBackgroundOf(overlay) });
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

    const open = [...this.overlays.values()];
    const dim = Math.max(0, ...open.map(o => o.opacity));
    // A sheet reaches the bottom edge and is not dimmed itself: the strip under it should
    // look like its continuation, not like the dimmed page behind it.
    const sheetBottom = [...open].reverse().find(o => o.bottom)?.bottom ?? null;
    try {
      await SystemBars.setStrips({
        top: toHex(dimColor(top, dim)),
        bottom: toHex(sheetBottom ?? dimColor(bottom, dim)),
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

  /** The background of a bottom-anchored overlay's panel, if it has an opaque one. */
  private sheetBackgroundOf(overlay: HTMLElement) {
    const panel = overlay.shadowRoot?.querySelector('.modal-wrapper, .action-sheet-wrapper');
    return panel ? parseCssColor(getComputedStyle(panel).backgroundColor) : null;
  }

  /**
   * What the overlay's backdrop actually shows: its --backdrop-opacity, scaled down for a
   * sheet modal that is not fully open (Ionic fades the backdrop with the breakpoint).
   */
  private backdropOpacityOf(overlay: HTMLElement, breakpoint?: number): number {
    const sheet = overlay as HTMLElement & {
      showBackdrop?: boolean;
      breakpoints?: number[];
      initialBreakpoint?: number;
      currentBreakpoint?: number;
      backdropBreakpoint?: number;
    };
    if (sheet.showBackdrop === false) return 0;

    const value = parseFloat(getComputedStyle(overlay).getPropertyValue('--backdrop-opacity'));
    const full = Number.isFinite(value) ? value : DEFAULT_BACKDROP_OPACITY;

    const open = breakpoint ?? sheet.currentBreakpoint ?? sheet.initialBreakpoint;
    if (!sheet.breakpoints?.length || typeof open !== 'number') return full;
    return full * sheetBackdropFactor(open, sheet.backdropBreakpoint ?? 0);
  }
}
