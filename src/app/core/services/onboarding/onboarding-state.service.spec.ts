import { TestBed } from '@angular/core/testing';
import { ONBOARDING_QUICK_SEED_ITEMS } from '@core/constants';
import { FoodType } from '@core/models/shared';
import type { AddOption } from '@core/domain/pantry';
import { NavController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationPermissionService } from '../notifications/notification-permission.service';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
import { WelcomeNotificationService } from '../notifications/welcome-notification.service';
import { FirstProductsService } from '../pantry/first-products.service';
import { SettingsPreferencesService } from '../settings/settings-preferences.service';
import { ClockService } from '../shared/clock.service';
import { LocalStorageService } from '../shared/local-storage.service';
import { LoggerService } from '../shared/logger.service';
import { ToastService } from '../shared/toast.service';
import { OnboardingStateService } from './onboarding-state.service';

describe('OnboardingStateService — add step', () => {
  const NOW = new Date('2026-11-16T10:00:00.000Z').getTime();
  let service: OnboardingStateService;
  let firstProducts: jasmine.SpyObj<FirstProductsService>;
  let toast: jasmine.SpyObj<ToastService>;
  let slideNext: jasmine.Spy;
  let swiperEl: HTMLElement;

  const basic = (key: string, name: string): AddOption => ({
    kind: 'basic',
    seed: ONBOARDING_QUICK_SEED_ITEMS.find(s => s.key === key)!,
    name,
  });

  beforeEach(() => {
    firstProducts = jasmine.createSpyObj('FirstProductsService', ['save']);
    firstProducts.save.and.resolveTo([]);
    TestBed.configureTestingModule({
      providers: [
        OnboardingStateService,
        { provide: FirstProductsService, useValue: firstProducts },
        { provide: ClockService, useValue: { now: () => NOW } },
        { provide: NavController, useValue: jasmine.createSpyObj('NavController', ['navigateRoot']) },
        { provide: NotificationPermissionService, useValue: {} },
        {
          provide: SettingsPreferencesService,
          useValue: { getPreferences: async () => ({}), savePreferences: async () => undefined },
        },
        { provide: WelcomeNotificationService, useValue: {} },
        { provide: NotificationSchedulerService, useValue: { scheduleAll: async () => undefined } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: AnalyticsService, useValue: jasmine.createSpyObj('AnalyticsService', ['track']) },
        { provide: LocalStorageService, useValue: { onboarding: { setSeen: () => undefined } } },
        { provide: ToastService, useFactory: () => (toast = jasmine.createSpyObj('ToastService', ['error'])) },
        { provide: LoggerService, useValue: jasmine.createSpyObj('LoggerService', ['error', 'warn']) },
      ],
    });
    service = TestBed.inject(OnboardingStateService);
    slideNext = jasmine.createSpy('slideNext');
    swiperEl = Object.assign(document.createElement('div'), { swiper: { isEnd: false, slideNext, realIndex: 0 } });
  });

  /** The swiper reporting it now shows slide `index`, as a swipe or slideNext would. */
  const landOn = (index: number) =>
    service.onSlideChanged(Object.assign(document.createElement('div'), { swiper: { realIndex: index, slideNext } }));

  it('a picked basic becomes a draft with its class, storage and a suggested date', () => {
    service.addDraft(basic('eggs', 'Huevos'));
    expect(service.drafts()).toEqual([
      jasmine.objectContaining({ name: 'Huevos', classKey: 'eggs', storage: 'fresh', source: 'suggestion', dateFromUser: false }),
    ]);
    expect(service.drafts()[0].expirationDate).toBeTruthy();
  });

  it('a typed name gets its class from the name, and pantry when nothing matches', () => {
    service.addDraft('huevos camperos');
    service.addDraft('cosa rara');
    const [eggs, unknown] = service.drafts();
    expect(eggs).toEqual(jasmine.objectContaining({ classKey: 'eggs', storage: 'fresh', source: 'typed' }));
    expect(unknown).toEqual(jasmine.objectContaining({ storage: 'pantry', source: 'typed' }));
    expect(unknown.classKey).toBeUndefined();
  });

  it('the same product twice is one draft', () => {
    service.addDraft(basic('eggs', 'Huevos'));
    service.addDraft('huevos');
    expect(service.drafts().length).toBe(1);
  });

  it('removeDraft drops that row', () => {
    service.addDraft(basic('eggs', 'Huevos'));
    service.addDraft(basic('milk', 'Leche'));
    service.removeDraft(0);
    expect(service.drafts().map(d => d.name)).toEqual(['Leche']);
  });

  it('firstDraft feeds the notification preview', () => {
    expect(service.firstDraft()).toBeNull();
    service.addDraft(basic('milk', 'Leche'));
    service.addDraft(basic('eggs', 'Huevos'));
    expect(service.firstDraft()?.name).toBe('Leche');
  });

  it('continue from add saves the drafts before moving to notifications', async () => {
    firstProducts.save.and.callFake(async () => {
      expect(slideNext).not.toHaveBeenCalled();
      return [];
    });
    service.addDraft(basic('milk', 'Leche'));
    await service.continueFromAdd(swiperEl);
    expect(firstProducts.save).toHaveBeenCalledOnceWith([jasmine.objectContaining({ name: 'Leche' })]);
    expect(slideNext).toHaveBeenCalled();
  });

  it('continuing again after coming back does not save the products twice', async () => {
    service.addDraft(basic('milk', 'Leche'));
    await service.continueFromAdd(swiperEl);
    await service.continueFromAdd(swiperEl);
    expect(firstProducts.save).toHaveBeenCalledTimes(1);
  });

  it('startEmpty saves nothing, clears the drafts and moves on', async () => {
    service.addDraft(basic('milk', 'Leche'));
    await service.startEmpty(swiperEl);
    expect(firstProducts.save).not.toHaveBeenCalled();
    expect(service.firstDraft()).toBeNull();
    expect(slideNext).toHaveBeenCalled();
  });

  it('leaving the add step by swipe saves the drafts, once', async () => {
    service.addDraft(basic('milk', 'Leche'));
    landOn(1);
    await Promise.resolve();
    landOn(2);
    expect(firstProducts.save).toHaveBeenCalledOnceWith([jasmine.objectContaining({ name: 'Leche' })]);
  });

  it('a swipe with no drafts saves nothing', () => {
    landOn(1);
    expect(firstProducts.save).not.toHaveBeenCalled();
  });

  it('completing saves drafts left unsaved, and does not save again after Continuar', async () => {
    service.addDraft(basic('milk', 'Leche'));
    await service.completeOnboarding();
    expect(firstProducts.save).toHaveBeenCalledTimes(1);

    firstProducts.save.calls.reset();
    await service.completeOnboarding();
    expect(firstProducts.save).not.toHaveBeenCalled();
  });

  it('a failed save shows a toast, stays on the step and can be retried', async () => {
    firstProducts.save.and.rejectWith(new Error('disk full'));
    service.addDraft(basic('milk', 'Leche'));
    await service.continueFromAdd(swiperEl);
    expect(toast.error).toHaveBeenCalledWith('onboarding.slides.add.saveError');
    expect(slideNext).not.toHaveBeenCalled();
    expect(service.draftsSaved()).toBeFalse();

    firstProducts.save.and.resolveTo([]);
    await service.continueFromAdd(swiperEl);
    expect(firstProducts.save).toHaveBeenCalledTimes(2);
    expect(slideNext).toHaveBeenCalled();
  });

  it('a type change drops a class of another type, and keeps one that still fits', () => {
    service.addDraft(basic('eggs', 'Huevos'));
    service.addDraft(basic('milk', 'Leche'));
    service.setDraftFoodType(0, FoodType.DAIRY);
    service.setDraftFoodType(1, FoodType.DAIRY);
    const [eggs, milk] = service.drafts();
    expect(eggs.classKey).toBeUndefined();
    expect(eggs.foodType).toBe(FoodType.DAIRY);
    expect(milk.classKey).toBe('uht-milk');
  });
});
