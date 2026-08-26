import { describe, expect, it } from 'vitest';

import type { ExcelCellSpec } from '../../../shared/utils/excel-export';
import type { ProductChange } from '../models/product.model';
import { buildProductChangesSheet } from './product-changes-export';

function change(overrides: Partial<ProductChange> = {}): ProductChange {
  return {
    id: 'c1',
    field: 'price',
    oldValue: '25.50',
    newValue: '31.00',
    changedById: 'u1',
    changedByName: 'Ana Martínez',
    changedAt: '2026-08-25T14:03:11.000Z',
    ...overrides,
  };
}

/** Cells are addressed by Excel reference, so tests look them up the same way. */
function cellAt(cells: readonly ExcelCellSpec[], ref: string): ExcelCellSpec {
  const found = cells.find((cell) => cell.ref === ref);
  if (!found) {
    throw new Error(`no cell at ${ref}`);
  }
  return found;
}

describe('buildProductChangesSheet', () => {
  it('writes a header row', () => {
    const sheet = buildProductChangesSheet([change()]);

    expect(cellAt(sheet.cells, 'A1').value).toBe('Fecha');
    expect(cellAt(sheet.cells, 'A1').bold).toBe(true);
  });

  /**
   * The export exists to be sorted and filtered. A date written as text
   * sorts alphabetically, which quietly ruins exactly that.
   */
  it('writes the timestamp as a real date, not text', () => {
    const sheet = buildProductChangesSheet([change()]);

    const cell = cellAt(sheet.cells, 'A2');
    expect(cell.value).toBeInstanceOf(Date);
    expect((cell.value as Date).toISOString()).toBe('2026-08-25T14:03:11.000Z');
  });

  it('translates the field name to Spanish', () => {
    const sheet = buildProductChangesSheet([change({ field: 'price' })]);

    expect(cellAt(sheet.cells, 'B2').value).toBe('Precio');
  });

  /** A field the API starts logging later must still appear, not vanish. */
  it('falls back to the raw field name when it has no label', () => {
    const sheet = buildProductChangesSheet([change({ field: 'barcode' })]);

    expect(cellAt(sheet.cells, 'B2').value).toBe('barcode');
  });

  it('carries the values and the author', () => {
    const sheet = buildProductChangesSheet([change()]);

    expect(cellAt(sheet.cells, 'C2').value).toBe('25.50');
    expect(cellAt(sheet.cells, 'D2').value).toBe('31.00');
    expect(cellAt(sheet.cells, 'E2').value).toBe('Ana Martínez');
  });

  /**
   * On screen an empty value reads as a dash. In a spreadsheet that dash is
   * a value: it breaks filters and makes "blank" uncountable. Null belongs
   * in the cell instead.
   */
  it('leaves an empty value blank rather than writing the on-screen dash', () => {
    const sheet = buildProductChangesSheet([
      change({ oldValue: null, newValue: null, changedByName: null }),
    ]);

    expect(cellAt(sheet.cells, 'C2').value).toBeNull();
    expect(cellAt(sheet.cells, 'D2').value).toBeNull();
    expect(cellAt(sheet.cells, 'E2').value).toBeNull();
  });

  it('writes one row per change, in the order given', () => {
    const sheet = buildProductChangesSheet([
      change({ id: 'c1', field: 'price' }),
      change({ id: 'c2', field: 'cost' }),
    ]);

    expect(cellAt(sheet.cells, 'B2').value).toBe('Precio');
    expect(cellAt(sheet.cells, 'B3').value).toBe('Costo');
  });
});
