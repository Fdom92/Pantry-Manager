import { AfterViewInit, Directive, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';

export interface VirtualItemHeightChange {
  key: string;
  height: number;
}

@Directive({
  selector: '[appPantryVirtualItemHeight]',
  standalone: true,
})
export class PantryVirtualItemHeightDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input('appPantryVirtualItemHeight') entryKey!: string;
  @Output() virtualItemHeightChange = new EventEmitter<VirtualItemHeightChange>();

  private resizeObserver?: ResizeObserver;
  private observedElement?: HTMLElement;

  constructor(
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const cardElement = this.elementRef.nativeElement.querySelector('.pantry-item-card') as HTMLElement | null;
      this.observedElement = cardElement ?? this.elementRef.nativeElement;
      if (typeof ResizeObserver === 'undefined') {
        this.zone.run(() => this.emitCurrentSize());
        return;
      }
      this.resizeObserver = new ResizeObserver(() => this.emitCurrentSize());
      this.resizeObserver.observe(this.observedElement);
      this.emitCurrentSize();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entryKey'] && !changes['entryKey'].firstChange) {
      this.emitCurrentSize();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private emitCurrentSize(): void {
    if (!this.entryKey || !this.observedElement) {
      return;
    }
    const height = this.observedElement.getBoundingClientRect().height;
    if (!height) {
      return;
    }
    this.zone.run(() => {
      this.virtualItemHeightChange.emit({
        key: this.entryKey,
        height,
      });
    });
  }
}
