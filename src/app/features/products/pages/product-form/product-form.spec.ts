import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, type Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { Paginated } from '../../../../core/http/pagination.model';
import { ProductCategoryDataClient } from '../../../catalogs/product-categories/services/product-category-data';
import { ProductPresentationDataClient } from '../../../catalogs/product-presentations/services/product-presentation-data';
import type { Product, ProductPayload } from '../../models/product.model';
import { ProductDataClient } from '../../services/product-data';
import { ProductImageStorage } from '../../services/product-image-storage';
import { ProductSheetStorage } from '../../services/product-sheet-storage';
import { ProductForm } from './product-form';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const CATEGORY_ID = '22222222-2222-4222-8222-222222222222';
const PRESENTATION_ID = '33333333-3333-4333-8333-333333333333';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component, so the spec reaches them through one structural cast
 * instead of scattering `any`.
 */
interface FormInternals {
  submit(): Promise<void>;
  readonly form: {
    patchValue(value: Record<string, unknown>): void;
    readonly invalid: boolean;
  };
  previewFloor(): {
    minPrice: number;
    allowedDiscountPercent: number;
  } | null;
}

function paginated<T>(items: readonly T[]): Paginated<T> {
  return {
    items,
    meta: {
      page: 1,
      pageSize: 100,
      total: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_ID,
    name: 'Urea 50kg',
    sku: 'URE50',
    description: null,
    imageUrl: null,
    technicalSheetUrl: null,
    composition: null,
    cost: 60,
    price: 100,
    maxDiscountPercent: 20,
    minPrice: 80,
    allowedDiscountPercent: 20,
    categoryId: CATEGORY_ID,
    presentationId: PRESENTATION_ID,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Everything the form needs to be valid, with the cap left empty. */
const VALID_FIELDS = {
  name: 'Urea 50kg',
  sku: 'URE50',
  categoryId: CATEGORY_ID,
  presentationId: PRESENTATION_ID,
  cost: 60,
  price: 100,
};

describe('ProductForm', () => {
  let fixture: ComponentFixture<ProductForm>;
  let cmp: FormInternals;
  let create: Mock<(dto: ProductPayload) => Observable<Product>>;
  let update: Mock<(id: string, dto: Partial<ProductPayload>) => Observable<Product>>;

  async function setup(existing: Product | null): Promise<void> {
    create = vi.fn(() => of(product()));
    update = vi.fn(() => of(product()));

    await TestBed.configureTestingModule({
      imports: [ProductForm],
      providers: [
        // The template links back to the list, so RouterLink needs both.
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(existing ? { id: existing.id } : {}),
            },
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn(() => Promise.resolve(true)),
            createUrlTree: vi.fn(() => ({})),
            serializeUrl: vi.fn(() => '/productos'),
            events: of(),
          },
        },
        {
          provide: ProductDataClient,
          useValue: {
            get: vi.fn(() => of(existing)),
            changes: vi.fn(() => of(paginated([]))),
            create,
            update,
          },
        },
        {
          provide: ProductCategoryDataClient,
          useValue: {
            list: vi.fn(() =>
              of(paginated([{ id: CATEGORY_ID, name: 'Fertilizantes' }])),
            ),
          },
        },
        {
          provide: ProductPresentationDataClient,
          useValue: {
            list: vi.fn(() =>
              of(paginated([{ id: PRESENTATION_ID, name: 'Saco 50kg' }])),
            ),
          },
        },
        // Nothing is picked in these specs, so upload is never reached.
        {
          provide: ProductImageStorage,
          useValue: { validate: vi.fn(() => null), upload: vi.fn() },
        },
        {
          provide: ProductSheetStorage,
          useValue: { validate: vi.fn(() => null), upload: vi.fn() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductForm);
    fixture.detectChanges();
    // ngOnInit's init() resolves on the microtask queue.
    await fixture.whenStable();
    fixture.detectChanges();

    cmp = fixture.componentInstance as unknown as FormInternals;
  }

  describe('creating', () => {
    beforeEach(async () => {
      await setup(null);
    });

    // The API treats a missing key as "no cap" — null is only for PATCH.
    it('leaves the cap out of the payload when empty', async () => {
      cmp.form.patchValue(VALID_FIELDS);

      await cmp.submit();

      expect(create).toHaveBeenCalledTimes(1);
      const payload = create.mock.calls[0]?.[0];
      expect(payload).not.toHaveProperty('maxDiscountPercent');
    });

    // A string "15" is refused with a 400, so the type matters as much as the value.
    it('sends the cap as a number when set', async () => {
      cmp.form.patchValue({ ...VALID_FIELDS, maxDiscountPercent: 15 });

      await cmp.submit();

      const payload = create.mock.calls[0]?.[0];
      expect(payload?.maxDiscountPercent).toBe(15);
      expect(typeof payload?.maxDiscountPercent).toBe('number');
    });

    it('refuses a fractional or out-of-range cap', async () => {
      cmp.form.patchValue({ ...VALID_FIELDS, maxDiscountPercent: 12.5 });
      expect(cmp.form.invalid).toBe(true);
      await cmp.submit();

      cmp.form.patchValue({ maxDiscountPercent: 101 });
      expect(cmp.form.invalid).toBe(true);
      await cmp.submit();

      expect(create).not.toHaveBeenCalled();
    });

    it('previews the floor the API will enforce as the figures change', () => {
      cmp.form.patchValue({ cost: 60, price: 100, maxDiscountPercent: 20 });
      expect(cmp.previewFloor()).toEqual({
        minPrice: 80,
        allowedDiscountPercent: 20,
      });

      // No cap: the floor is the cost, and the margin is what remains.
      cmp.form.patchValue({ maxDiscountPercent: null });
      expect(cmp.previewFloor()).toEqual({
        minPrice: 60,
        allowedDiscountPercent: 40,
      });

      // A cap deeper than the margin still stops at the cost.
      cmp.form.patchValue({ maxDiscountPercent: 90 });
      expect(cmp.previewFloor()?.minPrice).toBe(60);

      cmp.form.patchValue({ price: 0 });
      expect(cmp.previewFloor()).toBeNull();
    });
  });

  describe('editing', () => {
    beforeEach(async () => {
      await setup(product({ maxDiscountPercent: 20 }));
    });

    // Omitting the key would leave the stored cap in place; null clears it.
    it('sends null when the cap is cleared', async () => {
      cmp.form.patchValue({ maxDiscountPercent: null });

      await cmp.submit();

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0]?.[0]).toBe(PRODUCT_ID);
      expect(update.mock.calls[0]?.[1]).toEqual(
        expect.objectContaining({ maxDiscountPercent: null }),
      );
    });
  });
});
