import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import type { Client } from '../../models/client.model';
import { ClientDataClient } from '../../services/client-data';

@Component({
  selector: 'app-client-list',
  imports: [
    RouterLink,
    ButtonModule,
    ConfirmDialogModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './client-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
})
export class ClientList {
  private readonly clients = inject(ClientDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly canDelete = this.auth.role;

  protected readonly list = new LazyList<Client>(
    (page, pageSize) => this.clients.list({ page, pageSize }),
    'No se pudieron cargar los clientes.',
  );

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
  }

  protected async toggleActive(client: Client): Promise<void> {
    this.startPending(client.id);
    this.clearRowError(client.id);
    try {
      await firstValueFrom(
        this.clients.setActive(client.id, !client.isActive),
      );
      this.list.reload();
    } catch (error) {
      this.setRowError(
        client.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(client.id);
    }
  }

  protected confirmDelete(client: Client): void {
    this.confirmation.confirm({
      header: 'Eliminar cliente',
      message: `¿Eliminar este cliente? "${client.name}" se borrará de forma permanente.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        void this.remove(client);
      },
    });
  }

  private async remove(client: Client): Promise<void> {
    this.startPending(client.id);
    this.clearRowError(client.id);
    try {
      await firstValueFrom(this.clients.remove(client.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        client.id,
        this.toMessage(error, 'No se pudo eliminar el cliente.'),
      );
    } finally {
      this.stopPending(client.id);
    }
  }

  private startPending(id: string): void {
    this.pendingIds.update((ids) => new Set(ids).add(id));
  }

  private stopPending(id: string): void {
    this.pendingIds.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  private setRowError(id: string, message: string): void {
    this.rowErrors.update((errors) => ({ ...errors, [id]: message }));
  }

  private clearRowError(id: string): void {
    this.rowErrors.update((errors) => {
      const { [id]: _removed, ...rest } = errors;
      return rest;
    });
  }

  private toMessage(error: unknown, fallback: string): string {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return fallback;
  }
}
