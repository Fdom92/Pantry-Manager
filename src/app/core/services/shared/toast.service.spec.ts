import { TestBed } from '@angular/core/testing';
import { ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let toastCtrl: jasmine.SpyObj<ToastController>;
  let translate: jasmine.SpyObj<TranslateService>;
  let present: jasmine.Spy;

  beforeEach(() => {
    present = jasmine.createSpy('present').and.returnValue(Promise.resolve());
    toastCtrl = jasmine.createSpyObj('ToastController', ['create']);
    toastCtrl.create.and.returnValue(Promise.resolve({ present } as any));
    translate = jasmine.createSpyObj('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => `t:${key}`);

    TestBed.configureTestingModule({
      providers: [
        ToastService,
        { provide: ToastController, useValue: toastCtrl },
        { provide: TranslateService, useValue: translate },
      ],
    });
    service = TestBed.inject(ToastService);
  });

  it('presents a success toast for 1500 ms at the bottom', async () => {
    service.success('pantry.toasts.saved');
    await Promise.resolve();

    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 't:pantry.toasts.saved', duration: 1500, position: 'bottom' })
    );
    expect(present).toHaveBeenCalled();
  });

  it('presents an error toast for 3000 ms with the danger colour', async () => {
    service.error('shopping.share.error');
    await Promise.resolve();

    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ duration: 3000, color: 'danger' })
    );
  });

  it('presents an info toast for 2000 ms', async () => {
    service.info('settings.privacy.toastEnabled');
    await Promise.resolve();

    expect(toastCtrl.create).toHaveBeenCalledWith(jasmine.objectContaining({ duration: 2000 }));
  });

  it('passes interpolation params to the translator', () => {
    service.success('shopping.toasts.bought', { name: 'Leche' });

    expect(translate.instant).toHaveBeenCalledWith('shopping.toasts.bought', { name: 'Leche' });
  });

  it('raw() does not translate and honours explicit options', async () => {
    service.raw('Marked as internal. ID: 42', { duration: 3000, position: 'top' });
    await Promise.resolve();

    expect(translate.instant).not.toHaveBeenCalled();
    expect(toastCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 'Marked as internal. ID: 42', duration: 3000, position: 'top' })
    );
  });
});
