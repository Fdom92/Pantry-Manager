import { IMPORT_EMPTY_ERROR, IMPORT_INVALID_ERROR } from '@core/constants';
import { buildExportFileName, formatIsoTimestampForFilename, parseBackup } from './settings.domain';

const NOW = new Date('2026-08-25T14:30:05.123Z');
const NOW_ISO = NOW.toISOString();

describe('buildExportFileName', () => {
  it('strips the characters a filesystem will not take', () => {
    const name = buildExportFileName(NOW);
    expect(name).not.toContain(':');
    expect(name.endsWith('.json')).toBe(true);
  });

  it('keeps the timestamp sortable so backups list in order', () => {
    const earlier = buildExportFileName(new Date('2026-08-25T09:00:00'));
    const later = buildExportFileName(new Date('2026-08-25T18:00:00'));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it('names the file with the day the user actually exported on', () => {
    // Local, not UTC: at 01:00 on the 26th in Madrid, a UTC stamp reads the
    // 25th, so the backup you just made looks like yesterday's.
    const lateNight = new Date('2026-08-26T01:00:00+02:00');
    expect(buildExportFileName(lateNight)).toContain('2026-08-26');
  });

  it('leaves out the seconds, the milliseconds and the ISO punctuation', () => {
    const name = buildExportFileName(NOW);
    expect(name).not.toContain('T');
    expect(name).not.toContain('Z');
    expect(/\d{3}\.json$/.test(name)).toBe(false);
  });

  it('keeps a minute of precision so two exports in a day do not collide', () => {
    const first = buildExportFileName(new Date('2026-08-25T09:15:00'));
    const second = buildExportFileName(new Date('2026-08-25T09:16:00'));
    expect(first).not.toBe(second);
  });

  it('formats as year-month-day then time', () => {
    expect(formatIsoTimestampForFilename(new Date('2026-08-25T14:30:05'))).toBe('2026-08-25-14-30');
  });
});

describe('parseBackup', () => {
  const doc = (over: Record<string, unknown> = {}) => ({
    _id: 'item:1', type: 'item', name: 'Leche', ...over,
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseBackup('{{ not json', NOW_ISO)).toThrowError(IMPORT_INVALID_ERROR);
  });

  it('rejects JSON that is not a list of documents', () => {
    expect(() => parseBackup('{"_id":"item:1"}', NOW_ISO)).toThrowError(IMPORT_INVALID_ERROR);
    expect(() => parseBackup('"a string"', NOW_ISO)).toThrowError(IMPORT_INVALID_ERROR);
  });

  it('rejects a file whose documents are all unusable', () => {
    // Distinct from invalid JSON: the file parsed, it just carries nothing to
    // restore, and telling the user that is more useful than "corrupt file".
    expect(() => parseBackup(JSON.stringify([{ nope: true }]), NOW_ISO))
      .toThrowError(IMPORT_EMPTY_ERROR);
    expect(() => parseBackup('[]', NOW_ISO)).toThrowError(IMPORT_EMPTY_ERROR);
  });

  it('keeps the documents that are usable and drops the rest', () => {
    const docs = parseBackup(JSON.stringify([doc(), { nope: true }, doc({ _id: 'item:2' })]), NOW_ISO);
    expect(docs.length).toBe(2);
  });

  it('drops revision metadata that would clash with the local database', () => {
    const [restored] = parseBackup(
      JSON.stringify([doc({ _rev: '3-abc', _revisions: {}, _conflicts: [] })]),
      NOW_ISO,
    );
    expect('_rev' in restored).toBe(false);
    expect('_revisions' in restored).toBe(false);
    expect('_conflicts' in restored).toBe(false);
  });

  it('never restores a deleted document or a design document', () => {
    expect(() => parseBackup(
      JSON.stringify([doc({ _deleted: true }), doc({ _id: '_design/by_type' })]),
      NOW_ISO,
    )).toThrowError(IMPORT_EMPTY_ERROR);
  });

  it('preserves the original timestamps when the backup carries them', () => {
    const [restored] = parseBackup(
      JSON.stringify([doc({ createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2021-01-01T00:00:00.000Z' })]),
      NOW_ISO,
    );
    expect(restored.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(restored.updatedAt).toBe('2021-01-01T00:00:00.000Z');
  });

  it('stamps missing timestamps rather than restoring a document without them', () => {
    const [restored] = parseBackup(JSON.stringify([doc()]), NOW_ISO);
    expect(restored.createdAt).toBe(NOW_ISO);
    expect(restored.updatedAt).toBe(NOW_ISO);
  });

  it('dates an update from its own creation, not from the import', () => {
    const [restored] = parseBackup(
      JSON.stringify([doc({ createdAt: '2020-01-01T00:00:00.000Z' })]),
      NOW_ISO,
    );
    expect(restored.updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('trims whitespace around ids and types', () => {
    const [restored] = parseBackup(JSON.stringify([doc({ _id: '  item:1  ', type: ' item ' })]), NOW_ISO);
    expect(restored._id).toBe('item:1');
    expect(restored.type).toBe('item');
  });

  it('rejects a document whose id or type is only whitespace', () => {
    expect(() => parseBackup(JSON.stringify([doc({ _id: '   ' })]), NOW_ISO))
      .toThrowError(IMPORT_EMPTY_ERROR);
    expect(() => parseBackup(JSON.stringify([doc({ type: '   ' })]), NOW_ISO))
      .toThrowError(IMPORT_EMPTY_ERROR);
  });
});
