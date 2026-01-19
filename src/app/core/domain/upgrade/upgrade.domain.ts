import { PACKAGE_TYPE } from '@revenuecat/purchases-capacitor';

export function getPackageTypeTranslationKey(type: PACKAGE_TYPE): string {
  switch (type) {
    case PACKAGE_TYPE.MONTHLY:
      return 'upgrade.plans.monthly';
    case PACKAGE_TYPE.ANNUAL:
      return 'upgrade.plans.annual';
    default:
      return 'upgrade.plans.other';
  }
}

export function computeAnnualSavingsPercent(params: {
  monthlyPrice: number | null | undefined;
  annualPrice: number | null | undefined;
}): number | null {
  const monthly = params.monthlyPrice ?? null;
  const annual = params.annualPrice ?? null;
  if (monthly == null || annual == null) {
    return null;
  }
  if (!Number.isFinite(monthly) || !Number.isFinite(annual) || monthly <= 0 || annual <= 0) {
    return null;
  }
  const monthlyYearCost = monthly * 12;
  const savingsPercent = Math.max(0, Math.round((1 - annual / monthlyYearCost) * 100));
  return savingsPercent > 0 ? savingsPercent : null;
}

