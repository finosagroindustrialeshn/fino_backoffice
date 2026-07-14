import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { ProductCategoryDataClient } from '../../../catalogs/product-categories/services/product-category-data';
import type { Product } from '../../models/product.model';
import { ProductDataClient } from '../../services/product-data';

type ProductsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly products: Product[] }
  | { readonly status: 'error'; readonly message: string };

@Component({
  selector: 'app-product-list',
  imports: [
    DecimalPipe,
    RouterLink,
    ButtonModule,
    ConfirmDialogModule,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './product-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
})
export class ProductList implements OnInit {
  private readonly products = inject(ProductDataClient);
  private readonly categories = inject(ProductCategoryDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly canManage = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR';
  });
  protected readonly canDelete = computed(() => this.auth.role() === 'ADMIN');

  protected readonly state = signal<ProductsState>({ status: 'idle' });
  private readonly categoryNames = signal<ReadonlyMap<string, string>>(new Map());

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  ngOnInit(): void {
    void this.load();
  }

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
  }

  protected categoryName(id: string | null): string {
    if (!id) {
      return '—';
    }
    return this.categoryNames().get(id) ?? '—';
  }

  protected async load(): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      const [products, categories] = await Promise.all([
        firstValueFrom(this.products.list()),
        firstValueFrom(this.categories.list(true)),
      ]);
      this.categoryNames.set(
        new Map(categories.map((category) => [category.id, category.name])),
      );
      this.state.set({ status: 'success', products });
    } catch (error) {
      this.state.set({
        status: 'error',
        message: this.toMessage(error, 'No se pudieron cargar los productos.'),
      });
    }
  }

  protected async toggleActive(product: Product): Promise<void> {
    this.startPending(product.id);
    this.clearRowError(product.id);
    try {
      const updated = await firstValueFrom(
        this.products.setActive(product.id, !product.isActive),
      );
      this.patchRow(updated);
    } catch (error) {
      this.setRowError(
        product.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(product.id);
    }
  }

  protected confirmDelete(product: Product): void {
    this.confirmation.confirm({
      header: 'Eliminar producto',
      message: `¿Eliminar este producto? "${product.name}" se borrará de forma permanente.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        void this.remove(product);
      },
    });
  }

  private async remove(product: Product): Promise<void> {
    this.startPending(product.id);
    this.clearRowError(product.id);
    try {
      await firstValueFrom(this.products.remove(product.id));
      this.removeRow(product.id);
    } catch (error) {
      this.setRowError(
        product.id,
        this.toMessage(error, 'No se pudo eliminar el producto.'),
      );
    } finally {
      this.stopPending(product.id);
    }
  }

  private patchRow(updated: Product): void {
    this.state.update((current) => {
      if (current.status !== 'success') {
        return current;
      }
      return {
        status: 'success',
        products: current.products.map((product) =>
          product.id === updated.id ? updated : product,
        ),
      };
    });
  }

  private removeRow(id: string): void {
    this.state.update((current) => {
      if (current.status !== 'success') {
        return current;
      }
      return {
        status: 'success',
        products: current.products.filter((product) => product.id !== id),
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
