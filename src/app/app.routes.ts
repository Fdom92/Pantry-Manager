import { Routes } from '@angular/router';
import { TabsComponent } from './features/tabs/tabs.component';

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
          import('@features/pantry/pantry.component').then(m => m.PantryComponent),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('@features/history/history.component').then(m => m.HistoryComponent),
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
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('@features/settings/settings.component').then(m => m.SettingsComponent),
  },
  {
    path: 'settings/ai',
    loadComponent: () =>
      import('@features/settings/components/settings-ai/settings-ai.component').then(m => m.SettingsAiComponent),
  },
  {
    path: 'settings/catalogos',
    loadComponent: () =>
      import('@features/settings/components/settings-catalogs/settings-catalogs.component').then(m => m.SettingsCatalogsComponent),
  },
  {
    path: 'settings/notificaciones',
    loadComponent: () =>
      import('@features/settings/components/settings-notifications/settings-notifications.component').then(m => m.SettingsNotificationsComponent),
  },
  {
    path: 'settings/avanzado',
    loadComponent: () =>
      import('@features/settings/components/settings-advanced/settings-advanced.component').then(m => m.SettingsAdvancedComponent),
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
