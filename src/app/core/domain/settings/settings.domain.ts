import { BACKUP_FILENAME, IMPORT_EMPTY_ERROR, IMPORT_INVALID_ERROR } from '@core/constants';
import type { BaseDoc } from '@core/models/shared';
import { normalizeTrim } from '@core/utils/normalization.util';
import { toLocalYmd } from '@core/utils/date.util';

/**
 * The date and time part of a backup filename, in the user's own timezone.
 *
 * This used to be the raw ISO string with its punctuation swapped, which put a
 * "T", the seconds, the milliseconds and a "Z" into a name a person reads in
 * their downloads folder. Worse, it was UTC: exporting at 01:00 on the 26th in
 * Spain produced a file named the 25th, so the backup you just made looked like
 * yesterday's. Kept as year-month-day so the files still sort by age.
 */
export function formatIsoTimestampForFilename(now: Date): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${toLocalYmd(now)}-${hh}-${mm}`;
}

export function buildExportFileName(now: Date): string {
  const timestamp = formatIsoTimestampForFilename(now);
  return `${BACKUP_FILENAME}-${timestamp}.json`;
}

function isValidDoc(doc: any): boolean {
  return (
    doc &&
    typeof doc === 'object' &&
    typeof doc._id === 'string' &&
    normalizeTrim(doc._id).length > 0 &&
    typeof doc.type === 'string' &&
    normalizeTrim(doc.type).length > 0 &&
    !String(doc._id).startsWith('_design/') &&
    doc._deleted !== true
  );
}

export function parseBackup(raw: string, nowIso: string): BaseDoc[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(IMPORT_INVALID_ERROR);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(IMPORT_INVALID_ERROR);
  }

  const docs = parsed.filter(isValidDoc).map(doc => {
    const createdAt = typeof doc.createdAt === 'string' && doc.createdAt ? doc.createdAt : nowIso;
    const { _rev, _revisions, _conflicts, _deleted, ...rest } = doc;
    return {
      ...rest,
      _id: normalizeTrim(doc._id),
      type: normalizeTrim(doc.type),
      createdAt,
      updatedAt: typeof doc.updatedAt === 'string' && doc.updatedAt ? doc.updatedAt : createdAt,
    } as BaseDoc;
  });

  if (!docs.length) {
    throw new Error(IMPORT_EMPTY_ERROR);
  }

  return docs;
}
