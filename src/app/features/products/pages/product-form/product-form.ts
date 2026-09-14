import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  type FormControl,
  type FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import { fetchAllPages } from '../../../../core/http/fetch-all-pages';
import { FileDropzone } from '../../../../shared/components/file-dropzone/file-dropzone';
import { ImageDropzone } from '../../../../shared/components/image-dropzone/image-dropzone';
import { FileSelection } from '../../../../shared/forms/file-selection';
import type { ProductCategory } from '../../../catalogs/product-categories/models/product-category.model';
import { ProductCategoryDataClient } from '../../../catalogs/product-categories/services/product-category-data';
import type { ProductPresentation } from '../../../catalogs/product-presentations/models/product-presentation.model';
import { ProductPresentationDataClient } from '../../../catalogs/product-presentations/services/product-presentation-data';
import {
  PRODUCT_BOOLEAN_FIELDS,
  PRODUCT_FIELD_LABELS,
  type CompositionItem,
  type Product,
  type ProductChange,
  type ProductPayload,
} from '../../models/product.model';
import { formatDay } from '../../../../shared/utils/date-range';
import { exportToExcel } from '../../../../shared/utils/excel-export';
import { buildProductChangesSheet } from '../../utils/product-changes-export';
import { ProductDataClient } from '../../services/product-data';
import { ProductImageStorage } from '../../services/product-image-storage';
import {
  ProductSheetStorage,
  SHEET_ACCEPT,
} from '../../services/product-sheet-storage';

/** One editable row of the guaranteed-analysis table. */
type CompositionRow = FormGroup<{
  name: FormControl<string>;
  value: FormControl<number>;
  unit: FormControl<string>;
}>;

/** Recent history only — the form is not a full audit browser. */
const CHANGES_PAGE_SIZE = 20;

/** The export walks every page; a bigger page means fewer round trips. */
const EXPORT_PAGE_SIZE = 100;

/** Whole percents only — the API refuses a fractional cap. Empty is fine. */
const wholeNumber: ValidatorFn = (control) => {
  const value: unknown = control.value;
  return value === null || Number.isInteger(value) ? null : { integer: true };
};

/** What the API will enforce for the figures currently in the form. */
interface PriceFloorPreview {
  readonly minPrice: number;
  readonly allowedDiscountPercent: number;
}

/**
 * Binary floats make 100 × 0.8 land a hair above 80, which a bare ceil would
 * push to 80.01 — so the noise is shaved off before rounding either way.
 */
function toCents(value: number): number {
  return Number((value * 100).toFixed(6));
}

/**
 * Mirrors the API's floor: the cost, or the capped price when that is higher,
 * rounded up to the cent and never above the price itself. The allowed
 * percent is then read back off that floor, rounded down to two decimals.
 */
function previewPriceFloor(
  cost: number,
  price: number,
  cap: number | null,
): PriceFloorPreview | null {
  if (!(price > 0)) {
    return null;
  }
  const capped = cap === null ? cost : Math.max(cost, price * (1 - cap / 100));
  const floor = Math.min(Math.ceil(toCents(capped)) / 100, price);
  const allowed = Math.floor(toCents((price - floor) / price * 100)) / 100;
  return { minPrice: floor, allowedDiscountPercent: allowed };
}

