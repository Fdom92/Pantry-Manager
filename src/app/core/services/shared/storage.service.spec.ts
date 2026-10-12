import { TestBed } from '@angular/core/testing';
import { StorageService } from './storage.service';
import type { BaseDoc } from '@core/models/shared';

/**
 * The IDB connection can be reported "closing" by the WebView right after the
 * app returns from background (Android reclaiming resources) — this is the
 * exact shape Chromium throws, reproduced here without touching the real
 * IndexedDB connection.
 */
function idbClosingError(): Error {
  const err = new Error("Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.");
  err.name = 'InvalidStateError';
  return err;
}

describe('StorageService', () => {
  let service: StorageService<BaseDoc>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [StorageService] });
    service = TestBed.inject(StorageService) as StorageService<BaseDoc>;
  });

  describe('ensureIndex', () => {
    it('rethrows an IDB-connection-closing error instead of swallowing it', async () => {
      spyOn((service as any).db, 'createIndex').and.rejectWith(idbClosingError());
      await expectAsync(service.ensureIndex(['type'])).toBeRejectedWithError(/connection is closing/);
    });

    it('still swallows a plain "index already exists"-shaped error', async () => {
      spyOn((service as any).db, 'createIndex').and.rejectWith(new Error('some benign index warning'));
      await expectAsync(service.ensureIndex(['type'])).toBeResolved();
    });
  });

  describe('findByField', () => {
    it('retries once on a closing connection instead of degrading to an empty result', async () => {
      // First call on the stale db throws; withRetry() must reopen and retry
      // — not swallow it internally and hand back [] as if there were
      // genuinely no matches, which is what actually shipped this bug.
      spyOn((service as any).db, 'find').and.rejectWith(idbClosingError());
      const loggerErrorSpy = spyOn((service as any).logger, 'error');

      const result = await service.findByField('type', 'event' as any);

      expect(result).toEqual([]); // the fresh (real, empty) db genuinely has no matches
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('retries once on a closing connection instead of giving up immediately', async () => {
      // Seed a real doc first (reopening points at the same underlying
      // IndexedDB, so the retried attempt can still find it).
      await service.save({ _id: 'doc-to-remove', type: 'test' } as BaseDoc);

      spyOn((service as any).db, 'get').and.rejectWith(idbClosingError());
      const loggerErrorSpy = spyOn((service as any).logger, 'error');

      const result = await service.remove('doc-to-remove');

      expect(result).toBeTrue();
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('countByType', () => {
    it('retries once on a closing connection instead of throwing unhandled', async () => {
      spyOn((service as any).db, 'find').and.rejectWith(idbClosingError());
      await expectAsync((service as any).countByType('event')).toBeResolvedTo(0);
    });
  });
});
