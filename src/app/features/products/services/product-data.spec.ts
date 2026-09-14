import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ApiEnvelope } from '../../../core/http/api-envelope';
import type { Product } from '../models/product.model';
import { ProductDataClient } from './product-data';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

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
    categoryId: null,
    presentationId: null,
    isvExempt: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function envelope<T>(data: T): ApiEnvelope<T> {
  return {
    success: true,
    data,
    message: 'ok',
    timestamp: '2026-01-01T00:00:00.000Z',
  };
}

describe('ProductDataClient', () => {
  let client: ProductDataClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    client = TestBed.inject(ProductDataClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('activates through the dedicated endpoint and returns the product', async () => {
    const activated = product({ isActive: true });
    const pending = firstValueFrom(client.activate(PRODUCT_ID));

    const req = http.expectOne(
      (r) =>
        r.method === 'PATCH' &&
        r.url.endsWith(`/products/${PRODUCT_ID}/activate`),
    );
    expect(req.request.body).toBeNull();
    req.flush(envelope(activated));

    expect(await pending).toEqual(activated);
  });

  it('deactivates through the dedicated endpoint and returns the product', async () => {
    const deactivated = product({ isActive: false });
    const pending = firstValueFrom(client.deactivate(PRODUCT_ID));

    const req = http.expectOne(
      (r) =>
        r.method === 'PATCH' &&
        r.url.endsWith(`/products/${PRODUCT_ID}/deactivate`),
    );
    expect(req.request.body).toBeNull();
    req.flush(envelope(deactivated));

    expect(await pending).toEqual(deactivated);
  });

  it('never sends isActive through the generic PATCH for a lifecycle flip', async () => {
    const pending = firstValueFrom(client.deactivate(PRODUCT_ID));

    http.expectNone(
      (r) => r.method === 'PATCH' && r.url.endsWith(`/products/${PRODUCT_ID}`),
    );
    http
      .expectOne((r) => r.url.endsWith(`/products/${PRODUCT_ID}/deactivate`))
      .flush(envelope(product({ isActive: false })));

    await pending;
  });
});
