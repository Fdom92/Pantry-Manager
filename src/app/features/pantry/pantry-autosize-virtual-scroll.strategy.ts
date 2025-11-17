import { CdkVirtualScrollViewport, VirtualScrollStrategy } from '@angular/cdk/scrolling';
import { Observable, Subject } from 'rxjs';

/**
 * Simple autosizing virtual scroll strategy that relies on precomputed item heights.
 * The component is responsible for providing heights that match the rendered DOM.
 */
export class PantryAutosizeVirtualScrollStrategy implements VirtualScrollStrategy {
  private viewport: CdkVirtualScrollViewport | null = null;
  private readonly scrolledIndexChangeSubject = new Subject<number>();
  private itemHeights: number[] = [];
  private prefixSums: number[] = [0];
  private totalContentHeight = 0;

  constructor(
    private readonly minBufferPx: number,
    private readonly maxBufferPx: number,
  ) {
    if (maxBufferPx < minBufferPx) {
      throw new Error('PantryAutosizeVirtualScrollStrategy: maxBufferPx must be >= minBufferPx');
    }
  }

  /** Observable that emits when the first rendered index changes. */
  readonly scrolledIndexChange: Observable<number> = this.scrolledIndexChangeSubject.asObservable();

  /** Update the heights used by the strategy and refresh the viewport measurements. */
  setItemHeights(heights: readonly number[]): void {
    this.itemHeights = heights.map(value => Math.max(1, Math.floor(value)));
    this.prefixSums = this.buildPrefixSums(this.itemHeights);
    this.totalContentHeight = this.prefixSums[this.prefixSums.length - 1] ?? 0;
    this.updateTotalContentSize();
    this.updateRenderedRange(true);
  }

  attach(viewport: CdkVirtualScrollViewport): void {
    this.viewport = viewport;
    this.updateTotalContentSize();
    this.updateRenderedRange(true);
  }

  detach(): void {
    this.viewport = null;
  }

  onContentScrolled(): void {
    this.updateRenderedRange();
  }

  onDataLengthChanged(): void {
    this.updateRenderedRange(true);
  }

  onContentRendered(): void {
    // No-op.
  }

  onRenderedOffsetChanged(): void {
    // No-op.
  }

  scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    if (!this.viewport) {
      return;
    }
    const target = this.prefixSums[Math.max(0, Math.min(index, this.itemHeights.length))] ?? 0;
    this.viewport.scrollToOffset(target, behavior);
  }

  private updateTotalContentSize(): void {
    if (!this.viewport) {
      return;
    }
    this.viewport.setTotalContentSize(this.totalContentHeight);
  }

  private updateRenderedRange(force = false): void {
    if (!this.viewport || !this.itemHeights.length) {
      this.viewport?.setRenderedRange({ start: 0, end: 0 });
      this.viewport?.setRenderedContentOffset(0);
      return;
    }

    const viewportSize = this.viewport.getViewportSize();
    const scrollOffset = this.viewport.measureScrollOffset('top');
    const startOffset = Math.max(scrollOffset - this.minBufferPx, 0);
    const endOffset = scrollOffset + viewportSize + this.maxBufferPx;
    const startIndex = this.findStartIndex(startOffset);
    const endIndex = this.findEndIndex(endOffset, startIndex);

    const currentRange = this.viewport.getRenderedRange();
    if (!force && currentRange.start === startIndex && currentRange.end === endIndex) {
      return;
    }

    this.viewport.setRenderedRange({ start: startIndex, end: endIndex });
    this.viewport.setRenderedContentOffset(this.prefixSums[startIndex] ?? 0);
    this.scrolledIndexChangeSubject.next(startIndex);
  }

  private findStartIndex(offset: number): number {
    const prefix = this.prefixSums;
    let low = 0;
    let high = prefix.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (prefix[mid] <= offset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    const candidate = Math.max(0, low - 1);
    return Math.min(candidate, this.itemHeights.length - 1);
  }

  private findEndIndex(offset: number, startIndex: number): number {
    const prefix = this.prefixSums;
    let low = startIndex;
    let high = prefix.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (prefix[mid] < offset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return Math.min(Math.max(low, startIndex + 1), this.itemHeights.length);
  }

  private buildPrefixSums(items: number[]): number[] {
    const prefix = new Array(items.length + 1);
    prefix[0] = 0;
    for (let i = 0; i < items.length; i++) {
      prefix[i + 1] = prefix[i] + Math.max(1, items[i]);
    }
    return prefix;
  }
}
