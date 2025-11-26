import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { PantryService } from '@core/services/pantry.service';
import { RevenuecatService } from '@core/services/revenuecat.service';

describe('AppComponent', () => {
  it('should create the app', async () => {
    const pantryMock = {
      initialize: jasmine.createSpy().and.resolveTo(),
      ensureFirstPageLoaded: jasmine.createSpy().and.resolveTo(),
      startBackgroundLoad: jasmine.createSpy(),
    } as unknown as PantryService;
    const revenuecatMock = {
      init: jasmine.createSpy().and.resolveTo(),
      isPro$: jasmine.createSpy(),
      restore: jasmine.createSpy().and.resolveTo(),
    } as unknown as RevenuecatService;

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: PantryService, useValue: pantryMock },
        { provide: RevenuecatService, useValue: revenuecatMock },
      ]
    }).compileComponents();
    
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
