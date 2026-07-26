import { describe, expect, it } from 'vitest';

import { buildWorkbook, columnLetter, type ExcelWorkbookSpec } from './excel-export';

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
