import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { AlertController } from '@ionic/angular';
import { resolveFoodClass } from '@core/domain/pantry';
import type { PantryItem } from '@core/models/pantry';
import { PantryFreshEditModalStateService } from './pantry-fresh-edit-modal-state.service';
import { PantryStoreService } from '../pantry-store.service';
import { PantryStateService } from '../pantry-state.service';
import { HistoryEventManagerService } from '../../history/history-event-manager.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { CatalogOptionsService, SettingsPreferencesService } from '../../settings';
import { LoggerService } from '../../shared/logger.service';
import { ToastService } from '../../shared';

describe('PantryFreshEditModalStateService', () => {
  let service: PantryFreshEditModalStateService;
  let store: jasmine.SpyObj<PantryStoreService>;

  const fresh = (name: string, foodKind?: string): PantryItem => ({
    _id: 'f1', type: 'item', name, categoryId: 'cat', productType: 'fresh', foodKind,
    batches: [{ batchId: 'b1', quantity: 3 }],
  } as PantryItem);

  beforeEach(() => {
    store = jasmine.createSpyObj('PantryStoreService', ['updateItem']);
    store.updateItem.and.resolveTo();
    TestBed.configureTestingModule({
      providers: [
        PantryFreshEditModalStateService,
        { provide: PantryStoreService, useValue: store },
        { provide: PantryStateService, useValue: { editFreshItemModalRequest: signal(null), clearEditFreshItemModalRequest: () => undefined } },
        { provide: TranslateService, useValue: { instant: (k: string) => k } },
        { provide: AlertController, useValue: {} },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success']) },
        { provide: HistoryEventManagerService, useValue: jasmine.createSpyObj('HistoryEventManagerService', ['logAdvancedEdit']) },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn']) },
        { provide: SettingsPreferencesService, useValue: { preferences: signal({}) } },
        { provide: CatalogOptionsService, useValue: {} },
      ],
    });
    service = TestBed.inject(PantryFreshEditModalStateService);
  });

  it('recomputes the food kind when the name changes', async () => {
    service.open(fresh('Leche', 'uht-milk'));
    service.form.patchValue({ name: 'Leche fresca' });
    await service.save();
    const saved = store.updateItem.calls.mostRecent().args[0] as PantryItem;
    expect(saved.foodKind).toBe(resolveFoodClass('Leche fresca', undefined)?.key);
    expect(saved.foodKind).not.toBe('uht-milk');
  });

  it('keeps the food kind when nothing relevant changed', async () => {
    service.open(fresh('Leche', 'uht-milk'));
    await service.save();
    expect((store.updateItem.calls.mostRecent().args[0] as PantryItem).foodKind).toBe('uht-milk');
  });
});
