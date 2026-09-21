import { TestBed } from '@angular/core/testing';
import { STORAGE_KEYS } from '@core/constants';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  let service: LocalStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [LocalStorageService] });
    service = TestBed.inject(LocalStorageService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEYS.PANTRY_SORT);
  });

  describe('pantrySort', () => {
    it('returns a stored valid mode', () => {
      localStorage.setItem(STORAGE_KEYS.PANTRY_SORT, 'alpha');
      expect(service.pantrySort.get()).toBe('alpha');
    });

    it('falls back to expiry when nothing is stored', () => {
      expect(service.pantrySort.get()).toBe('expiry');
    });

    it('falls back to expiry on a garbage stored value', () => {
      localStorage.setItem(STORAGE_KEYS.PANTRY_SORT, 'recent');
      expect(service.pantrySort.get()).toBe('expiry');
    });

    it('persists what was set', () => {
      service.pantrySort.set('alpha');
      expect(service.pantrySort.get()).toBe('alpha');
    });
  });
});
