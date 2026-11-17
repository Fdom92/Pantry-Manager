import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANALYTICS_EVENTS } from '@core/constants';
import { PantryStoreService } from '../pantry/pantry-store.service';
import { NotificationPermissionService } from '../notifications/notification-permission.service';
import { ClockService } from '../shared/clock.service';
import { AnalyticsService } from './analytics.service';
import { ActivationService } from './activation.service';

describe('ActivationService', () => {
  const T0 = new Date('2026-11-16T10:00:00.000Z').getTime();
  let items: ReturnType<typeof signal<unknown[]>>;
  let permission: ReturnType<typeof signal<string>>;
  let ready: ReturnType<typeof signal<boolean>>;
  let now: ReturnType<typeof signal<number>>;
  let emitted: Array<{ event: string; props: unknown }>;
  let service: ActivationService;
  let clockMs: number;

  beforeEach(() => {
    localStorage.clear();
    items = signal<unknown[]>([]);
    permission = signal('granted');
    ready = signal(true);
    now = signal(T0);
    spyOn(Date, 'now').and.callFake(() => clockMs);
    clockMs = T0;
    emitted = [];
    const seen = new Set<string>();
    TestBed.configureTestingModule({
      providers: [
        { provide: PantryStoreService, useValue: { items } },
        { provide: NotificationPermissionService, useValue: { permissionState: permission } },
        { provide: ClockService, useValue: { now, tick: () => now.set(Date.now()) } },
        {
          provide: AnalyticsService,
          useValue: {
            isReady: ready,
            // Mirrors the real one: nothing is sent, and the key is kept, while analytics is off.
            trackOnce: (event: string, props: unknown, key: string) => {
              if (!ready() || seen.has(`${event}|${key}`)) return;
              seen.add(`${event}|${key}`);
              emitted.push({ event, props });
            },
          },
        },
      ],
    });
    service = TestBed.inject(ActivationService);
  });

  const flush = () => TestBed.tick();

  it('emits activation_reached once with source and minutes since onboarding', () => {
    service.markOnboarded(false);
    flush();
    clockMs = T0 + 7 * 60_000; // no visibilitychange: only a refresh of the clock can see it
    service.recordFirstProduct('typed');
    items.set([{}]);
    flush();
    items.set([{}, {}]);
    flush();

    expect(emitted).toEqual([
      { event: ANALYTICS_EVENTS.ACTIVATION_REACHED, props: { source: 'typed', minutes_since_onboarding: 7 } },
    ]);
  });

  it('uses source onboarding when the onboarding itself saved products', () => {
    service.markOnboarded(true);
    items.set([{}]);
    flush();

    expect((emitted[0].props as { source: string }).source).toBe('onboarding');
  });

  it('keeps the first source: a later product does not overwrite it', () => {
    service.markOnboarded(true);
    service.recordFirstProduct('receipt');
    items.set([{}]);
    flush();

    expect((emitted[0].props as { source: string }).source).toBe('onboarding');
  });

  it('does not emit without the 5.8 onboarding marker', () => {
    items.set([{}]);
    flush();

    expect(emitted).toEqual([]);
  });

  it('does not record a source without the marker', () => {
    service.recordFirstProduct('typed');
    service.markOnboarded(false);
    items.set([{}]);
    flush();

    expect((emitted[0].props as { source: string }).source).toBe('unknown');
  });

  it('emits when analytics is granted later, and never twice (re-consent)', () => {
    ready.set(false);
    service.markOnboarded(true);
    items.set([{}]);
    flush();
    expect(emitted).toEqual([]);

    ready.set(true);
    flush();
    expect(emitted.length).toBe(1);

    ready.set(false);
    flush();
    ready.set(true);
    flush();
    expect(emitted.length).toBe(1);
  });

  it('does not emit again after a restart once it was reported', () => {
    service.markOnboarded(true);
    items.set([{}]);
    flush();
    expect(emitted.length).toBe(1);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: PantryStoreService, useValue: { items } },
        { provide: NotificationPermissionService, useValue: { permissionState: permission } },
        { provide: ClockService, useValue: { now, tick: () => now.set(Date.now()) } },
        { provide: AnalyticsService, useValue: { isReady: ready, trackOnce: () => emitted.push({ event: 'again', props: {} }) } },
      ],
    });
    TestBed.inject(ActivationService);
    TestBed.tick();

    expect(emitted.length).toBe(1);
  });

  it('needs notifications granted', () => {
    permission.set('denied');
    service.markOnboarded(true);
    items.set([{}]);
    flush();

    expect(emitted).toEqual([]);
  });
});
