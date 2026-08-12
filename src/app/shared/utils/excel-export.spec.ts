import { describe, expect, it } from 'vitest';

import {
  buildTableSheet,
  buildWorkbook,
  columnLetter,
  EXCEL_MONEY_FORMAT,
  type ExcelColumn,
  type ExcelWorkbookSpec,
} from './excel-export';

describe('columnLetter', () => {
  it('maps the first 26 columns to single letters A-Z', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(1)).toBe('B');
    expect(columnLetter(25)).toBe('Z');
  });

  it('wraps into double letters past Z, like Excel does', () => {
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(27)).toBe('AB');
    expect(columnLetter(51)).toBe('AZ');
    expect(columnLetter(52)).toBe('BA');
  });
});

describe('buildTableSheet', () => {
  interface Row {
    readonly name: string;
    readonly amount: number;
    readonly closedAt: Date | null;
  }

  const COLUMNS: readonly ExcelColumn<Row>[] = [
    { header: 'Vendedor', value: (row) => row.name, width: 24 },
    {
      header: 'Monto',
      value: (row) => row.amount,
      numberFormat: EXCEL_MONEY_FORMAT,
      align: 'right',
    },
    { header: 'Cierre', value: (row) => row.closedAt },
  ];

  const ROWS: readonly Row[] = [
    { name: 'Ana Castillo', amount: 1250.5, closedAt: new Date(2026, 6, 24) },
    { name: 'Beto Núñez', amount: 940, closedAt: null },
  ];

  it('writes the headers in the first row, in column order', () => {
    const sheet = buildTableSheet('Jornadas', COLUMNS, ROWS);
    const cell = (ref: string) => sheet.cells.find((c) => c.ref === ref);

    expect(cell('A1')?.value).toBe('Vendedor');
    expect(cell('B1')?.value).toBe('Monto');
    expect(cell('C1')?.value).toBe('Cierre');
    expect(cell('A1')?.bold).toBe(true);
  });

  it('writes one row per item starting at row 2', () => {
    const sheet = buildTableSheet('Jornadas', COLUMNS, ROWS);
    const cell = (ref: string) => sheet.cells.find((c) => c.ref === ref);

    expect(cell('A2')?.value).toBe('Ana Castillo');
    expect(cell('A3')?.value).toBe('Beto Núñez');
  });

  it('keeps numbers and dates as real values, not preformatted text', () => {
    const sheet = buildTableSheet('Jornadas', COLUMNS, ROWS);
    const cell = (ref: string) => sheet.cells.find((c) => c.ref === ref);

    // Text that looks like a number sorts alphabetically, which defeats the
    // whole point of exporting for analysis.
    expect(cell('B2')?.value).toBe(1250.5);
    expect(cell('C2')?.value).toBeInstanceOf(Date);
  });

  it('carries the number format and alignment onto every data cell', () => {
    const sheet = buildTableSheet('Jornadas', COLUMNS, ROWS);
    const cell = (ref: string) => sheet.cells.find((c) => c.ref === ref);

    expect(cell('B2')?.numberFormat).toBe(EXCEL_MONEY_FORMAT);
    expect(cell('B3')?.align).toBe('right');
    // The header is not a money cell, so it carries no number format.
    expect(cell('B1')?.numberFormat).toBeUndefined();
  });

  it('preserves a null as a blank cell rather than coercing it', () => {
    const sheet = buildTableSheet('Jornadas', COLUMNS, ROWS);
    const cell = (ref: string) => sheet.cells.find((c) => c.ref === ref);

    expect(cell('C3')?.value).toBeNull();
  });

  it('emits only the header row when there are no items', () => {
    const sheet = buildTableSheet('Jornadas', COLUMNS, []);

    expect(sheet.cells).toHaveLength(COLUMNS.length);
    expect(sheet.cells.every((cell) => cell.ref.endsWith('1'))).toBe(true);
  });

  it('applies the given width and falls back to a default', () => {
    const sheet = buildTableSheet('Jornadas', COLUMNS, ROWS);

    expect(sheet.columnWidths?.['A']).toBe(24);
    expect(sheet.columnWidths?.['B']).toBe(18);
  });

  it('produces a sheet buildWorkbook can render end to end', () => {
    const sheet = buildTableSheet('Jornadas', COLUMNS, ROWS);

    const workbook = buildWorkbook({ fileName: 'jornadas', sheets: [sheet] });
    const rendered = workbook.getWorksheet('Jornadas')!;

    expect(rendered.getCell('A2').value).toBe('Ana Castillo');
    expect(rendered.getCell('B2').value).toBe(1250.5);
    expect(rendered.getColumn('A').width).toBe(24);
  });
});

