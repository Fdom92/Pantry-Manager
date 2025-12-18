import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, RouterModule, CommonModule, TranslateModule],
  templateUrl: './tabs.component.html',
  styleUrls: ['./tabs.component.scss'],
})
export class TabsComponent {
  // DI
  readonly revenuecat = inject(RevenuecatService);
  // Signals
  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: false });
  // Computed Signals
  readonly canUseAgent = computed(() => !environment.production || this.isPro());
}
