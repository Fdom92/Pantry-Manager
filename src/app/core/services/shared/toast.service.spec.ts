import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { ModalController } from '@ionic/angular/standalone';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from './toast.service';
import { LoggerService } from './logger.service';

/**
 * Drains the whole microtask queue via a macrotask, instead of assuming a
 * fixed number of `await Promise.resolve()` calls matches the number of
 * awaits inside `present()`. Keeps tests decoupled from that internal detail.
 */
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** A fake toast element with present/dismiss/onDidDismiss spies, like the real HTMLIonToastElement. */
const fakeToast = () => ({
  present: jasmine.createSpy('present').and.returnValue(Promise.resolve()),
  dismiss: jasmine.createSpy('dismiss').and.returnValue(Promise.resolve(true)),
  // Never resolves by default — most tests never dismiss the toast they created.
  onDidDismiss: jasmine.createSpy('onDidDismiss').and.returnValue(new Promise(() => undefined)),
});

describe('ToastService', () => {
  let service: ToastService;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  let modalCtrl: jasmine.SpyObj<ModalController>;
  let translate: jasmine.SpyObj<TranslateService>;
  let logger: jasmine.SpyObj<LoggerService>;
  let toasts: ReturnType<typeof fakeToast>[];

  /** The toast element created by the Nth (1-indexed) call to `create()`. */
  const toastN = (n: number) => toasts[n - 1];

  beforeEach(() => {
    toasts = [];

    toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.callFake(() => {
      const toast = fakeToast();
      toasts.push(toast);
      return Promise.resolve(toast as any);
    });

    modalCtrl = jasmine.createSpyObj('ModalController', ['getTop']);
    modalCtrl.getTop.and.returnValue(Promise.resolve(undefined));

    translate = jasmine.createSpyObj('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => `t:${key}`);
    logger = jasmine.createSpyObj('LoggerService', ['warn']);

    TestBed.configureTestingModule({
      providers: [
        ToastService,
        { provide: ToastController, useValue: toastCtrl },
        { provide: ModalController, useValue: modalCtrl },
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
    expect(toastN(1).present).toHaveBeenCalled();
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

  it('dismisses the previous toast before presenting a new one', async () => {
    service.success('pantry.toasts.saved');
    await flush();
    service.info('settings.privacy.toastEnabled');
    await flush();

    expect(toasts.length).toBe(2);
    expect(toastN(1).dismiss).toHaveBeenCalled();
    expect(toastN(2).present).toHaveBeenCalled();
  });

  it('goes to the top when a modal is open and no explicit position was given', async () => {
    modalCtrl.getTop.and.returnValue(Promise.resolve({} as any));

    service.success('pantry.toasts.saved');
    await flush();

    expect(toastCtrl.create).toHaveBeenCalledWith(jasmine.objectContaining({ position: 'top' }));
  });

  it('keeps an explicit position even with a modal open', async () => {
    modalCtrl.getTop.and.returnValue(Promise.resolve({} as any));

    service.raw('Marked as internal.', { position: 'bottom' });
    await flush();

    expect(toastCtrl.create).toHaveBeenCalledWith(jasmine.objectContaining({ position: 'bottom' }));
  });

  it('clears the tracked current toast once it dismisses on its own (e.g. its duration elapsed)', async () => {
    let resolveDismiss: () => void = () => undefined;
    toastCtrl.create.and.callFake(() => {
      const toast = fakeToast();
      toast.onDidDismiss.and.returnValue(new Promise<void>(resolve => { resolveDismiss = resolve; }));
      toasts.push(toast);
      return Promise.resolve(toast as any);
    });

    service.success('pantry.toasts.saved');
    await flush();
    resolveDismiss();
    await flush();

    service.info('settings.privacy.toastEnabled');
    await flush();

    // The first toast is long gone by the time the second is shown, so there is
    // nothing left to dismiss.
    expect(toastN(1).dismiss).not.toHaveBeenCalled();
  });
});
