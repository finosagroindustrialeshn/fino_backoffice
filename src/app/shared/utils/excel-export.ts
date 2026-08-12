import ExcelJS from 'exceljs';

/**
 * Generic Excel export: the caller sends the exact, final content for every
 * cell (Excel-style reference, e.g. 'A1') — this module has no calculation
 * logic of its own. If a report needs a total row, the caller computes it
 * and sends it as just another cell.
 */
export interface ExcelCellSpec {
  readonly ref: string;
  readonly value: string | number | Date | null;
  readonly bold?: boolean;
  /** ExcelJS number format string, e.g. '#,##0.00' or 'dd/mm/yyyy'. */
  readonly numberFormat?: string;
  readonly align?: 'left' | 'center' | 'right';
}

export interface ExcelSheetSpec {
  /** Sheet tab name (Excel caps this at 31 characters). */
  readonly name: string;
  readonly cells: readonly ExcelCellSpec[];
  /** Column width by letter, e.g. { A: 28, B: 14 }. */
  readonly columnWidths?: Readonly<Record<string, number>>;
}

export interface ExcelWorkbookSpec {
  /** Without extension — `.xlsx` is appended on download. */
  readonly fileName: string;
  /** One sheet for a single-page export, several for a multi-page one. */
  readonly sheets: readonly ExcelSheetSpec[];
}

/** 0-based column index -> Excel column letters (0 -> 'A', 26 -> 'AA', ...). */
export function columnLetter(index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}

/** Common ExcelJS number formats, so callers don't retype the literals. */
export const EXCEL_MONEY_FORMAT = '"L "#,##0.00';
export const EXCEL_DATETIME_FORMAT = 'dd/mm/yyyy hh:mm';
export const EXCEL_DATE_FORMAT = 'dd/mm/yyyy';

/** One column of a tabular sheet: a header plus how to read it off a row. */
export interface ExcelColumn<T> {
  readonly header: string;
  readonly value: (row: T) => string | number | Date | null;
  /** ExcelJS number format, e.g. EXCEL_MONEY_FORMAT. */
  readonly numberFormat?: string;
  readonly align?: 'left' | 'center' | 'right';
  readonly width?: number;
}

const DEFAULT_COLUMN_WIDTH = 18;

/**
 * Builds a plain header-plus-rows sheet — the shape every list export wants.
 *
 * Values are written with their real types rather than pre-formatted strings:
 * a date stays a date and an amount stays a number, so the spreadsheet can
 * sort, filter and pivot them. Formatting is presentation, applied through
 * `numberFormat`. Text that merely looks like a date sorts alphabetically,
 * which quietly ruins the analysis the export exists for.
 */
export function buildTableSheet<T>(
  name: string,
  columns: readonly ExcelColumn<T>[],
  rows: readonly T[],
): ExcelSheetSpec {
  const cells: ExcelCellSpec[] = columns.map((column, index) => ({
    ref: `${columnLetter(index)}1`,
    value: column.header,
    bold: true,
  }));

  rows.forEach((row, rowIndex) => {
    columns.forEach((column, columnIndex) => {
      cells.push({
        ref: `${columnLetter(columnIndex)}${rowIndex + 2}`,
        value: column.value(row),
        ...(column.numberFormat ? { numberFormat: column.numberFormat } : {}),
        ...(column.align ? { align: column.align } : {}),
      });
    });
  });

  const columnWidths: Record<string, number> = {};
  columns.forEach((column, index) => {
    columnWidths[columnLetter(index)] = column.width ?? DEFAULT_COLUMN_WIDTH;
  });

  return { name, cells, columnWidths };
}

/** Pure: builds the workbook in memory. Split out from `exportToExcel` so it's testable without the browser download step. */
export function buildWorkbook(spec: ExcelWorkbookSpec): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  for (const sheetSpec of spec.sheets) {
    const sheet = workbook.addWorksheet(sheetSpec.name);

    for (const cellSpec of sheetSpec.cells) {
      const cell = sheet.getCell(cellSpec.ref);
      cell.value = cellSpec.value;
      if (cellSpec.bold) {
        cell.font = { bold: true };
      }
      if (cellSpec.numberFormat) {
        cell.numFmt = cellSpec.numberFormat;
      }
      if (cellSpec.align) {
        cell.alignment = { horizontal: cellSpec.align };
      }
    }

    if (sheetSpec.columnWidths) {
      for (const [column, width] of Object.entries(sheetSpec.columnWidths)) {
        sheet.getColumn(column).width = width;
      }
    }
  }

  return workbook;
}

/** Builds the workbook and triggers a browser download of the .xlsx file. */
export async function exportToExcel(spec: ExcelWorkbookSpec): Promise<void> {
  const workbook = buildWorkbook(spec);
  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = spec.fileName.endsWith('.xlsx')
      ? spec.fileName
      : `${spec.fileName}.xlsx`;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
