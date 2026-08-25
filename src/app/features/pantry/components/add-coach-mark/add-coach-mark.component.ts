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
import { CoachMarkStateService } from '@core/services/retention/coach-mark-state.service';

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

  private readonly coachMark = inject(CoachMarkStateService);

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
    this.coachMark.trackShown('add_first_item');
  }

  ngAfterViewInit(): void {
    requestAnimationFrame(() => {
      this.rect.set(this.targetEl.getBoundingClientRect());
    });
  }

  onBackdropTap(): void {
    this.coachMark.dismiss('add_first_item');
    this.dismissed.emit();
  }

  onTooltipTap(event: Event): void {
    event.stopPropagation();
    this.coachMark.accept('add_first_item');
    this.addRequested.emit();
  }
}
