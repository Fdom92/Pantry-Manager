import { ChangeDetectionStrategy, Component, EventEmitter, Output, booleanAttribute, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonCard, IonCardContent, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsService } from '@core/services/analytics/analytics.service';
import { ANALYTICS_EVENTS } from '@core/constants';
import { ProTrialCtaComponent } from '@shared/components/pro-trial-cta/pro-trial-cta.component';
import { ProCtaUiStateService, type ProCtaSurface } from '@core/services/upgrade/pro-cta-ui-state.service';

/**
 * Canonical locked-feature teaser card. Violet PRO accent, dashed border,
 * lock badge — same visual language on every paywall surface. The whole card
 * navigates to /upgrade; the optional embedded trial CTA keeps the
 * trial-aware purchase path (direct trial start when eligible).
 */
@Component({
  selector: 'app-pro-paywall-card',
  standalone: true,
  imports: [IonCard, IonCardContent, IonIcon, TranslateModule, ProTrialCtaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pro-paywall-card.component.html',
  styleUrl: './pro-paywall-card.component.scss',
  host: { '[style.display]': 'isDismissed() ? "none" : null' },
})
export class ProPaywallCardComponent {
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);
  private readonly ctaUi = inject(ProCtaUiStateService);

  readonly surface = input.required<ProCtaSurface>();
  readonly isDismissed = computed(() => this.ctaUi.isDismissed(this.surface()));
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input.required<string>();
  /** Hide the embedded trial button when the surface hosts another primary CTA. */
  readonly hideCta = input(false, { transform: booleanAttribute });
  /** Show the "Ahora no" dismiss link under the trial button. */
  readonly dismissible = input(false, { transform: booleanAttribute });
  /** 'pill' renders a single-row compact form (icon + title + chevron) for dense surfaces like Dashboard. Description, projected content, and the CTA/dismiss button are not shown in 'pill'. */
  readonly variant = input<'card' | 'pill'>('card');
  /** Fires synchronously, before navigation, so a host that renders this inside a modal/sheet can close it first. */
  @Output() readonly cardClicked = new EventEmitter<void>();

  onCardClick(): void {
    this.analytics.track(ANALYTICS_EVENTS.PAYWALL_CARD_CLICKED, { surface: this.surface() });
    this.cardClicked.emit();
    void this.router.navigate(['/upgrade']);
  }
}
