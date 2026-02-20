import { PlanMeta, PlanTrialMeta } from '@core/models';
import { PACKAGE_TYPE, type PurchasesPackage } from '@revenuecat/purchases-capacitor';

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

export function buildTrialMeta(pkg: PurchasesPackage): PlanTrialMeta | null {
  const introPrice = pkg.product?.introPrice;
  if (!introPrice) {
    return null;
  }
  if (introPrice.price === 0) {
    return { kind: 'free' };
  }
  return {
    kind: 'discount',
    price: introPrice.priceString ?? '',
    cycles: introPrice.cycles ?? 1,
  };
}

export function buildPlanMeta(params: {
  pkg: PurchasesPackage;
  benefitKeys: string[];
  monthlyPrice: number | null;
  annualPrice: number | null;
}): PlanMeta {
  const { pkg, benefitKeys, monthlyPrice, annualPrice } = params;
  const isAnnual = pkg.packageType === PACKAGE_TYPE.ANNUAL;
  const trial = buildTrialMeta(pkg);
  return {
    id: pkg.identifier,
    type: pkg.packageType,
    titleKey: getPackageTypeTranslationKey(pkg.packageType),
    subtitle: pkg.product?.title ?? pkg.identifier,
    price: pkg.product?.priceString ?? '-',
    periodKey: isAnnual ? 'upgrade.plans.perYear' : 'upgrade.plans.perMonth',
    badgeKey: isAnnual ? 'upgrade.plans.badgeBestValue' : undefined,
    savingsPercent: isAnnual
      ? computeAnnualSavingsPercent({ monthlyPrice, annualPrice })
      : null,
    trial,
    ctaKey: trial ? 'upgrade.actions.startTrial' : 'upgrade.actions.select',
    benefitsKeys: [...benefitKeys],
    highlight: isAnnual,
  };
}

export function normalizePackages(
  packages: PurchasesPackage[],
  preferredTypes: PACKAGE_TYPE[]
): PurchasesPackage[] {
  const deduped: PurchasesPackage[] = [];
  const seen = new Set<string>();
  for (const pkg of packages) {
    if (!pkg) {
      continue;
    }
    if (seen.has(pkg.identifier)) {
      continue;
    }
    seen.add(pkg.identifier);
    deduped.push(pkg);
  }
  return sortPackagesByPreference(deduped, preferredTypes);
}

export function sortPackagesByPreference(
  packages: PurchasesPackage[],
  preferredTypes: PACKAGE_TYPE[]
): PurchasesPackage[] {
  return [...packages].sort((a, b) => {
    const idxA = preferredTypes.indexOf(a.packageType);
    const idxB = preferredTypes.indexOf(b.packageType);
    if (idxA === -1 && idxB === -1) return 0;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });
}

export function pickPreferredPackage(
  packages: PurchasesPackage[],
  preferredTypes: PACKAGE_TYPE[]
): PurchasesPackage | null {
  for (const type of preferredTypes) {
    const match = packages.find(pkg => pkg.packageType === type);
    if (match) {
      return match;
    }
  }
  return packages[0] ?? null;
}
