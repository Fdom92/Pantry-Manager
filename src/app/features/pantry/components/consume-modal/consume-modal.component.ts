import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { EntitySelectorModalComponent } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { PantryConsumeModalStateService } from '@core/services/pantry/modals/pantry-consume-modal-state.service';

@Component({
  selector: 'app-pantry-consume-modal',
  standalone: true,
  imports: [EntitySelectorModalComponent, TranslateModule],
  templateUrl: './consume-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PantryConsumeModalComponent {
  readonly state = inject(PantryConsumeModalStateService);
}
