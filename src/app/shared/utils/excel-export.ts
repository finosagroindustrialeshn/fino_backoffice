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
