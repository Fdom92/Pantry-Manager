import { Injectable, inject, Signal, signal } from '@angular/core';
import { DEFAULT_LANGUAGE, LOCALES, SUPPORTED_LANGUAGES, SupportedLanguage } from '@core/constants';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { normalizeLocaleCode } from '@core/utils/normalization.util';

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  // DI
  private readonly translate = inject(TranslateService);
  // SIGNALS
  private readonly currentLanguage = signal<SupportedLanguage>(DEFAULT_LANGUAGE);

  async init(): Promise<void> {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    this.translate.setDefaultLang(DEFAULT_LANGUAGE);

    const deviceLocale = this.getNavigatorLocale();
    const language = this.resolveSupportedLanguage(deviceLocale);

    await firstValueFrom(this.translate.use(language));
    this.currentLanguage.set(language);
  }

  getCurrentLocale(): string {
    const lang = this.currentLanguage();
    return LOCALES[lang] ?? LOCALES[DEFAULT_LANGUAGE];
  }

  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage();
  }

  private isSupportedLanguage(lang: string | null): lang is SupportedLanguage {
    if (!lang) {
      return false;
    }
    return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
  }

  private resolveSupportedLanguage(locale: string | null): SupportedLanguage {
    const base = normalizeLocaleCode(locale);
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
