import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { PantryService } from '@core/services/pantry.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor(private readonly pantryService: PantryService) {
    void this.preloadPantryData();
  }

  private async preloadPantryData(): Promise<void> {
    await this.pantryService.initialize();
    await this.pantryService.reloadFromStart();
  }
}
