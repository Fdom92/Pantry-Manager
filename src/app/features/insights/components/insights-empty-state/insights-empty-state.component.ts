import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-insights-empty-state',
  standalone: true,
  imports: [RouterLink, IonButton, IonIcon, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './insights-empty-state.component.html',
  styleUrl: './insights-empty-state.component.scss',
})
export class InsightsEmptyStateComponent {}
