import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

interface StatTile {
  readonly label: string;
  readonly value: string;
  readonly icon: string;
}

@Component({
  selector: 'app-dashboard',
  imports: [ButtonModule, CardModule],
  templateUrl: './dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  protected readonly stats: readonly StatTile[] = [
    { label: 'Despachos hoy', value: '18', icon: 'pi pi-box' },
    { label: 'En ruta', value: '7', icon: 'pi pi-truck' },
    { label: 'Clientes activos', value: '142', icon: 'pi pi-users' },
    { label: 'Ventas del día', value: 'L 48,250', icon: 'pi pi-dollar' },
  ];
}
