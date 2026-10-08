import { isExitScreenUrl } from './navigation.util';

describe('isExitScreenUrl', () => {
  it('treats each tab root as a place where back means "leave the app"', () => {
    for (const url of ['/dashboard', '/pantry', '/insights', '/list']) {
      expect(isExitScreenUrl(url)).withContext(url).toBeTrue();
    }
  });

  it('ignores query strings and fragments', () => {
    expect(isExitScreenUrl('/pantry?filter=low')).toBeTrue();
    expect(isExitScreenUrl('/list#bought')).toBeTrue();
  });

  it('treats onboarding as an exit screen: there is nothing to go back to', () => {
    expect(isExitScreenUrl('/onboarding')).toBeTrue();
  });

  it('lets back navigate on pages stacked above a tab', () => {
    for (const url of [
      '/settings',
      '/settings/catalogos',
      '/settings/notificaciones',
      '/settings/avanzado',
      '/upgrade',
    ]) {
      expect(isExitScreenUrl(url)).withContext(url).toBeFalse();
    }
  });

  it('does not confuse a nested path with a tab root', () => {
    expect(isExitScreenUrl('/pantry/other')).toBeFalse();
    expect(isExitScreenUrl('/settings/list')).toBeFalse();
  });
});
