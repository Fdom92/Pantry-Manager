import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { EntitySelectorModalComponent } from '@shared/components/entity-selector-modal/entity-selector-modal.component';
import { PantryFreshAddModalStateService } from '@core/services/pantry/modals/pantry-fresh-add-modal-state.service';

@Component({
  selector: 'app-fresh-add-modal',
  standalone: true,
  imports: [EntitySelectorModalComponent, TranslateModule],
  templateUrl: './fresh-add-modal.component.html',
  styleUrls: ['./fresh-add-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FreshAddModalComponent {
  readonly state = inject(PantryFreshAddModalStateService);
}
