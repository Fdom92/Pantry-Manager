import { Pipe, PipeTransform, inject } from '@angular/core';
import type { DisplayDateStyle } from '@core/domain/shared';
import { DateDisplayService } from '@core/services/shared/date-display.service';

// Impure, like `translate`: the output follows the app language, which can
// change without the input changing. Each call is a cheap Intl format.

/** `{{ days | appDuration }}` → "9 meses" */
@Pipe({ name: 'appDuration', pure: false })
export class DurationPipe implements PipeTransform {
  private readonly dates = inject(DateDisplayService);
  transform(days: number | null | undefined): string {
    return days == null ? '' : this.dates.duration(days);
  }
}

/** `{{ days | appRelativeDays }}` → "dentro de 9 meses" */
@Pipe({ name: 'appRelativeDays', pure: false })
export class RelativeDaysPipe implements PipeTransform {
  private readonly dates = inject(DateDisplayService);
  transform(days: number | null | undefined): string {
    return days == null ? '' : this.dates.relativeDays(days);
  }
}

/** `{{ item.expirationDate | appExpiry }}` → "Caduca dentro de 9 meses" */
@Pipe({ name: 'appExpiry', pure: false })
export class ExpiryPipe implements PipeTransform {
  private readonly dates = inject(DateDisplayService);
  transform(value: string | null | undefined): string {
    return this.dates.expiry(value);
  }
}

/** `{{ value | appDate: 'dayMonth' }}` → "5 jul" */
@Pipe({ name: 'appDate', pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly dates = inject(DateDisplayService);
  transform(value: string | Date | null | undefined, style: DisplayDateStyle = 'short'): string {
    return this.dates.date(value, style);
  }
}
