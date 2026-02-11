import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShoppingAddPurchaseModalStateService } from '@core/services/shopping/shopping-add-purchase-modal-state.service';
import { ShoppingStateService } from '@core/services/shopping/shopping-state.service';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-add-purchase-modal',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    TranslateModule,
  ],
  templateUrl: './add-purchase-modal.component.html',
  styleUrls: ['./add-purchase-modal.component.scss'],
  providers: [ShoppingAddPurchaseModalStateService],
})
export class AddPurchaseModalComponent {
  readonly state = inject(ShoppingStateService);
  readonly modal = inject(ShoppingAddPurchaseModalStateService);
}
