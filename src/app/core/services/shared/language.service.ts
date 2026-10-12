import { Injectable, inject, signal } from '@angular/core';
import { ANALYTICS_EVENTS, DEFAULT_LANGUAGE, LOCALES, SUPPORTED_LANGUAGES, SupportedLanguage } from '@core/constants';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { normalizeLocaleCode } from '@core/utils/normalization.util';
import { AnalyticsService } from '../analytics/analytics.service';
import { LocalStorageService } from './local-storage.service';
import { LoggerService } from './logger.service';

@Injectable({
  providedIn: 'root',
})
export class LanguageService {
  private readonly translate = inject(TranslateService);
  private readonly analytics = inject(AnalyticsService);
  private readonly logger = inject(LoggerService);
  private readonly localStorage = inject(LocalStorageService);

  readonly currentLanguage = signal<SupportedLanguage>(DEFAULT_LANGUAGE);

  async init(): Promise<void> {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    this.translate.setDefaultLang(DEFAULT_LANGUAGE);

    // The user's own choice wins over the phone's locale; a stale or hand-edited
    // value that is no longer supported falls through to the device locale.
    const stored = this.localStorage.language.get();
    const language = this.isSupportedLanguage(stored)
      ? stored
      : this.resolveSupportedLanguage(this.getNavigatorLocale());

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

  async setLanguage(lang: SupportedLanguage): Promise<void> {
    const previous = this.currentLanguage();
    await firstValueFrom(this.translate.use(lang));
    this.currentLanguage.set(lang);
    this.localStorage.language.set(lang);
    if (previous !== lang) {
      this.analytics.track(ANALYTICS_EVENTS.PREFERENCE_CHANGED, {
        key: 'language',
        value: lang,
      });
    }
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
      this.logger.warn('LanguageService', `Locale ${base} no soportado, usando fallback en.`);
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
