/** Activation: a product of their own, notifications on, and analytics on so it can be measured, after the 5.8 onboarding. */
export function isActivated(s: {
  productCount: number;
  notificationsGranted: boolean;
  analyticsEnabled: boolean;
  onboardedV58: boolean;
}): boolean {
  return s.productCount >= 1 && s.notificationsGranted && s.analyticsEnabled && s.onboardedV58;
}
