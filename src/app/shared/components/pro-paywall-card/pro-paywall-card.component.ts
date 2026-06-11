import { ChangeDetectionStrategy, Component, booleanAttribute, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { IonCard, IonCardContent, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { AnalyticsService } from '@core/services/analytics/analytics.service';
import { ANALYTICS_EVENTS } from '@core/constants';
import { ProTrialCtaComponent } from '@shared/components/pro-trial-cta/pro-trial-cta.component';
import type { ProCtaSurface } from '@core/services/upgrade/pro-cta-ui-state.service';

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
})
export class ProPaywallCardComponent {
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);

  readonly surface = input.required<ProCtaSurface>();
  readonly titleKey = input.required<string>();
  readonly descriptionKey = input.required<string>();
  /** Hide the embedded trial button when the surface hosts another primary CTA. */
  readonly hideCta = input(false, { transform: booleanAttribute });
  /** Show the "Ahora no" dismiss link under the trial button. */
  readonly dismissible = input(false, { transform: booleanAttribute });

  onCardClick(): void {
    this.analytics.track(ANALYTICS_EVENTS.PAYWALL_CARD_CLICKED, { surface: this.surface() });
    void this.router.navigate(['/upgrade']);
  }
}
