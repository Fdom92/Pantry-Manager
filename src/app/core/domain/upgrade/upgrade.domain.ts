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

/**
 * RevenueCat error codes that describe the device or the connection, not a
 * fault in the app: "3" PURCHASE_NOT_ALLOWED (no Play account, no billing —
 * emulators, Huawei, managed phones) and "10" NETWORK_ERROR. Play's pre-launch
 * robots hit the first on every run, and each getOfferings() call turned it
 * into a fresh Sentry error.
 *
 * "23" CONFIGURATION_ERROR is deliberately absent: in production it would mean
 * the paywall has no plans for anyone, which is exactly what Sentry is for.
 */
const ENVIRONMENTAL_STORE_ERROR_CODES = new Set(['3', '10']);
const ENVIRONMENTAL_READABLE_CODES = new Set(['PURCHASE_NOT_ALLOWED_ERROR', 'NETWORK_ERROR']);

export function isEnvironmentalStoreError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; data?: { readableErrorCode?: unknown } | null };
  // The code arrives as a string ("3") on some paths and a number (23) on
  // others, so compare on its string form.
  if (candidate.code !== undefined && candidate.code !== null
    && ENVIRONMENTAL_STORE_ERROR_CODES.has(String(candidate.code))) {
    return true;
  }
  const readable = candidate.data?.readableErrorCode;
  return typeof readable === 'string' && ENVIRONMENTAL_READABLE_CODES.has(readable);
}
