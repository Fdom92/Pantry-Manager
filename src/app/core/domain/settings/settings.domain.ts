import { BACKUP_FILENAME, IMPORT_EMPTY_ERROR, IMPORT_EMPTY_INVALID } from '@core/constants';
import type { BaseDoc } from '@core/models/shared';

export function buildExportFileName(now: Date = new Date()): string {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `${BACKUP_FILENAME}-${timestamp}.json`;
}

export function parseBackup(raw: string, nowIso: string = new Date().toISOString()): BaseDoc[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(IMPORT_EMPTY_INVALID);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(IMPORT_EMPTY_INVALID);
  }

  const docs = parsed
    .filter(entry => !!entry && typeof entry === 'object')
    .map(entry => entry as any)
    .filter(doc => typeof doc._id === 'string' && doc._id.trim().length > 0)
    .filter(doc => typeof doc.type === 'string' && doc.type.trim().length > 0)
    .filter(doc => !String(doc._id).startsWith('_design/'))
    .filter(doc => doc._deleted !== true)
    .map(doc => {
      const sanitizedId = doc._id.trim();
      const sanitizedType = doc.type.trim();
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

