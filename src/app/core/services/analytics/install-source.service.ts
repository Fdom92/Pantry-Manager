import { Injectable, inject } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { classifyInstallSource, type InstallSourceKind } from '@core/domain/analytics';
import { LoggerService } from '../shared/logger.service';

interface InstallSourceNative {
  getInstaller(): Promise<{ installer?: string | null; error?: boolean }>;
}

const InstallSource = registerPlugin<InstallSourceNative>('InstallSource');

/**
 * Asks the native side once per app process where the APK came from.
 * The answer cannot change while the process lives, so it is cached.
 */
@Injectable({ providedIn: 'root' })
export class InstallSourceService {
  private readonly logger = inject(LoggerService);
  private cached: Promise<InstallSourceKind> | null = null;

  resolve(): Promise<InstallSourceKind> {
    this.cached ??= this.read();
    return this.cached;
  }

  private async read(): Promise<InstallSourceKind> {
    if (!Capacitor.isNativePlatform()) return 'unknown';
    try {
      const { installer, error } = await InstallSource.getInstaller();
      if (error) {
        this.logger.warn('InstallSourceService', 'native installer lookup failed');
        // Transient failure, not a definitive answer — don't let it stick for
        // the whole process. Let the next resolve() try again.
        this.cached = null;
        return 'unknown';
      }
      return classifyInstallSource(installer ?? null);
    } catch (err) {
      this.logger.warn('InstallSourceService', 'getInstaller failed', { err: String(err) });
      this.cached = null;
      return 'unknown';
    }
  }
}
