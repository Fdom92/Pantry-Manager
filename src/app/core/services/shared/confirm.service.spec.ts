import { TestBed } from '@angular/core/testing';
import { AlertController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  let service: ConfirmService;
  let alertCtrl: jasmine.SpyObj<AlertController>;
  let translate: jasmine.SpyObj<TranslateService>;
  let present: jasmine.Spy;
  let onDidDismiss: jasmine.Spy;

  const setDismissRole = (role: string | undefined) => {
    onDidDismiss.and.returnValue(Promise.resolve({ role }));
  };

  beforeEach(() => {
    present = jasmine.createSpy('present').and.returnValue(Promise.resolve());
    onDidDismiss = jasmine.createSpy('onDidDismiss').and.returnValue(Promise.resolve({ role: 'confirm' }));
    alertCtrl = jasmine.createSpyObj('AlertController', ['create']);
    alertCtrl.create.and.returnValue(Promise.resolve({ present, onDidDismiss } as any));
    translate = jasmine.createSpyObj('TranslateService', ['instant']);
    translate.instant.and.callFake((key: string) => `t:${key}`);

    TestBed.configureTestingModule({
      providers: [
        ConfirmService,
        { provide: AlertController, useValue: alertCtrl },
        { provide: TranslateService, useValue: translate },
      ],
    });
    service = TestBed.inject(ConfirmService);
  });

  it('returns true when the alert dismisses with role "confirm"', async () => {
    setDismissRole('confirm');

    const result = await service.confirm('Are you sure?');

    expect(result).toBeTrue();
    expect(present).toHaveBeenCalled();
  });

  it('returns false when the alert dismisses with role "cancel"', async () => {
    setDismissRole('cancel');

    const result = await service.confirm('Are you sure?');

    expect(result).toBeFalse();
  });

  it('returns false when the alert dismisses with role "backdrop" (tap outside)', async () => {
    setDismissRole('backdrop');

    const result = await service.confirm('Are you sure?');

    expect(result).toBeFalse();
  });

  it('uses common.actions.confirm as the confirming button by default', async () => {
    setDismissRole('confirm');

    await service.confirm('Are you sure?');

    expect(alertCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({
        message: 'Are you sure?',
        buttons: [
          jasmine.objectContaining({ text: 't:common.actions.cancel', role: 'cancel' }),
          jasmine.objectContaining({ text: 't:common.actions.confirm', role: 'confirm' }),
        ],
      })
    );
  });

  it('uses the caller-provided confirmKey for the confirming button when given', async () => {
    setDismissRole('confirm');

    await service.confirm('Delete this item?', { confirmKey: 'common.actions.delete' });

    expect(alertCtrl.create).toHaveBeenCalledWith(
      jasmine.objectContaining({
        buttons: [
          jasmine.objectContaining({ text: 't:common.actions.cancel', role: 'cancel' }),
          jasmine.objectContaining({ text: 't:common.actions.delete', role: 'confirm' }),
        ],
      })
    );
  });
});
