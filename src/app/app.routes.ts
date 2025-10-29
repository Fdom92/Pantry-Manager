import { Routes } from '@angular/router';
import { TabsComponent } from './tabs/tabs.component';

export const routes: Routes = [
  {
    path: '',
    component: TabsComponent,
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('@features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'pantry',
        loadComponent: () =>
          import('@features/pantry/pantry-list/pantry-list.component').then(m => m.PantryListComponent),
      },
      {
        path: 'shopping',
        loadComponent: () =>
          import('@features/shopping/shopping.component').then(m => m.ShoppingComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('@features/settings/settings.component').then(m => m.SettingsComponent),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
