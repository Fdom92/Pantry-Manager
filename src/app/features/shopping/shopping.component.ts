import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ShoppingStateService } from '@core/services/shopping';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { AddPurchaseModalComponent } from './components/add-purchase-modal/add-purchase-modal.component';
import { ShoppingFacade } from './facade/shopping.facade';

@Component({
  selector: 'app-shopping',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    TranslateModule,
    EmptyStateComponent,
    AddPurchaseModalComponent,
  ],
  templateUrl: './shopping.component.html',
  styleUrls: ['./shopping.component.scss'],
  providers: [ShoppingStateService, ShoppingFacade],
})
export class ShoppingComponent {
  readonly facade = inject(ShoppingFacade);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }
}

