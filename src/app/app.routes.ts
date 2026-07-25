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
      {
        path: 'despacho',
        loadComponent: () =>
          import(
            './features/dispatches/pages/dispatch-list/dispatch-list'
          ).then((m) => m.DispatchList),
        data: { title: 'Despacho' },
      },
      {
        path: 'despacho/nuevo',
        loadComponent: () =>
          import(
            './features/dispatches/pages/dispatch-form/dispatch-form'
          ).then((m) => m.DispatchForm),
        data: { title: 'Nuevo despacho' },
      },
      {
        path: 'retorno',
        loadComponent: () =>
          import('./features/returns/pages/return-list/return-list').then(
            (m) => m.ReturnList,
          ),
        data: { title: 'Retorno' },
      },
      {
        path: 'retorno/nuevo',
        loadComponent: () =>
          import('./features/returns/pages/return-form/return-form').then(
            (m) => m.ReturnForm,
          ),
        data: { title: 'Nuevo retorno' },
      },
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
        path: 'inventario',
        loadComponent: () =>
          import(
            './features/inventory/pages/inventory-list/inventory-list'
          ).then((m) => m.InventoryList),
        data: { title: 'Inventario' },
      },
      {
        path: 'caja',
        loadComponent: () =>
          import('./features/cash/pages/cash-register/cash-register').then(
            (m) => m.CashRegister,
          ),
        data: { title: 'Caja' },
      },
      {
        path: 'contabilidad',
        loadComponent: () =>
          import(
            './features/accounts-receivable/pages/accounts-receivable/accounts-receivable'
          ).then((m) => m.AccountsReceivable),
        data: { title: 'Contabilidad' },
      },
      {
        path: 'contabilidad/clientes/:clientId',
        loadComponent: () =>
          import(
            './features/accounts-receivable/pages/client-statement/client-statement'
          ).then((m) => m.ClientAccountStatement),
        data: { title: 'Estado de cuenta' },
      },
      // The form routes are declared BEFORE the tabbed shell: `empleados` has
      // children, so leaving them after would rely on the router backtracking
      // out of a parent that matched but had no matching child.
      {
        path: 'empleados/nuevo',
        loadComponent: () =>
          import('./features/employees/pages/employee-form/employee-form').then(
            (m) => m.EmployeeForm,
          ),
        data: { title: 'Nuevo empleado' },
      },
      {
        path: 'empleados/:id/editar',
        loadComponent: () =>
          import('./features/employees/pages/employee-form/employee-form').then(
            (m) => m.EmployeeForm,
          ),
        data: { title: 'Editar empleado' },
      },
      {
        path: 'empleados',
        data: { title: 'Empleados' },
        children: [
          { path: '', redirectTo: 'lista', pathMatch: 'full' },
          {
            path: 'lista',
            loadComponent: () =>
              import(
                './features/employees/pages/employee-list/employee-list'
              ).then((m) => m.EmployeeList),
            data: { title: 'Empleados' },
          },
          {
            path: 'puestos',
            loadComponent: () =>
              import(
                './features/employees/pages/job-position-list/job-position-list'
              ).then((m) => m.JobPositionList),
            data: { title: 'Empleados' },
          },
        ],
      },
      {
        path: 'reportes',
        data: { title: 'Reportes' },
        children: [
          { path: '', redirectTo: 'ventas', pathMatch: 'full' },
          {
            path: 'ventas',
            loadComponent: () =>
              import(
                './features/reports/pages/sales-report/sales-report'
              ).then((m) => m.SalesReport),
            data: { title: 'Reportes' },
          },
          {
            path: 'caja',
            loadComponent: () =>
              import('./features/reports/pages/cash-report/cash-report').then(
                (m) => m.CashReport,
              ),
            data: { title: 'Reportes' },
          },
          {
            path: 'inventario',
            loadComponent: () =>
              import(
                './features/reports/pages/inventory-report/inventory-report'
              ).then((m) => m.InventoryReport),
            data: { title: 'Reportes' },
          },
        ],
      },
      {
        path: 'catalogos',
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
      {
        path: 'usuarios/nuevo',
        loadComponent: () =>
          import('./features/users/pages/user-form/user-form').then(
            (m) => m.UserForm,
          ),
        data: { title: 'Nuevo usuario' },
      },
      {
        path: 'usuarios/:id/editar',
        loadComponent: () =>
          import('./features/users/pages/user-edit/user-edit').then(
            (m) => m.UserEdit,
          ),
        data: { title: 'Editar usuario' },
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
