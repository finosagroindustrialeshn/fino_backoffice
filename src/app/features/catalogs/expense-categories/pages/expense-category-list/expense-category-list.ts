import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService } from 'primeng/api';

import { AuthSession } from '../../../../../core/auth/auth-session';
import { LazyList } from '../../../../../core/http/lazy-list';
import { ExpenseCategoryDataClient } from '../../services/expense-category-data';
import type { ExpenseCategory } from '../../models/expense-category.model';

@Component({
  selector: 'app-expense-category-list',
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
  templateUrl: './expense-category-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseCategoryList {
  private readonly categories = inject(ExpenseCategoryDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly canDelete = computed(() => this.auth.role() === 'ADMIN');

  protected readonly includeInactive = signal(false);

  protected readonly list = new LazyList<ExpenseCategory>(
    (page, pageSize) =>
      this.categories.list({
        page,
        pageSize,
        includeInactive: this.includeInactive(),
      }),
    'No se pudieron cargar las categorías de gasto.',
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

  protected openEdit(category: ExpenseCategory): void {
    this.editingId.set(category.id);
    this.formError.set(null);
    this.form.reset({
      name: category.name,
      description: category.description ?? '',
      sortOrder: category.sortOrder,
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
    const id = this.editingId();

    try {
      await firstValueFrom(
        id ? this.categories.update(id, dto) : this.categories.create(dto),
      );
      this.dialogOpen.set(false);
      this.list.reload();
    } catch (error) {
      this.formError.set(
        this.toMessage(error, 'No se pudo guardar la categoría.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected async toggleActive(category: ExpenseCategory): Promise<void> {
    this.startPending(category.id);
    this.clearRowError(category.id);
    try {
      await firstValueFrom(
        category.isActive
          ? this.categories.deactivate(category.id)
          : this.categories.activate(category.id),
      );
      this.list.reload();
    } catch (error) {
      this.setRowError(
        category.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(category.id);
    }
  }

  protected confirmDelete(category: ExpenseCategory): void {
    this.confirm.confirm({
      header: '¿Eliminar esta categoría?',
      message: `Se eliminará “${category.name}”. Esta acción no se puede deshacer; considerá desactivarla en su lugar.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => void this.remove(category),
    });
  }

  private async remove(category: ExpenseCategory): Promise<void> {
    this.startPending(category.id);
    this.clearRowError(category.id);
    try {
      await firstValueFrom(this.categories.remove(category.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        category.id,
        this.toMessage(error, 'No se pudo eliminar la categoría.'),
      );
    } finally {
      this.stopPending(category.id);
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
