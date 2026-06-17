import { ChangeDetectionStrategy, Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { IonIcon } from '@ionic/angular/standalone';
import { AnalyticsService } from '@core/services/analytics';
import { CoachMarkService } from '@core/services/retention';
import { ANALYTICS_EVENTS } from '@core/constants';

@Component({
  selector: 'app-pantry-add-coach-mark',
  standalone: true,
  imports: [TranslateModule, IonIcon],
  templateUrl: './add-coach-mark.component.html',
  styleUrls: ['./add-coach-mark.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryAddCoachMarkComponent implements OnInit {
  @Output() addRequested = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();

  private readonly analytics = inject(AnalyticsService);
  private readonly coachMark = inject(CoachMarkService);

  ngOnInit(): void {
    this.analytics.track(ANALYTICS_EVENTS.COACH_MARK_SHOWN, { key: 'add_first_item' });
  }

  onBackdropTap(): void {
    this.analytics.track(ANALYTICS_EVENTS.COACH_MARK_DISMISSED, { key: 'add_first_item' });
    this.coachMark.markShown('add_first_item');
    this.dismissed.emit();
    this.addRequested.emit();
  }

  onCtaTap(event: Event): void {
    event.stopPropagation();
    this.analytics.track(ANALYTICS_EVENTS.COACH_MARK_TAPPED, { key: 'add_first_item' });
    this.coachMark.markShown('add_first_item');
    this.addRequested.emit();
  }
}
