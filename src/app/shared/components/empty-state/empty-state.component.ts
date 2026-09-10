import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import type { EmptyStateColor } from '@core/models/shared';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { ANALYTICS_EVENTS } from '@core/constants';
import { AnalyticsService } from '@core/services/analytics';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [IonButton, IonIcon, CommonModule, TranslateModule],
  templateUrl: './empty-state.component.html',
  styleUrls: ['./empty-state.component.scss'],
})
export class EmptyStateComponent implements OnInit {
  private readonly analytics = inject(AnalyticsService);

  @Input() icon = 'star-outline';
  @Input() title?: string;
  @Input() subtitle?: string;
  @Input() titleKey = 'emptyStates.generic.title';
  @Input() subtitleKey = 'emptyStates.generic.subtitle';
  @Input() hideTitle = false;
  @Input() showAction = false;
  @Input() actionLabel?: string;
  @Input() compact = false;
  @Input() iconColor?: EmptyStateColor;
  @Output() action = new EventEmitter<void>();

  /**
   * Reporting from the component rather than from each of its fifteen call
   * sites: an empty state that someone adds later is then instrumented for
   * free, and there is no list to keep in sync.
   *
   * `subtitleKey` is what identifies which one this is — a translation key, so
   * it carries no user text. What we get back is how many people meet an empty
   * app and where, which is the readily testable explanation for 18 of 24
   * users never opening it a second time.
   */
  ngOnInit(): void {
    this.analytics.track(ANALYTICS_EVENTS.EMPTY_STATE_SHOWN, {
      key: this.subtitleKey,
    });
  }

  triggerAction(): void {
    if (!this.showAction) {
      return;
    }
    this.action.emit();
  }
}
