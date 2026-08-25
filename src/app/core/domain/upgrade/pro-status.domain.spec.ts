import { resolveProStatus } from './pro-status.domain';

/**
 * The PRO gate. Every branch here decides whether someone who paid gets what
 * they paid for, and until now none of them had a test.
 */
describe('resolveProStatus', () => {
  describe('says yes', () => {
    it('when the pro entitlement is active', () => {
      const status = resolveProStatus({ entitlements: { active: { pro: { isActive: true } } } });

      expect(status.isPro).toBeTrue();
      expect(status.reason).toBe('named-entitlement');
    });

    it('when the entitlement is called premium instead', () => {
      const status = resolveProStatus({ entitlements: { active: { premium: { isActive: true } } } });

      expect(status.isPro).toBeTrue();
      expect(status.reason).toBe('named-entitlement');
    });

    it('when some other entitlement is active — any active entitlement means PRO here', () => {
      const status = resolveProStatus({ entitlements: { active: { lifetime: { isActive: true } } } });

      expect(status.isPro).toBeTrue();
      expect(status.reason).toBe('any-active-entitlement');
    });

    it('when the entitlement is a bare truthy value with no isActive flag', () => {
      const status = resolveProStatus({ entitlements: { active: { lifetime: true } } });

      expect(status.isPro).toBeTrue();
    });

    it('when entitlements are empty but the customer has active subscriptions', () => {
      const status = resolveProStatus({ entitlements: { active: {} }, activeSubscriptions: ['sub:mensual'] });

      expect(status.isPro).toBeTrue();
      expect(status.reason).toBe('active-subscriptions');
    });

    /** The REST-ish shape the Capacitor bridge has been seen to produce. */
    it('when everything arrives nested under subscriber', () => {
      const status = resolveProStatus({ subscriber: { entitlements: { active: { pro: { isActive: true } } } } });

      expect(status.isPro).toBeTrue();
    });

    it('when subscriber carries only purchased identifiers', () => {
      const status = resolveProStatus({
        subscriber: { entitlements: { active: {} }, allPurchasedProductIdentifiers: ['sub:anual'] },
      });

      expect(status.isPro).toBeTrue();
      expect(status.reason).toBe('active-subscriptions');
    });
  });

  describe('says no', () => {
    it('when entitlements arrived and none of them is active', () => {
      const status = resolveProStatus({ entitlements: { active: {} }, activeSubscriptions: [] });

      expect(status.isPro).toBeFalse();
      expect(status.reason).toBe('no-active-entitlements');
    });

    it('when the only entitlement is explicitly inactive', () => {
      const status = resolveProStatus({ entitlements: { active: { lifetime: { isActive: false } } } });

      expect(status.isPro).toBeFalse();
    });
  });

  describe('says it cannot tell, which must not revoke a stored PRO', () => {
    it('when nothing arrives at all', () => {
      expect(resolveProStatus(undefined).isPro).toBeNull();
      expect(resolveProStatus(null).isPro).toBeNull();
    });

    it('when the payload has no entitlements anywhere', () => {
      const status = resolveProStatus({ activeSubscriptions: ['sub:mensual'] });

      expect(status.isPro).toBeNull();
      expect(status.reason).toBe('entitlements-missing');
      // The subscriptions still travel, so the log line can say what it saw.
      expect(status.activeSubscriptions).toEqual(['sub:mensual']);
    });
  });

  it('reports the entitlement keys it saw, for the log line', () => {
    const status = resolveProStatus({ entitlements: { active: { a: false, b: false } }, activeSubscriptions: [] });

    expect(status.entitlementKeys).toEqual(['a', 'b']);
  });
});
