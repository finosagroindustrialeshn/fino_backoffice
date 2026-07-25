import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { AuthSession } from '../../../../../core/auth/auth-session';
import { LazyList } from '../../../../../core/http/lazy-list';
import type { ReturnReason } from '../../models/return-reason.model';
import { ReturnReasonDataClient } from '../../services/return-reason-data';

@Component({
  selector: 'app-return-reason-list',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    TableModule,
    TagModule,
    TextareaModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './return-reason-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnReasonList {
  private readonly reasons = inject(ReturnReasonDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly role = this.auth.role;

  protected readonly includeInactive = signal(false);

  protected readonly list = new LazyList<ReturnReason>(
    (page, pageSize) =>
      this.reasons.list({
        page,
        pageSize,
        includeInactive: this.includeInactive(),
      }),
    'No se pudieron cargar los motivos de retorno.',
  );

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly dialogOpen = signal(false);
  protected readonly editing = signal<ReturnReason | null>(null);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required]),
    description: this.fb.control(''),
    sortOrder: this.fb.control(0, [Validators.required]),
  });

  protected canDelete(): boolean {
    return this.role() === 'ADMIN';
  }

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
    this.editing.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', description: '', sortOrder: 0 });
    this.dialogOpen.set(true);
  }

  protected openEdit(reason: ReturnReason): void {
    this.editing.set(reason);
    this.formError.set(null);
    this.form.reset({
      name: reason.name,
      description: reason.description ?? '',
      sortOrder: reason.sortOrder,
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

    const { name, description, sortOrder } = this.form.getRawValue();
    const dto = { name, description, sortOrder };
    const target = this.editing();

    try {
      await firstValueFrom(
        target ? this.reasons.update(target.id, dto) : this.reasons.create(dto),
      );
      this.dialogOpen.set(false);
      this.list.reload();
    } catch (error) {
      this.formError.set(
        this.toMessage(error, 'No se pudo guardar el motivo de retorno.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected async toggleActive(reason: ReturnReason): Promise<void> {
    this.startPending(reason.id);
    this.clearRowError(reason.id);
    try {
      await firstValueFrom(
        reason.isActive
          ? this.reasons.deactivate(reason.id)
          : this.reasons.activate(reason.id),
      );
      this.list.reload();
    } catch (error) {
      this.setRowError(
        reason.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(reason.id);
    }
  }

  protected confirmDelete(reason: ReturnReason): void {
    this.confirm.confirm({
      header: '¿Eliminar este motivo?',
      message: `Se eliminará "${reason.name}". Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => void this.remove(reason),
    });
  }

  private async remove(reason: ReturnReason): Promise<void> {
    this.startPending(reason.id);
    this.clearRowError(reason.id);
    try {
      await firstValueFrom(this.reasons.remove(reason.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        reason.id,
        this.toMessage(error, 'No se pudo eliminar el motivo.'),
      );
    } finally {
      this.stopPending(reason.id);
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
