import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from './toast.service';
import { LoggerService } from './logger.service';

/**
 * Drains the whole microtask queue via a macrotask, instead of assuming a
 * fixed number of `await Promise.resolve()` calls matches the number of
 * awaits inside `present()`. Keeps tests decoupled from that internal detail.
 */
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('ToastService', () => {
  let service: ToastService;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  let translate: jasmine.SpyObj<TranslateService>;
  let logger: jasmine.SpyObj<LoggerService>;
  let present: jasmine.Spy;

  beforeEach(() => {
    present = jasmine.createSpy('present').and.returnValue(Promise.resolve());
    toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.returnValue(Promise.resolve({ present } as any));
    translate = jasmine.createSpyObj('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => `t:${key}`);
    logger = jasmine.createSpyObj('LoggerService', ['warn']);

    TestBed.configureTestingModule({
      providers: [
        ToastService,
        { provide: ToastController, useValue: toastCtrl },
        { provide: TranslateService, useValue: translate },
        { provide: LoggerService, useValue: logger },
      ],
    });
    service = TestBed.inject(ToastService);
  });

  it('presents a success toast for 1500 ms at the bottom', async () => {
    service.success('pantry.toasts.saved');
    await flush();

    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 't:pantry.toasts.saved', duration: 1500, position: 'bottom' })
    );
    expect(present).toHaveBeenCalled();
  });

  it('presents an error toast for 3000 ms with the danger colour', async () => {
    service.error('shopping.share.error');
    await flush();

    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ duration: 3000, color: 'danger' })
    );
  });

  it('presents an info toast for 2000 ms', async () => {
    service.info('settings.privacy.toastEnabled');
    await flush();

    expect(toastCtrl.create).toHaveBeenCalledWith(jasmine.objectContaining({ duration: 2000 }));
  });

  it('passes interpolation params to the translator', () => {
    service.success('shopping.toasts.bought', { name: 'Leche' });

    expect(translate.instant).toHaveBeenCalledWith('shopping.toasts.bought', { name: 'Leche' });
  });

  it('raw() does not translate and honours explicit options', async () => {
    service.raw('Marked as internal. ID: 42', { duration: 3000, position: 'top' });
    await flush();

    expect(translate.instant).not.toHaveBeenCalled();
    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 'Marked as internal. ID: 42', duration: 3000, position: 'top' })
    );
  });

  it('swallows a failure to present and leaves a warn breadcrumb instead of throwing', async () => {
    toastCtrl.create.and.returnValue(Promise.reject(new Error('overlay controller torn down')));

    expect(() => service.success('pantry.toasts.saved')).not.toThrow();
    await flush();

    expect(logger.warn).toHaveBeenCalledWith(
      'ToastService',
      jasmine.any(String),
      jasmine.any(Object)
    );
  });
});
