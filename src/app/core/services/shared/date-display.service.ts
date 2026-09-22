import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  type DisplayDateStyle,
  formatDisplayDate,
  formatDuration,
  formatRelativeDays,
} from '@core/domain/shared';
import { daysUntilExpiry } from '@core/utils/date.util';
import { ClockService } from './clock.service';
import { LanguageService } from './language.service';

/**
 * The one place a date or a span of days becomes text. Rules live in
 * `core/domain/shared/date-display.domain.ts`; this adds the app's current
 * language. Templates use the `appDuration` / `appRelativeDays` / `appExpiry`
 * / `appDate` pipes.
 */
@Injectable({ providedIn: 'root' })
export class DateDisplayService {
  private readonly language = inject(LanguageService);
  private readonly translate = inject(TranslateService);
  private readonly clock = inject(ClockService);

  /** "9 meses", "1 día". */
  duration(days: number): string {
    return formatDuration(days, this.locale());
  }

  /** "mañana", "dentro de 9 meses", "hace 3 días" — for i18n frames like "{{name}}, {{when}}". */
  relativeDays(days: number): string {
    return formatRelativeDays(days, this.locale());
  }

  /**
   * "Caduca hoy", "Caduca dentro de 9 meses", "Caducó hace 3 días"; '' without a valid date.
   * Reads the clock signal, so templates using `appExpiry` rerender on a new day.
   */
  expiry(value: string | null | undefined, nowMs = this.clock.now()): string {
    const days = daysUntilExpiry(value, nowMs);
    if (!Number.isFinite(days)) return '';
    const key = days < 0 ? 'common.expiry.past' : 'common.expiry.future';
    return this.translate.instant(key, { when: this.relativeDays(days) });
  }

  /** A calendar date in the app language ("5 jul", "5 de julio de 2026"). */
  date(value: string | Date | null | undefined, style: DisplayDateStyle = 'short'): string {
    return formatDisplayDate(value, this.locale(), style);
  }

  private locale(): string {
    return this.language.getCurrentLocale();
  }
}
