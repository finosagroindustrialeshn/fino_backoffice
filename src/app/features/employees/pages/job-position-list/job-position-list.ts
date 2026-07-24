import {
  ChangeDetectionStrategy,
  Component,
  computed,
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

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import type { JobPosition } from '../../models/job-position.model';
import { JobPositionDataClient } from '../../services/job-position-data';

@Component({
  selector: 'app-job-position-list',
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
  providers: [ConfirmationService],
  templateUrl: './job-position-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobPositionList {
  private readonly positions = inject(JobPositionDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirmation = inject(ConfirmationService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly table = viewChild.required<Table>('dt');

  /** Job position writes are ADMIN-only per the API contract. */
  protected readonly canManage = computed(() => this.auth.role() === 'ADMIN');

  protected readonly includeInactive = signal(false);

  protected readonly list = new LazyList<JobPosition>(
    (page, pageSize) =>
      this.positions.list({
        page,
        pageSize,
        includeInactive: this.includeInactive(),
      }),
    'No se pudieron cargar los puestos.',
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

  protected openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', description: '', sortOrder: 0 });
    this.dialogOpen.set(true);
  }

  protected openEdit(position: JobPosition): void {
    this.editingId.set(position.id);
    this.formError.set(null);
    this.form.reset({
      name: position.name,
      description: position.description ?? '',
      sortOrder: position.sortOrder,
    });
    this.dialogOpen.set(true);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    const dto = this.form.getRawValue();
    const id = this.editingId();
    try {
      await firstValueFrom(
        id ? this.positions.update(id, dto) : this.positions.create(dto),
      );
      this.dialogOpen.set(false);
      this.list.reload();
    } catch (error) {
      this.formError.set(this.toMessage(error, 'No se pudo guardar el puesto.'));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async toggleActive(position: JobPosition): Promise<void> {
    this.startPending(position.id);
    this.clearRowError(position.id);
    try {
      await firstValueFrom(
        position.isActive
          ? this.positions.deactivate(position.id)
          : this.positions.activate(position.id),
      );
      this.list.reload();
    } catch (error) {
      this.setRowError(
        position.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(position.id);
    }
  }

  protected confirmRemove(position: JobPosition): void {
    this.confirmation.confirm({
      header: 'Eliminar puesto',
      message: `¿Eliminar el puesto "${position.name}"? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => void this.remove(position),
    });
  }

  private async remove(position: JobPosition): Promise<void> {
    this.startPending(position.id);
    this.clearRowError(position.id);
    try {
      await firstValueFrom(this.positions.remove(position.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        position.id,
        this.toMessage(error, 'No se pudo eliminar el puesto.'),
      );
    } finally {
      this.stopPending(position.id);
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
