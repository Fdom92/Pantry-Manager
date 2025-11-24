import { Injectable, Signal, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

type SupportedLanguage = 'en' | 'es';

const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'es'];
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
const LOCALES: Record<SupportedLanguage, string> = {
  en: 'en-US',
  es: 'es-ES',
};

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  private readonly currentLanguage = signal<SupportedLanguage>(DEFAULT_LANGUAGE);

  constructor(private readonly translate: TranslateService) {}

  async init(): Promise<void> {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    this.translate.setDefaultLang(DEFAULT_LANGUAGE);

    const deviceLocale = this.getNavigatorLocale();
    const language = this.resolveSupportedLanguage(deviceLocale);

    await firstValueFrom(this.translate.use(language));
    this.currentLanguage.set(language);
  }

  language(): Signal<SupportedLanguage> {
    return this.currentLanguage;
  }

  getCurrentLocale(): string {
    const lang = this.currentLanguage();
    return LOCALES[lang] ?? LOCALES[DEFAULT_LANGUAGE];
  }

  /** Normalize a locale string (es-ES, en_GB) into its base language code. */
  private normalizeLocale(locale?: string | null): string | null {
    if (!locale) {
      return null;
    }
    const normalized = locale.toLowerCase().replace('_', '-');
    const [base] = normalized.split('-');
    return base || null;
  }

  private isSupportedLanguage(lang: string | null): lang is SupportedLanguage {
    if (!lang) {
      return false;
    }
    return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
  }

  private resolveSupportedLanguage(locale: string | null): SupportedLanguage {
    const base = this.normalizeLocale(locale);
    if (this.isSupportedLanguage(base)) {
      return base;
    }

    if (base) {
      console.warn(`[LanguageService] Locale ${base} no soportado, usando fallback en.`);
    }
    return DEFAULT_LANGUAGE;
  }

  private getNavigatorLocale(): string | null {
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages) && navigator.languages.length) {
        return navigator.languages[0];
      }
      if (navigator.language) {
        return navigator.language;
      }
    }

    try {
      const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      return intlLocale ?? null;
    } catch {
      return null;
    }
  }
}
