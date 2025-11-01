import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { SeedService } from '@core/services/seed.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(private seedService: SeedService) {}

  ngOnInit(): void {
    // void this.seedService.ensureSeedData();
  }
}
