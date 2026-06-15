import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IonCard, IonCardContent, IonSkeletonText } from '@ionic/angular/standalone';

@Component({
  selector: 'app-settings-skeleton',
  standalone: true,
  imports: [IonCard, IonCardContent, IonSkeletonText],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-skeleton.component.html',
  styleUrl: './settings-skeleton.component.scss',
})
export class SettingsSkeletonComponent {}
