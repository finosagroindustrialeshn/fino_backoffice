import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
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
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { AuthSession } from '../../../../../core/auth/auth-session';
import type { ReturnReason } from '../../models/return-reason.model';
import { ReturnReasonDataClient } from '../../services/return-reason-data';

type ReturnReasonsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly reasons: ReturnReason[] }
  | { readonly status: 'error'; readonly message: string };

@Component({
  selector: 'app-return-reason-list',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TextareaModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './return-reason-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnReasonList implements OnInit {
  private readonly reasons = inject(ReturnReasonDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly role = this.auth.role;
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly includeInactive = signal(false);
  protected readonly state = signal<ReturnReasonsState>({ status: 'idle' });

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

  ngOnInit(): void {
    void this.load();
  }

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
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      const reasons = await firstValueFrom(
        this.reasons.list(this.includeInactive()),
      );
      this.state.set({ status: 'success', reasons });
    } catch (error) {
      this.state.set({
        status: 'error',
        message: this.toMessage(
          error,
          'No se pudieron cargar los motivos de retorno.',
        ),
      });
    }
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
      const saved = await firstValueFrom(
        target
          ? this.reasons.update(target.id, dto)
          : this.reasons.create(dto),
      );
      if (target) {
        this.patchRow(saved);
      } else {
        this.appendRow(saved);
      }
      this.dialogOpen.set(false);
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
      const updated = await firstValueFrom(
        reason.isActive
          ? this.reasons.deactivate(reason.id)
          : this.reasons.activate(reason.id),
      );
      this.patchRow(updated);
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
      this.removeRow(reason.id);
    } catch (error) {
      this.setRowError(
        reason.id,
        this.toMessage(error, 'No se pudo eliminar el motivo.'),
      );
    } finally {
      this.stopPending(reason.id);
    }
  }

  private patchRow(updated: ReturnReason): void {
    this.state.update((current) => {
      if (current.status !== 'success') {
        return current;
      }
      return {
        status: 'success',
        reasons: current.reasons.map((reason) =>
          reason.id === updated.id ? updated : reason,
        ),
      };
    });
  }

  private appendRow(created: ReturnReason): void {
    this.state.update((current) => {
      if (current.status !== 'success') {
        return current;
      }
      return { status: 'success', reasons: [...current.reasons, created] };
    });
  }

  private removeRow(id: string): void {
    this.state.update((current) => {
      if (current.status !== 'success') {
        return current;
      }
      return {
        status: 'success',
        reasons: current.reasons.filter((reason) => reason.id !== id),
      };
    });
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
