import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { AuthSession } from '../../../../../core/auth/auth-session';
import { LazyList } from '../../../../../core/http/lazy-list';
import type { Zone, ZonePayload } from '../../models/zone.model';
import { ZoneDataClient } from '../../services/zone-data';

@Component({
  selector: 'app-zone-list',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    TableModule,
    TagModule,
    TextareaModule,
  ],
  templateUrl: './zone-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
})
export class ZoneList {
  private readonly zones = inject(ZoneDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirmation = inject(ConfirmationService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly canDelete = this.auth.role;

  protected readonly includeInactive = signal(false);

  protected readonly list = new LazyList<Zone>(
    (page, pageSize) =>
      this.zones.list({
        page,
        pageSize,
        includeInactive: this.includeInactive(),
      }),
    'No se pudieron cargar las zonas.',
  );

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly dialogOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required]),
    description: this.fb.control(''),
    sortOrder: this.fb.control(0, [Validators.required]),
  });

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
  }

  protected onIncludeInactiveChange(includeInactive: boolean): void {
    this.includeInactive.set(includeInactive);
    this.table().reset();
  }

  protected async toggleActive(zone: Zone): Promise<void> {
    this.startPending(zone.id);
    this.clearRowError(zone.id);
    try {
      await firstValueFrom(
        zone.isActive
          ? this.zones.deactivate(zone.id)
          : this.zones.activate(zone.id),
      );
      this.list.reload();
    } catch (error) {
      this.setRowError(
        zone.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(zone.id);
    }
  }

  protected confirmDelete(zone: Zone): void {
    this.confirmation.confirm({
      header: 'Eliminar zona',
      message: `¿Eliminar esta zona? "${zone.name}" se borrará de forma permanente.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        void this.remove(zone);
      },
    });
  }

  private async remove(zone: Zone): Promise<void> {
    this.startPending(zone.id);
    this.clearRowError(zone.id);
    try {
      await firstValueFrom(this.zones.remove(zone.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        zone.id,
        this.toMessage(error, 'No se pudo eliminar la zona.'),
      );
    } finally {
      this.stopPending(zone.id);
    }
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', description: '', sortOrder: 0 });
    this.dialogOpen.set(true);
  }

  protected openEdit(zone: Zone): void {
    this.editingId.set(zone.id);
    this.formError.set(null);
    this.form.reset({
      name: zone.name,
      description: zone.description ?? '',
      sortOrder: zone.sortOrder,
    });
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    const raw = this.form.getRawValue();
    const payload: ZonePayload = {
      name: raw.name.trim(),
      description: raw.description.trim(),
      sortOrder: raw.sortOrder,
    };
    const id = this.editingId();

    try {
      if (id) {
        await firstValueFrom(this.zones.update(id, payload));
      } else {
        await firstValueFrom(this.zones.create(payload));
      }
      this.dialogOpen.set(false);
      this.list.reload();
    } catch (error) {
      this.formError.set(this.toMessage(error, 'No se pudo guardar la zona.'));
    } finally {
      this.submitting.set(false);
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
