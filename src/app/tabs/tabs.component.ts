import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonicModule, NavController } from '@ionic/angular';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RevenuecatService } from '@core/services/revenuecat.service';

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
