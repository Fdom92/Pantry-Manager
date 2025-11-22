import { Injectable, Signal, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

type SupportedLanguage = 'es' | 'en';

const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['es', 'en'];
const STORAGE_KEY = 'app:language';

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  private readonly currentLanguage = signal<SupportedLanguage>('es');

  constructor(private readonly translate: TranslateService) {}

  async init(): Promise<void> {
    this.translate.addLangs(SUPPORTED_LANGUAGES);
    this.translate.setDefaultLang('es');

    const saved = this.normalize(this.readStoredLanguage());
    const browserCulture = this.normalize(this.translate.getBrowserCultureLang());
    const browser = this.normalize(this.translate.getBrowserLang());
    const system = this.normalize(this.getNavigatorLanguage());
    const fallback: SupportedLanguage = 'es';
    const lang = saved ?? browserCulture ?? browser ?? system ?? fallback;

    await firstValueFrom(this.translate.use(lang));
    this.currentLanguage.set(lang);
    this.persist(lang);
  }

  language(): Signal<SupportedLanguage> {
    return this.currentLanguage;
  }

  getCurrentLocale(): string {
    return this.currentLanguage() === 'en' ? 'en-US' : 'es-ES';
  }

  async setLanguage(lang: string): Promise<void> {
    const normalized = this.normalize(lang);
    if (!normalized) {
      return;
    }
    if (normalized === this.currentLanguage()) {
      return;
    }
    await firstValueFrom(this.translate.use(normalized));
    this.currentLanguage.set(normalized);
    this.persist(normalized);
  }

  private normalize(lang?: string | null): SupportedLanguage | null {
    const key = (lang ?? '').toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(key as SupportedLanguage)) {
      return key as SupportedLanguage;
    }
    if (key.startsWith('es')) {
      return 'es';
    }
    if (key.startsWith('en')) {
      return 'en';
    }
    return null;
  }

  private getNavigatorLanguage(): string | null {
    if (typeof navigator === 'undefined') {
      return null;
    }
    if (Array.isArray(navigator.languages) && navigator.languages.length) {
      return navigator.languages[0];
    }
    return navigator.language ?? null;
  }

  private readStoredLanguage(): string | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private persist(lang: SupportedLanguage): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore storage failures
    }
  }
}
