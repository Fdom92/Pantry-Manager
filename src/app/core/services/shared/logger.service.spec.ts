import { TestBed } from '@angular/core/testing';
import { LoggerService } from './logger.service';
import { SENTRY_REPORTER, type SentryReporter } from './sentry-reporter';

describe('LoggerService', () => {
  let service: LoggerService;
  let reporter: jasmine.SpyObj<SentryReporter>;

  beforeEach(() => {
    reporter = jasmine.createSpyObj('SentryReporter', ['captureException', 'addBreadcrumb']);
    TestBed.configureTestingModule({
      providers: [LoggerService, { provide: SENTRY_REPORTER, useValue: reporter }],
    });
    service = TestBed.inject(LoggerService);
  });

  describe('error()', () => {
    it('reports the original Error with the scope as a tag', () => {
      const err = new Error('boom');
      service.error('ListStateService', 'markAsBought failed', err);

      expect(reporter.captureException).toHaveBeenCalledTimes(1);
      const [captured, context] = reporter.captureException.calls.mostRecent().args;
      expect(captured).toBe(err);
      expect(context?.tags).toEqual({ scope: 'ListStateService' });
      expect(context?.extra?.['message']).toBe('markAsBought failed');
    });

    it('wraps a non-Error rejection into an Error so Sentry gets a stack', () => {
      service.error('SyncService', 'applyImport failed', 'plain string');

      const [captured] = reporter.captureException.calls.mostRecent().args;
      expect(captured instanceof Error).toBeTrue();
      expect((captured as Error).message).toContain('applyImport failed');
      expect((captured as Error).message).toContain('plain string');
    });

    it('merges extra data into the Sentry context', () => {
      service.error('PantryService', 'save failed', new Error('x'), { itemId: 'item:1' });

      const [, context] = reporter.captureException.calls.mostRecent().args;
      expect(context?.extra?.['itemId']).toBe('item:1');
    });

    it('also prints extra data to the console, not just to Sentry', () => {
      const consoleSpy = spyOn(console, 'error');
      const err = new Error('x');

      service.error('PantryService', 'save failed', err, { itemId: 'item:1' });

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const consoleArgs = consoleSpy.calls.mostRecent().args;
      expect(consoleArgs).toContain(err);
      expect(consoleArgs).toContain(jasmine.objectContaining({ itemId: 'item:1' }));
    });
  });

  describe('warn()', () => {
    it('leaves a breadcrumb and does NOT create a Sentry event', () => {
      service.warn('PantryService', 'Database warmup failed');

      expect(reporter.addBreadcrumb).toHaveBeenCalledTimes(1);
      expect(reporter.captureException).not.toHaveBeenCalled();
      const [breadcrumb] = reporter.addBreadcrumb.calls.mostRecent().args;
      expect(breadcrumb.category).toBe('PantryService');
      expect(breadcrumb.level).toBe('warning');
      expect(breadcrumb.message).toBe('Database warmup failed');
    });
  });
});