@Component({
  selector: 'app-product-form',
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    FileDropzone,
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
  private readonly imageStorage = inject(ProductImageStorage);
  private readonly sheetStorage = inject(ProductSheetStorage);
  private readonly categories = inject(ProductCategoryDataClient);
  private readonly presentations = inject(ProductPresentationDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly productId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.productId() !== null);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  /**
   * Edit history, loaded only when editing and best-effort: the product form
   * has to work whether or not the log can be read.
   */
  protected readonly changes = signal<readonly ProductChange[]>([]);
  protected readonly changesLoading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);
  /** Set when the export hit the row ceiling and the file is incomplete. */
  protected readonly exportTruncated = signal(false);

  protected readonly categoryOptions = signal<ProductCategory[]>([]);
  protected readonly presentationOptions = signal<ProductPresentation[]>([]);

  /** Photo and technical sheet each track their own pick/paste/clear state. */
  protected readonly image = new FileSelection();
  protected readonly sheet = new FileSelection();

  protected readonly sheetAccept = SHEET_ACCEPT;

  protected readonly validateImage = (file: File): string | null =>
    this.imageStorage.validate(file);

  protected readonly validateSheet = (file: File): string | null =>
    this.sheetStorage.validate(file);

  protected readonly composition = this.fb.array<CompositionRow>([]);

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required]),
    sku: this.fb.control('', [Validators.required]),
    categoryId: this.fb.control('', [Validators.required]),
    presentationId: this.fb.control('', [Validators.required]),
    cost: this.fb.control(0, [Validators.required, Validators.min(0)]),
    price: this.fb.control(0, [Validators.required, Validators.min(0)]),
    // Null = no percentage cap; the floor is then the cost.
    maxDiscountPercent: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(100),
      wholeNumber,
    ]),
    description: this.fb.control(''),
    // Informational only — prices stay ISV-inclusive whatever this says.
    isvExempt: this.fb.control(false),
    composition: this.composition,
  });

  /**
   * Subscribed so the floor preview recomputes as the user types; a computed
   * over getRawValue() alone never re-runs. The values are read from
   * getRawValue() because valueChanges emits a partial shape.
   */
  private readonly formChanges = toSignal(this.form.valueChanges);

  /**
   * Live view of the floor the API will enforce once saved, so the cap can be
   * tuned against the cost and price on screen rather than the stored ones.
   */
  protected readonly previewFloor = computed<PriceFloorPreview | null>(() => {
    this.formChanges();
    const { cost, price, maxDiscountPercent } = this.form.getRawValue();
    return previewPriceFloor(cost, price, maxDiscountPercent);
  });

  ngOnInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [categories, presentations] = await Promise.all([
        firstValueFrom(this.categories.list({ pageSize: 100, includeInactive: true })),
        firstValueFrom(this.presentations.list({ pageSize: 100, includeInactive: true })),
      ]);
      this.categoryOptions.set([...categories.items]);
      this.presentationOptions.set([...presentations.items]);

      const id = this.route.snapshot.paramMap.get('id');
      if (id) {
        this.productId.set(id);
        const product = await firstValueFrom(this.products.get(id));
        this.fill(product);
        void this.loadChanges(id);
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
      maxDiscountPercent: product.maxDiscountPercent,
      description: product.description ?? '',
      isvExempt: product.isvExempt,
    });

    this.composition.clear();
    for (const item of product.composition ?? []) {
      this.composition.push(this.compositionRow(item));
    }

    this.image.reset(product.imageUrl);
    this.sheet.reset(product.technicalSheetUrl);
  }

  /** Picking or pasting clears any standing error from a previous attempt. */
  protected pick(selection: FileSelection, file: File): void {
    this.formError.set(null);
    selection.select(file);
  }

  protected pickUrl(selection: FileSelection, url: string): void {
    this.formError.set(null);
    selection.useUrl(url);
  }

  protected addComponent(): void {
    this.composition.push(this.compositionRow());
  }

  protected removeComponent(index: number): void {
    this.composition.removeAt(index);
  }

  private compositionRow(item?: CompositionItem): CompositionRow {
    return this.fb.group({
      name: this.fb.control(item?.name ?? '', [Validators.required]),
      value: this.fb.control(item?.value ?? 0, [Validators.required]),
      unit: this.fb.control(item?.unit ?? ''),
    });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    try {
      const [imageUrl, technicalSheetUrl] = await Promise.all([
        this.image.resolve((file) => this.imageStorage.upload(file)),
        this.sheet.resolve((file) => this.sheetStorage.upload(file)),
      ]);

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
        technicalSheetUrl,
        composition: raw.composition.map((row) => this.toComponent(row)),
        isvExempt: raw.isvExempt,
      };

      const id = this.productId();
      if (id) {
        // Partial PATCH — isActive is owned by the list's activate toggle.
        // The cap is always sent: null is how an existing one gets cleared.
        await firstValueFrom(
          this.products.update(id, {
            ...base,
            maxDiscountPercent: raw.maxDiscountPercent,
          }),
        );
      } else {
        // On create an empty cap is left out rather than sent as null.
        const payload: ProductPayload = {
          ...base,
          ...(raw.maxDiscountPercent === null
            ? {}
            : { maxDiscountPercent: raw.maxDiscountPercent }),
          isActive: true,
        };
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

  /** Drops `unit` entirely when blank — the API expects it absent, not empty. */
  private toComponent(row: {
    name: string;
    value: number;
    unit: string;
  }): CompositionItem {
    const unit = row.unit.trim();
    const item: CompositionItem = { name: row.name.trim(), value: row.value };
    return unit ? { ...item, unit } : item;
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
  /**
   * The history is a reference, not a requirement — a failure here leaves the
   * section empty rather than taking the whole form down with it.
   */
  private async loadChanges(id: string): Promise<void> {
    this.changesLoading.set(true);
    try {
      const page = await firstValueFrom(
        this.products.changes(id, { pageSize: CHANGES_PAGE_SIZE }),
      );
      this.changes.set(page.items);
    } catch {
      this.changes.set([]);
    } finally {
      this.changesLoading.set(false);
    }
  }

  /**
   * Exports the WHOLE history, not the page shown on screen — an export that
   * silently covers 20 of 300 edits is worse than no export, because the file
   * gets read as if it were the full record.
   */
  protected async exportChanges(): Promise<void> {
    const id = this.productId();
    if (!id || this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.exportError.set(null);
    this.exportTruncated.set(false);
    try {
      const result = await fetchAllPages(
        (page, pageSize) => this.products.changes(id, { page, pageSize }),
        { pageSize: EXPORT_PAGE_SIZE },
      );
      // Surfaced, never swallowed: the caller of fetchAllPages owns telling
      // the user when rows are missing.
      this.exportTruncated.set(result.truncated);
      const sku = this.form.controls.sku.value.trim() || id;
      await exportToExcel({
        fileName: `historial-${sku}-${formatDay(new Date())}`,
        sheets: [buildProductChangesSheet(result.rows)],
      });
    } catch (error) {
      this.exportError.set(
        this.toMessage(error, 'No se pudo generar el historial.'),
      );
    } finally {
      this.exporting.set(false);
    }
  }

  /** Falls back to the raw property name so a newly logged field still shows. */
  protected fieldLabel(field: string): string {
    return PRODUCT_FIELD_LABELS[field] ?? field;
  }

  /**
   * An empty value reads as a dash: the field was blank, not unknown. Boolean
   * fields arrive as the text "true"/"false" and read as a plain yes/no.
   */
  protected changeValue(field: string, value: string | null): string {
    if (value === null || value === '') {
      return '—';
    }
    if (PRODUCT_BOOLEAN_FIELDS.has(field)) {
      return value === 'true' ? 'Sí' : 'No';
    }
    return value;
  }

}
