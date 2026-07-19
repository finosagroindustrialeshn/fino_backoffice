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
import type { ProductPresentation } from '../../models/product-presentation.model';
import { ProductPresentationDataClient } from '../../services/product-presentation-data';

@Component({
  selector: 'app-product-presentation-list',
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
  templateUrl: './product-presentation-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPresentationList {
  private readonly data = inject(ProductPresentationDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly includeInactive = signal(false);

  protected readonly list = new LazyList<ProductPresentation>(
    (page, pageSize) =>
      this.data.list({
        page,
        pageSize,
        includeInactive: this.includeInactive(),
      }),
    'No se pudieron cargar las presentaciones.',
  );

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly dialogVisible = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required]),
    description: this.fb.control(''),
    sortOrder: this.fb.control(0, [Validators.required]),
  });

  protected canDelete(): boolean {
    return this.auth.role() === 'ADMIN';
  }

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
  }

  protected onIncludeInactiveChange(includeInactive: boolean): void {
    this.includeInactive.set(includeInactive);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
    this.table().reset();
  }

  protected async toggleActive(item: ProductPresentation): Promise<void> {
    this.startPending(item.id);
    this.clearRowError(item.id);
    try {
      await firstValueFrom(
        item.isActive
          ? this.data.deactivate(item.id)
          : this.data.activate(item.id),
      );
      this.list.reload();
    } catch (error) {
      this.setRowError(
        item.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(item.id);
    }
  }

  protected confirmDelete(item: ProductPresentation): void {
    this.confirm.confirm({
      header: 'Eliminar presentación',
      message: `¿Eliminar esta presentación? "${item.name}" se borrará de forma permanente.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        void this.remove(item);
      },
    });
  }

  private async remove(item: ProductPresentation): Promise<void> {
    this.startPending(item.id);
    this.clearRowError(item.id);
    try {
      await firstValueFrom(this.data.remove(item.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        item.id,
        this.toMessage(error, 'No se pudo eliminar la presentación.'),
      );
    } finally {
      this.stopPending(item.id);
    }
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({ name: '', description: '', sortOrder: 0 });
    this.dialogVisible.set(true);
  }

  protected openEdit(item: ProductPresentation): void {
    this.editingId.set(item.id);
    this.formError.set(null);
    this.form.reset({
      name: item.name,
      description: item.description ?? '',
      sortOrder: item.sortOrder,
    });
    this.dialogVisible.set(true);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.formError.set(null);

    const { name, description, sortOrder } = this.form.getRawValue();
    const payload = { name, description, sortOrder };
    const id = this.editingId();

    try {
      if (id) {
        await firstValueFrom(this.data.update(id, payload));
      } else {
        await firstValueFrom(this.data.create(payload));
      }
      this.dialogVisible.set(false);
      this.list.reload();
    } catch (error) {
      this.formError.set(
        this.toMessage(error, 'No se pudo guardar la presentación.'),
      );
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
