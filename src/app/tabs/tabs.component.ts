import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { RevenuecatService } from '@core/services/revenuecat.service';
import { IonicModule, NavController } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonicModule, RouterModule, CommonModule, TranslateModule],
  templateUrl: './tabs.component.html',
  styleUrls: ['./tabs.component.scss'],
})
export class TabsComponent {
  private readonly revenuecat = inject(RevenuecatService);
  private readonly navCtrl = inject(NavController);
  readonly isPro = toSignal(this.revenuecat.isPro$, { initialValue: false });

  onAgentTabClick(event: Event): void {
    if (this.revenuecat.isPro()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void this.navCtrl.navigateForward('/upgrade');
  }
}
