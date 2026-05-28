import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonBadge, IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { TabsStateService } from '@core/services/tabs/tabs-state.service';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonBadge, RouterModule, TranslateModule],
  templateUrl: './tabs.component.html',
  styleUrls: ['./tabs.component.scss'],
})
export class TabsComponent {
  readonly facade = inject(TabsStateService);
}