describe('buildWorkbook', () => {
  it('creates one worksheet per sheet spec, named accordingly', async () => {
    const spec: ExcelWorkbookSpec = {
      fileName: 'reporte',
      sheets: [
        { name: 'Ventas', cells: [] },
        { name: 'Inventario', cells: [] },
      ],
    };

    const workbook = buildWorkbook(spec);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Ventas',
      'Inventario',
    ]);
  });

  it('writes each cell value at its given reference', () => {
    const spec: ExcelWorkbookSpec = {
      fileName: 'reporte',
      sheets: [
        {
          name: 'Ventas',
          cells: [
            { ref: 'A1', value: 'Producto' },
            { ref: 'B1', value: 'Total' },
            { ref: 'A2', value: 'Concentrado' },
            { ref: 'B2', value: 1250.5 },
          ],
        },
      ],
    };

    const workbook = buildWorkbook(spec);
    const sheet = workbook.getWorksheet('Ventas')!;

    expect(sheet.getCell('A1').value).toBe('Producto');
    expect(sheet.getCell('B1').value).toBe('Total');
    expect(sheet.getCell('A2').value).toBe('Concentrado');
    expect(sheet.getCell('B2').value).toBe(1250.5);
  });

  it('applies bold, number format and alignment when given', () => {
    const spec: ExcelWorkbookSpec = {
      fileName: 'reporte',
      sheets: [
        {
          name: 'Ventas',
          cells: [
            { ref: 'A1', value: 'Total vendido', bold: true },
            { ref: 'B1', value: 1250.5, numberFormat: '#,##0.00', align: 'right' },
          ],
        },
      ],
    };

    const workbook = buildWorkbook(spec);
    const sheet = workbook.getWorksheet('Ventas')!;

    expect(sheet.getCell('A1').font?.bold).toBe(true);
    expect(sheet.getCell('B1').numFmt).toBe('#,##0.00');
    expect(sheet.getCell('B1').alignment?.horizontal).toBe('right');
  });

  it('sets column widths when given', () => {
    const spec: ExcelWorkbookSpec = {
      fileName: 'reporte',
      sheets: [
        {
          name: 'Ventas',
          cells: [],
          columnWidths: { A: 28, B: 14 },
        },
      ],
    };

    const workbook = buildWorkbook(spec);
    const sheet = workbook.getWorksheet('Ventas')!;

    expect(sheet.getColumn('A').width).toBe(28);
    expect(sheet.getColumn('B').width).toBe(14);
  });

  it('supports a null value (an intentionally blank cell)', () => {
    const spec: ExcelWorkbookSpec = {
      fileName: 'reporte',
      sheets: [{ name: 'Ventas', cells: [{ ref: 'A1', value: null }] }],
    };

    const workbook = buildWorkbook(spec);
    const sheet = workbook.getWorksheet('Ventas')!;

    expect(sheet.getCell('A1').value).toBeNull();
  });

  it('supports a Date value', () => {
    const date = new Date(2026, 6, 24);
    const spec: ExcelWorkbookSpec = {
      fileName: 'reporte',
      sheets: [{ name: 'Ventas', cells: [{ ref: 'A1', value: date }] }],
    };

    const workbook = buildWorkbook(spec);
    const sheet = workbook.getWorksheet('Ventas')!;

    expect(sheet.getCell('A1').value).toEqual(date);
  });

  it('builds a multi-sheet workbook independently per sheet', () => {
    const spec: ExcelWorkbookSpec = {
      fileName: 'reporte',
      sheets: [
        { name: 'Ventas', cells: [{ ref: 'A1', value: 'Ventas' }] },
        { name: 'Caja', cells: [{ ref: 'A1', value: 'Caja' }] },
      ],
    };

    const workbook = buildWorkbook(spec);

    expect(workbook.getWorksheet('Ventas')!.getCell('A1').value).toBe('Ventas');
    expect(workbook.getWorksheet('Caja')!.getCell('A1').value).toBe('Caja');
  });
});
