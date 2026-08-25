/**
 * Whether a RevenueCat customer counts as PRO, and why.
 *
 * This reads more defensively than the SDK's own types would require, on
 * purpose. `CustomerInfo` from `@revenuecat/purchases-capacitor` has no
 * `subscriber` property — that shape belongs to RevenueCat's REST API — but the
 * payload crosses a Capacitor bridge from the native SDK, and the fallbacks
 * below were written against something that actually turned up empty. Getting
 * this wrong locks a paying user out of what they bought, so the extra branches
 * stay until there is evidence they are dead.
 *
 * What each answer means to the caller: `null` is "could not tell", which leaves
 * the stored PRO state alone rather than revoking it.
 */

/** Anything with an `isActive` flag counts, and so does a bare truthy value. */
interface EntitlementLike {
  isActive?: boolean;
}

type EntitlementMap = Record<string, EntitlementLike | boolean | null | undefined>;

/** The SDK shape, plus the REST-ish shape the bridge has been seen to produce. */
export interface ProStatusInput {
  entitlements?: { active?: EntitlementMap | null } | null;
  activeSubscriptions?: string[] | null;
  allPurchasedProductIdentifiers?: string[] | null;
  subscriber?: {
    entitlements?: { active?: EntitlementMap | null } | null;
    activeSubscriptions?: string[] | null;
    allPurchasedProductIdentifiers?: string[] | null;
  } | null;
}

export type ProStatusReason =
  /** A named entitlement — `pro` or `premium` — is active. */
  | 'named-entitlement'
  /** Some other entitlement is active; any active entitlement means PRO here. */
  | 'any-active-entitlement'
  /** No entitlements came through, but the customer has active subscriptions. */
  | 'active-subscriptions'
  /** Entitlements arrived and none of them is active. */
  | 'no-active-entitlements'
  /** Nothing usable arrived at all. */
  | 'entitlements-missing';

export interface ProStatus {
  /** `null` means undetermined: keep whatever state is already stored. */
  isPro: boolean | null;
  reason: ProStatusReason;
  /** Entitlement keys that arrived, for the log line when the answer is no. */
  entitlementKeys: string[];
  activeSubscriptions: string[];
}

/**
 * Deliberately loose, matching what this did before it was extracted: an entry
 * that carries `isActive` is judged by it, and anything else counts if it is
 * merely there. The map being read is `entitlements.active`, so presence is
 * already supposed to mean active — tightening this could only ever deny
 * someone who paid.
 */
function isActive(entitlement: EntitlementLike | boolean | null | undefined): boolean {
  if (typeof entitlement === 'object' && entitlement !== null) {
    return Boolean(entitlement.isActive ?? entitlement);
  }
  return Boolean(entitlement);
}

export function resolveProStatus(info: ProStatusInput | null | undefined): ProStatus {
  const entitlements = info?.entitlements?.active ?? info?.subscriber?.entitlements?.active;
  const activeSubscriptions =
    info?.activeSubscriptions
    ?? info?.subscriber?.activeSubscriptions
    ?? info?.subscriber?.allPurchasedProductIdentifiers
    ?? [];

  if (!entitlements) {
    return {
      isPro: null,
      reason: 'entitlements-missing',
      entitlementKeys: [],
      activeSubscriptions,
    };
  }

  const entitlementKeys = Object.keys(entitlements);

  if (entitlements['pro'] || entitlements['premium']) {
    return { isPro: true, reason: 'named-entitlement', entitlementKeys, activeSubscriptions };
  }

  if (entitlementKeys.some(key => isActive(entitlements[key]))) {
    return { isPro: true, reason: 'any-active-entitlement', entitlementKeys, activeSubscriptions };
  }

  if (activeSubscriptions.length) {
    return { isPro: true, reason: 'active-subscriptions', entitlementKeys, activeSubscriptions };
  }

  return { isPro: false, reason: 'no-active-entitlements', entitlementKeys, activeSubscriptions };
}
