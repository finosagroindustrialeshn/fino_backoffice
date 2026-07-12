import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { ConfirmationService } from 'primeng/api';

import { AuthSession } from '../../../../../core/auth/auth-session';
import { ProductCategoryDataClient } from '../../services/product-category-data';
import type { ProductCategory } from '../../models/product-category.model';

type CategoriesState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly categories: ProductCategory[] }
  | { readonly status: 'error'; readonly message: string };

@Component({
  selector: 'app-product-category-list',
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
  templateUrl: './product-category-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCategoryList implements OnInit {
  private readonly categories = inject(ProductCategoryDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirmation = inject(ConfirmationService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly canDelete = computed(() => this.auth.role() === 'ADMIN');

  protected readonly includeInactive = signal(false);
  protected readonly state = signal<CategoriesState>({ status: 'idle' });

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly dialogOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    code: this.fb.control('', [Validators.required]),
    name: this.fb.control('', [Validators.required]),
    description: this.fb.control(''),
    sortOrder: this.fb.control(0, [Validators.required]),
  });

  ngOnInit(): void {
    void this.load();
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
      const categories = await firstValueFrom(
        this.categories.list(this.includeInactive()),
      );
      this.state.set({ status: 'success', categories });
    } catch (error) {
      this.state.set({
        status: 'error',
        message: this.toMessage(error, 'No se pudieron cargar las categorías.'),
      });
    }
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.form.reset({ code: '', name: '', description: '', sortOrder: 0 });
    this.dialogOpen.set(true);
  }

  protected openEdit(category: ProductCategory): void {
    this.editingId.set(category.id);
    this.formError.set(null);
    this.form.reset({
      code: category.code,
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

    const dto = this.form.getRawValue();
    const id = this.editingId();
    try {
      const saved = await firstValueFrom(
        id ? this.categories.update(id, dto) : this.categories.create(dto),
      );
      if (id) {
        this.patchRow(saved);
      } else {
        this.appendRow(saved);
      }
      this.dialogOpen.set(false);
    } catch (error) {
      this.formError.set(
        this.toMessage(error, 'No se pudo guardar la categoría.'),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  protected async toggleActive(category: ProductCategory): Promise<void> {
    this.startPending(category.id);
    this.clearRowError(category.id);
    try {
      const updated = await firstValueFrom(
        category.isActive
          ? this.categories.deactivate(category.id)
          : this.categories.activate(category.id),
      );
      this.patchRow(updated);
    } catch (error) {
      this.setRowError(
        category.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(category.id);
    }
  }

  protected confirmRemove(category: ProductCategory): void {
    this.confirmation.confirm({
      header: 'Eliminar categoría',
      message: `¿Eliminar la categoría "${category.name}"? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => void this.remove(category),
    });
  }

  private async remove(category: ProductCategory): Promise<void> {
    this.startPending(category.id);
    this.clearRowError(category.id);
    try {
      await firstValueFrom(this.categories.remove(category.id));
      this.removeRow(category.id);
    } catch (error) {
      this.setRowError(
        category.id,
        this.toMessage(error, 'No se pudo eliminar la categoría.'),
      );
    } finally {
      this.stopPending(category.id);
    }
  }

  private patchRow(updated: ProductCategory): void {
    this.state.update((current) => {
      if (current.status !== 'success') {
        return current;
      }
      return {
        status: 'success',
        categories: current.categories.map((category) =>
          category.id === updated.id ? updated : category,
        ),
      };
    });
  }

  private appendRow(created: ProductCategory): void {
    this.state.update((current) => {
      if (current.status !== 'success') {
        return current;
      }
      return { status: 'success', categories: [...current.categories, created] };
    });
  }

  private removeRow(id: string): void {
    this.state.update((current) => {
      if (current.status !== 'success') {
        return current;
      }
      return {
        status: 'success',
        categories: current.categories.filter((category) => category.id !== id),
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
