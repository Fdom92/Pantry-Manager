import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShoppingStateService } from '@core/services/shopping/shopping-state.service';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-shopping',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    RouterLink,
    TranslateModule,
    EmptyStateComponent,
  ],
  templateUrl: './shopping.component.html',
  styleUrls: ['./shopping.component.scss'],
  providers: [ShoppingStateService],
})
export class ShoppingComponent {
  readonly facade = inject(ShoppingStateService);

  async ionViewWillEnter(): Promise<void> {
    await this.facade.ionViewWillEnter();
  }
}
