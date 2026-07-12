import { Routes } from '@angular/router';
import { MainLayout } from './layouts/main-layout/main-layout';

const placeholder = () =>
  import('./shared/components/placeholder-page/placeholder-page').then(
    (m) => m.PlaceholderPage,
  );

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/pages/login/login').then((m) => m.Login),
    data: { title: 'Iniciar sesión' },
  },
  {
    path: '',
    component: MainLayout,
    // Enable once backend auth is ready: canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard/dashboard').then(
            (m) => m.Dashboard,
          ),
        data: { title: 'Dashboard' },
      },
      { path: 'despacho', loadComponent: placeholder, data: { title: 'Despacho' } },
      { path: 'retorno', loadComponent: placeholder, data: { title: 'Retorno' } },
      { path: 'mapa', loadComponent: placeholder, data: { title: 'Mapa de rutas' } },
      { path: 'clientes', loadComponent: placeholder, data: { title: 'Clientes' } },
      {
        path: 'contabilidad',
        loadComponent: placeholder,
        data: { title: 'Contabilidad' },
      },
      {
        path: 'usuarios',
        loadComponent: placeholder,
        data: { title: 'Usuarios y roles' },
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
