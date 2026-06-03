import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IonButton, IonFooter, IonIcon, IonModal } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { ShoppingBuySheetStateService } from './shopping-buy-sheet-state.service';

@Component({
  selector: 'app-shopping-buy-sheet',
  standalone: true,
  imports: [
    CommonModule,
    IonModal,
    IonFooter,
    IonButton,
    IonIcon,
    TranslateModule,
  ],
  templateUrl: './shopping-buy-sheet.component.html',
  styleUrls: ['./shopping-buy-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShoppingBuySheetComponent {
  readonly state = inject(ShoppingBuySheetStateService);
}
