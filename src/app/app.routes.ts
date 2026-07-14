import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
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
    canActivate: [authGuard],
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
      {
        path: 'mapa',
        loadComponent: placeholder,
        data: { title: 'Mapa de rutas' },
      },
      {
        path: 'clientes',
        loadComponent: () =>
          import('./features/clients/pages/client-list/client-list').then(
            (m) => m.ClientList,
          ),
        data: { title: 'Clientes' },
      },
      {
        path: 'clientes/nuevo',
        loadComponent: () =>
          import('./features/clients/pages/client-form/client-form').then(
            (m) => m.ClientForm,
          ),
        data: { title: 'Nuevo cliente' },
      },
      {
        path: 'clientes/:id/editar',
        loadComponent: () =>
          import('./features/clients/pages/client-form/client-form').then(
            (m) => m.ClientForm,
          ),
        data: { title: 'Editar cliente' },
      },
      {
        path: 'productos',
        loadComponent: () =>
          import('./features/products/pages/product-list/product-list').then(
            (m) => m.ProductList,
          ),
        data: { title: 'Productos' },
      },
      {
        path: 'productos/nuevo',
        loadComponent: () =>
          import('./features/products/pages/product-form/product-form').then(
            (m) => m.ProductForm,
          ),
        data: { title: 'Nuevo producto' },
      },
      {
        path: 'productos/:id/editar',
        loadComponent: () =>
          import('./features/products/pages/product-form/product-form').then(
            (m) => m.ProductForm,
          ),
        data: { title: 'Editar producto' },
      },
      {
        path: 'contabilidad',
        loadComponent: placeholder,
        data: { title: 'Contabilidad' },
      },
      {
        path: 'catalogos',
        loadComponent: () =>
          import('./features/catalogs/pages/catalogos/catalogos').then(
            (m) => m.CatalogosShell,
          ),
        data: { title: 'Catálogos' },
        children: [
          { path: '', redirectTo: 'categorias-producto', pathMatch: 'full' },
          {
            path: 'categorias-producto',
            loadComponent: () =>
              import(
                './features/catalogs/product-categories/pages/product-category-list/product-category-list'
              ).then((m) => m.ProductCategoryList),
            data: { title: 'Catálogos' },
          },
          {
            path: 'presentaciones',
            loadComponent: () =>
              import(
                './features/catalogs/product-presentations/pages/product-presentation-list/product-presentation-list'
              ).then((m) => m.ProductPresentationList),
            data: { title: 'Catálogos' },
          },
          {
            path: 'zonas',
            loadComponent: () =>
              import(
                './features/catalogs/zones/pages/zone-list/zone-list'
              ).then((m) => m.ZoneList),
            data: { title: 'Catálogos' },
          },
          {
            path: 'categorias-gasto',
            loadComponent: () =>
              import(
                './features/catalogs/expense-categories/pages/expense-category-list/expense-category-list'
              ).then((m) => m.ExpenseCategoryList),
            data: { title: 'Catálogos' },
          },
          {
            path: 'motivos-retorno',
            loadComponent: () =>
              import(
                './features/catalogs/return-reasons/pages/return-reason-list/return-reason-list'
              ).then((m) => m.ReturnReasonList),
            data: { title: 'Catálogos' },
          },
        ],
      },
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./features/users/pages/user-list/user-list').then(
            (m) => m.UserList,
          ),
        data: { title: 'Usuarios y roles' },
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
