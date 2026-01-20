export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it';

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  'en',
  'es',
  'fr',
  'de',
  'pt',
  'it',
] as const;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const LOCALES: Record<SupportedLanguage, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  pt: 'pt-PT',
  it: 'it-IT',
};
