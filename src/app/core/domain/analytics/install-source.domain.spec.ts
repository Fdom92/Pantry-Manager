import { classifyInstallSource } from './install-source.domain';

describe('classifyInstallSource', () => {
  it('reads the Play Store installer as play', () => {
    expect(classifyInstallSource('com.android.vending')).toBe('play');
  });

  it('reads a missing installer as sideload (adb / Android Studio)', () => {
    expect(classifyInstallSource(null)).toBe('sideload');
    expect(classifyInstallSource(undefined)).toBe('sideload');
    expect(classifyInstallSource('')).toBe('sideload');
  });

  it('reads the system package installers and the shell as sideload', () => {
    expect(classifyInstallSource('com.google.android.packageinstaller')).toBe('sideload');
    expect(classifyInstallSource('com.android.packageinstaller')).toBe('sideload');
    expect(classifyInstallSource('com.android.shell')).toBe('sideload');
  });

  it('reads any other store as other', () => {
    expect(classifyInstallSource('com.huawei.appmarket')).toBe('other');
    expect(classifyInstallSource('com.sec.android.app.samsungapps')).toBe('other');
  });
});
