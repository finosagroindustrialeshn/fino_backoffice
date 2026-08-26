import {
  buildTableSheet,
  EXCEL_DATETIME_FORMAT,
  type ExcelColumn,
  type ExcelSheetSpec,
} from '../../../shared/utils/excel-export';
import {
  PRODUCT_FIELD_LABELS,
  type ProductChange,
} from '../models/product.model';

/** Sheet tab name. Excel caps these at 31 characters. */
const SHEET_NAME = 'Historial';

/**
 * An empty value is written as a blank cell, never as the dash the screen
 * shows. In a spreadsheet a dash is a value: it breaks filters and makes
 * "how many were blank" uncountable.
 */
function orBlank(value: string | null): string | null {
  return value === null || value === '' ? null : value;
}

const COLUMNS: readonly ExcelColumn<ProductChange>[] = [
  {
    header: 'Fecha',
    // A real Date, not a formatted string: text that merely looks like a
    // date sorts alphabetically, which ruins the analysis this export is for.
    value: (change) => new Date(change.changedAt),
    numberFormat: EXCEL_DATETIME_FORMAT,
    width: 20,
  },
  {
    header: 'Campo',
    // Falls back to the raw property name so a field the API starts logging
    // later still shows up instead of silently vanishing from the history.
    value: (change) => PRODUCT_FIELD_LABELS[change.field] ?? change.field,
    width: 20,
  },
  { header: 'Valor anterior', value: (c) => orBlank(c.oldValue), width: 28 },
  { header: 'Valor nuevo', value: (c) => orBlank(c.newValue), width: 28 },
  { header: 'Usuario', value: (c) => orBlank(c.changedByName), width: 24 },
];

/** Builds the history sheet. Pure — the caller owns fetching and downloading. */
export function buildProductChangesSheet(
  changes: readonly ProductChange[],
): ExcelSheetSpec {
  return buildTableSheet(SHEET_NAME, COLUMNS, changes);
}
