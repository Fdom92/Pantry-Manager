import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { RevenuecatService } from '@core/services/revenuecat.service';

const ensurePro = (): boolean | ReturnType<Router['createUrlTree']> => {
  const revenuecat = inject(RevenuecatService);
  if (revenuecat.isPro()) {
    return true;
  }
  const router = inject(Router);
  return router.createUrlTree(['/upgrade'], { queryParams: { reason: 'pro-required' } });
};

export const proGuard: CanMatchFn = () => ensurePro();
export const proActivateGuard: CanActivateFn = () => ensurePro();
