import { ChangeDetectionStrategy, Component, inject, ViewChild } from '@angular/core';
import { IonButton, IonInput, IonModal } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';
import { ShoppingManualAddSheetStateService } from './shopping-manual-add-sheet-state.service';
import { ListStateService } from '@core/services/list/list-state.service';
import { SHEET_AUTOFOCUS_DELAY_MS } from '@core/constants';

@Component({
  selector: 'app-shopping-manual-add-sheet',
  standalone: true,
  imports: [IonModal, IonButton, IonInput, TranslateModule],
  templateUrl: './shopping-manual-add-sheet.component.html',
  styleUrls: ['./shopping-manual-add-sheet.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShoppingManualAddSheetComponent {
  readonly state = inject(ShoppingManualAddSheetStateService);
  private readonly listState = inject(ListStateService);

  @ViewChild('nameInput') private nameInputRef?: IonInput;

  /** Focus as the sheet starts to open, so the keyboard rises with it (see the constant). */
  onWillPresent(): void {
    setTimeout(() => void this.nameInputRef?.setFocus(), SHEET_AUTOFOCUS_DELAY_MS);
  }

  confirm(): void {
    const name = this.state.inputValue().trim();
    if (name) {
      this.listState.addManualItem(name);
    }
    this.state.close();
  }
}
