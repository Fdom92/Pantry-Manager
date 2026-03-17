import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { EntitySelectorModalComponent } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { PantryAddModalStateService } from '@core/services/pantry/modals/pantry-add-modal-state.service';

@Component({
  selector: 'app-pantry-add-modal',
  standalone: true,
  imports: [EntitySelectorModalComponent, TranslateModule],
  templateUrl: './add-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryAddModalComponent {
  readonly state = inject(PantryAddModalStateService);
}
