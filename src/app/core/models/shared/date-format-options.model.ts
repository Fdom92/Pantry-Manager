export interface LocaleDateFormatOptions {
  readonly numeric: Intl.DateTimeFormatOptions;
  readonly short: Intl.DateTimeFormatOptions;
}

export const ES_DATE_FORMAT_OPTIONS: LocaleDateFormatOptions = {
  numeric: {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  },
  short: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
};
