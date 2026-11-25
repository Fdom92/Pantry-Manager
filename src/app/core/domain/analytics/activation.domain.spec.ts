import { isActivated } from './activation.domain';

describe('isActivated', () => {
  const all = { productCount: 1, notificationsGranted: true, analyticsEnabled: true, onboardedV58: true };

  it('is true only with all four conditions', () => {
    expect(isActivated(all)).toBeTrue();
  });

  it('is false when any single condition is missing', () => {
    expect(isActivated({ ...all, productCount: 0 })).toBeFalse();
    expect(isActivated({ ...all, notificationsGranted: false })).toBeFalse();
    expect(isActivated({ ...all, analyticsEnabled: false })).toBeFalse();
    expect(isActivated({ ...all, onboardedV58: false })).toBeFalse();
  });
});
