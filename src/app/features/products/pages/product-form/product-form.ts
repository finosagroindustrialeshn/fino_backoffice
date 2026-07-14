import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import { ImageDropzone } from '../../../../shared/components/image-dropzone/image-dropzone';
import type { ProductCategory } from '../../../catalogs/product-categories/models/product-category.model';
import { ProductCategoryDataClient } from '../../../catalogs/product-categories/services/product-category-data';
import type { ProductPresentation } from '../../../catalogs/product-presentations/models/product-presentation.model';
import { ProductPresentationDataClient } from '../../../catalogs/product-presentations/services/product-presentation-data';
import type { Product, ProductPayload } from '../../models/product.model';
import { ProductDataClient } from '../../services/product-data';
import { ProductImageStorage } from '../../services/product-image-storage';

@Component({
  selector: 'app-product-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    ImageDropzone,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    SkeletonModule,
    TextareaModule,
  ],
  templateUrl: './product-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductForm implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly products = inject(ProductDataClient);
  private readonly storage = inject(ProductImageStorage);
  private readonly categories = inject(ProductCategoryDataClient);
  private readonly presentations = inject(ProductPresentationDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly productId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.productId() !== null);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly categoryOptions = signal<ProductCategory[]>([]);
  protected readonly presentationOptions = signal<ProductPresentation[]>([]);

  private readonly selectedFile = signal<File | null>(null);
  private readonly directUrl = signal<string | null>(null);
  private readonly imageCleared = signal(false);
  protected readonly existingImageUrl = signal<string | null>(null);

  protected readonly validateImage = (file: File): string | null =>
    this.storage.validate(file);

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required]),
    sku: this.fb.control('', [Validators.required]),
    categoryId: this.fb.control('', [Validators.required]),
    presentationId: this.fb.control('', [Validators.required]),
    cost: this.fb.control(0, [Validators.required, Validators.min(0)]),
    price: this.fb.control(0, [Validators.required, Validators.min(0)]),
    description: this.fb.control(''),
  });

  ngOnInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [categories, presentations] = await Promise.all([
        firstValueFrom(this.categories.list(true)),
        firstValueFrom(this.presentations.list(true)),
      ]);
      this.categoryOptions.set(categories);
      this.presentationOptions.set(presentations);

      const id = this.route.snapshot.paramMap.get('id');
      if (id) {
        this.productId.set(id);
        const product = await firstValueFrom(this.products.get(id));
        this.fill(product);
      }
    } catch (error) {
      this.loadError.set(
        this.toMessage(error, 'No se pudo cargar el formulario.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  private fill(product: Product): void {
    this.form.reset({
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId ?? '',
      presentationId: product.presentationId ?? '',
      cost: product.cost,
      price: product.price,
      description: product.description ?? '',
    });
    this.selectedFile.set(null);
    this.directUrl.set(null);
    this.imageCleared.set(false);
    this.existingImageUrl.set(product.imageUrl);
  }

  protected onImageSelected(file: File): void {
    this.formError.set(null);
    this.selectedFile.set(file);
    this.directUrl.set(null);
    this.imageCleared.set(false);
  }

  protected onImageUrl(url: string): void {
    this.formError.set(null);
    this.directUrl.set(url);
    this.selectedFile.set(null);
    this.imageCleared.set(false);
  }

  protected onImageCleared(): void {
    this.selectedFile.set(null);
    this.directUrl.set(null);
    this.imageCleared.set(true);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    try {
      const file = this.selectedFile();
      let imageUrl: string | null;
      if (file) {
        imageUrl = await this.storage.upload(file);
      } else if (this.directUrl()) {
        imageUrl = this.directUrl();
      } else if (this.imageCleared()) {
        imageUrl = null;
      } else {
        imageUrl = this.existingImageUrl();
      }

      const raw = this.form.getRawValue();
      const base = {
        name: raw.name.trim(),
        sku: raw.sku.trim(),
        categoryId: raw.categoryId,
        presentationId: raw.presentationId,
        cost: raw.cost,
        price: raw.price,
        description: this.emptyToNull(raw.description),
        imageUrl,
      };

      const id = this.productId();
      if (id) {
        // Partial PATCH — isActive is owned by the list's activate toggle.
        await firstValueFrom(this.products.update(id, base));
      } else {
        const payload: ProductPayload = { ...base, isActive: true };
        await firstValueFrom(this.products.create(payload));
      }
      await this.router.navigate(['/productos']);
    } catch (error) {
      this.formError.set(
        this.toMessage(error, 'No se pudo guardar el producto.'),
      );
    } finally {
      this.saving.set(false);
    }
  }

  private emptyToNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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
