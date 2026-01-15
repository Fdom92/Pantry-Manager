import { Injectable, inject } from '@angular/core';
import { ONBOARDING_STORAGE_KEY } from '@core/constants';
import { RevenuecatService } from '../upgrade/revenuecat.service';

@Injectable({ providedIn: 'root' })
export class OnboardingStoreService {
  private readonly revenuecat = inject(RevenuecatService);

  readonly isPro$ = this.revenuecat.isPro$;

  persistOnboardingFlag(): void {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch (err) {
      console.warn('[Onboarding] failed to persist onboarding flag', err);
    }
  }
}

