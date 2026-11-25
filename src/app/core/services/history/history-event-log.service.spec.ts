import { TestBed } from '@angular/core/testing';
import { HistoryEventLogService } from './history-event-log.service';
import type { PantryEvent } from '@core/models/events';

describe('HistoryEventLogService snapshot', () => {
  let service: HistoryEventLogService;

  const event = (id: string, timestamp: string): PantryEvent =>
    ({ _id: id, type: 'event', eventType: 'ADD', timestamp } as PantryEvent);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HistoryEventLogService);
  });

  it('has nothing to show before the first read', () => {
    expect(service.peekEvents()).toBeNull();
  });

  it('remembers the last full read, newest first, so a rebuilt page can paint at once', async () => {
    const allSpy = spyOn(service as unknown as { allByIdPrefix: (prefix: string) => Promise<PantryEvent[]> }, 'allByIdPrefix').and.resolveTo([
      event('event:a', '2026-10-01T10:00:00Z'),
      event('event:b', '2026-10-02T10:00:00Z'),
    ]);

    const listed = await service.listEvents();

    expect(service.peekEvents()).toBe(listed);
    expect(allSpy).toHaveBeenCalledOnceWith('event:');
    expect(listed.map(e => e._id)).toEqual(['event:b', 'event:a']);
  });
});

describe('HistoryEventLogService foodKind / dateFromUser', () => {
  it('stores both on the event so learning can read them back', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(HistoryEventLogService);
    const saveSpy = spyOn(service, 'save').and.callFake(async doc => doc as PantryEvent);

    const saved = await service.logAddEvent({ productId: 'item:1', quantity: 1, foodKind: 'fresh-bread', dateFromUser: true });

    expect(saveSpy).toHaveBeenCalled();
    expect(saved?.foodKind).toBe('fresh-bread');
    expect(saved?.dateFromUser).toBeTrue();
  });
});
