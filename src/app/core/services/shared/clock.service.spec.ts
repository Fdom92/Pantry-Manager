import { TestBed } from '@angular/core/testing';
import { ClockService } from './clock.service';

describe('ClockService', () => {
  let clock: ClockService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    clock = TestBed.inject(ClockService);
  });

  it('moves to a new day even when little time passed (resume after midnight)', () => {
    const lateNight = new Date(2026, 8, 22, 23, 59, 50).getTime();
    clock.now.set(lateNight);
    const nextDay = new Date(2026, 8, 23, 0, 0, 5).getTime();
    clock.tick(nextDay);
    expect(clock.now()).toBe(nextDay);
    expect(clock.today()).toBe(new Date(2026, 8, 23).getTime());
  });

  it('skips the write for a quick resume on the same day', () => {
    const t = new Date(2026, 8, 22, 10, 0, 0).getTime();
    clock.now.set(t);
    clock.tick(t + 30_000);
    expect(clock.now()).toBe(t);
  });

  it('keeps `today` stable across ticks within the same day', () => {
    clock.now.set(new Date(2026, 8, 22, 9, 0).getTime());
    const before = clock.today();
    clock.tick(new Date(2026, 8, 22, 18, 0).getTime());
    expect(clock.today()).toBe(before);
  });
});
