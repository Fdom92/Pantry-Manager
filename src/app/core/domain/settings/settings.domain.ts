import { BACKUP_FILENAME, IMPORT_EMPTY_ERROR, IMPORT_INVALID_ERROR } from '@core/constants';
import type { BaseDoc } from '@core/models/shared';
import { normalizeTrim } from '@core/utils/normalization.util';

export function formatIsoTimestampForFilename(now: Date): string {
  return now.toISOString().replace(/[:.]/g, '-');
}

export function buildExportFileName(now: Date): string {
  const timestamp = formatIsoTimestampForFilename(now);
  return `${BACKUP_FILENAME}-${timestamp}.json`;
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

  const docs = parsed
    .filter(entry => !!entry && typeof entry === 'object')
    .map(entry => entry as any)
    .filter(doc => typeof doc._id === 'string' && normalizeTrim(doc._id).length > 0)
    .filter(doc => typeof doc.type === 'string' && normalizeTrim(doc.type).length > 0)
    .filter(doc => !String(doc._id).startsWith('_design/'))
    .filter(doc => doc._deleted !== true)
    .map(doc => {
      const sanitizedId = normalizeTrim(doc._id);
      const sanitizedType = normalizeTrim(doc.type);
      const createdAt = typeof doc.createdAt === 'string' && doc.createdAt ? doc.createdAt : nowIso;
      const updatedAt = typeof doc.updatedAt === 'string' && doc.updatedAt ? doc.updatedAt : createdAt;
      const { _rev, _revisions, _conflicts, _deleted, ...rest } = doc;
      return {
        ...rest,
        _id: sanitizedId,
        type: sanitizedType,
        createdAt,
        updatedAt,
      } as BaseDoc;
    });

  if (!docs.length) {
    throw new Error(IMPORT_EMPTY_ERROR);
  }

  return docs;
}
