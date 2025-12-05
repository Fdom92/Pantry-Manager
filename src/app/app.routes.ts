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
        path: 'agent',
        loadComponent: () =>
          import('@features/agent/agent.component').then(m => m.AgentComponent),
      },
      {
        path: 'settings/catalogos',
        loadComponent: () =>
          import('@features/settings/settings-catalogs/settings-catalogs.component').then(m => m.SettingsCatalogsComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('@features/settings/settings.component').then(m => m.SettingsComponent),
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('@features/onboarding/onboarding.page').then(m => m.OnboardingPage),
  },
  {
    path: 'upgrade',
    loadComponent: () =>
      import('@features/upgrade/upgrade.page').then(m => m.UpgradePage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
