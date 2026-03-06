import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ListStateService } from '@core/services/list/list-state.service';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-list',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    RouterLink,
    TranslateModule,
    EmptyStateComponent,
  ],
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
  providers: [ListStateService],
})
export class ListComponent {
  readonly facade = inject(ListStateService);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }
}
