import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsService } from '@core/services/analytics';
import { CoachMarkService } from '@core/services/retention';
import { ANALYTICS_EVENTS } from '@core/constants';

@Component({
  selector: 'app-pantry-add-coach-mark',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './add-coach-mark.component.html',
  styleUrls: ['./add-coach-mark.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryAddCoachMarkComponent implements OnInit, AfterViewInit {
  @Input({ required: true }) targetEl!: HTMLElement;
  @Output() addRequested = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();

  private readonly analytics = inject(AnalyticsService);
  private readonly coachMark = inject(CoachMarkService);

  private readonly rect = signal<DOMRect | null>(null);

  readonly spotlightStyle = computed(() => {
    const r = this.rect();
    if (!r) return {};
    const pad = 8;
    return {
      top: `${r.top - pad}px`,
      left: `${r.left - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    };
  });

  readonly tooltipStyle = computed(() => {
    const r = this.rect();
    if (!r) return {};
    // Position tooltip above the button, right-aligned to viewport edge
    return {
      top: `${r.top - 108}px`,
      right: '12px',
    };
  });

  readonly hasRect = computed(() => this.rect() !== null);

  ngOnInit(): void {
    this.analytics.track(ANALYTICS_EVENTS.COACH_MARK_SHOWN, { key: 'add_first_item' });
  }

  ngAfterViewInit(): void {
    requestAnimationFrame(() => {
      this.rect.set(this.targetEl.getBoundingClientRect());
    });
  }

  onBackdropTap(): void {
    this.analytics.track(ANALYTICS_EVENTS.COACH_MARK_DISMISSED, { key: 'add_first_item' });
    this.coachMark.markShown('add_first_item');
    this.dismissed.emit();
    this.addRequested.emit();
  }

  onTooltipTap(event: Event): void {
    event.stopPropagation();
    this.analytics.track(ANALYTICS_EVENTS.COACH_MARK_TAPPED, { key: 'add_first_item' });
    this.coachMark.markShown('add_first_item');
    this.addRequested.emit();
  }
}
