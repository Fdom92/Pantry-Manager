import { TestBed } from '@angular/core/testing';
import { STORAGE_KEYS } from '@core/constants';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService — Frescos section', () => {
  let service: LocalStorageService;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.PANTRY_FRESH_EXPANDED);
    service = TestBed.inject(LocalStorageService);
  });

  afterEach(() => localStorage.removeItem(STORAGE_KEYS.PANTRY_FRESH_EXPANDED));

  it('is expanded until the user collapses it', () => {
    expect(service.pantryUi.isFreshExpanded()).toBeTrue();
  });

  it('remembers a collapse, and a later expand', () => {
    service.pantryUi.setFreshExpanded(false);
    expect(TestBed.inject(LocalStorageService).pantryUi.isFreshExpanded()).toBeFalse();
    service.pantryUi.setFreshExpanded(true);
    expect(service.pantryUi.isFreshExpanded()).toBeTrue();
  });
});
