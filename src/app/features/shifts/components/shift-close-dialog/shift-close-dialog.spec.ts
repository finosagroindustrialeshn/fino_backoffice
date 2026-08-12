import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FormControl, FormGroup } from '@angular/forms';

import type { CashDifferenceKind, CloseShiftPayload } from '../../models/shift.model';
import { ShiftCloseDialog } from './shift-close-dialog';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface DialogInternals {
  readonly form: FormGroup<{
    closingCash: FormControl<number>;
    notes: FormControl<string>;
  }>;
  countedCash(): number;
  difference(): number;
  differenceKind(): CashDifferenceKind;
  differenceAmount(): number;
  balances(): boolean;
  needsNote(): boolean;
  canSubmit(): boolean;
  matchExpected(): void;
  submit(): void;
}

const EXPECTED = 2685;

describe('ShiftCloseDialog', () => {
  let fixture: ComponentFixture<ShiftCloseDialog>;
  let cmp: DialogInternals;
  let emitted: CloseShiftPayload[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShiftCloseDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(ShiftCloseDialog);
    fixture.componentRef.setInput('expectedCash', EXPECTED);
    fixture.detectChanges();

    cmp = fixture.componentInstance as unknown as DialogInternals;
    emitted = [];
    fixture.componentInstance.submitted.subscribe((payload) =>
      emitted.push(payload),
    );
  });

  function count(amount: number): void {
    cmp.form.controls.closingCash.setValue(amount);
  }

  function explain(notes: string): void {
    cmp.form.controls.notes.setValue(notes);
  }

  it('recognises a shift that balances', () => {
    count(EXPECTED);

    expect(cmp.balances()).toBe(true);
    expect(cmp.differenceKind()).toBe('exact');
    expect(cmp.difference()).toBe(0);
  });

  it('reports a shortage as a positive amount under a short label', () => {
    count(EXPECTED - 150);

    expect(cmp.differenceKind()).toBe('short');
    expect(cmp.difference()).toBe(-150);
    // The label carries the direction, so the figure itself is absolute.
    expect(cmp.differenceAmount()).toBe(150);
  });

  it('reports a surplus separately from a shortage', () => {
    count(EXPECTED + 40);

    expect(cmp.differenceKind()).toBe('over');
    expect(cmp.differenceAmount()).toBe(40);
  });

  it('treats sub-cent noise as balanced rather than a difference', () => {
    count(EXPECTED + 0.001);

    expect(cmp.differenceKind()).toBe('exact');
    expect(cmp.balances()).toBe(true);
  });

  it('fills in the expected amount in one click', () => {
    cmp.matchExpected();

    expect(cmp.form.controls.closingCash.value).toBe(EXPECTED);
    expect(cmp.balances()).toBe(true);
  });

  it('closes a balanced shift without requiring a note', () => {
    count(EXPECTED);
    cmp.submit();

    expect(emitted).toEqual([{ closingCash: EXPECTED }]);
  });

  it('refuses to close an unexplained shortage', () => {
    count(EXPECTED - 200);
    cmp.submit();

    expect(cmp.needsNote()).toBe(true);
    expect(emitted).toEqual([]);
  });

  it('refuses to close an unexplained surplus too', () => {
    count(EXPECTED + 200);
    cmp.submit();

    expect(emitted).toEqual([]);
  });

  it('closes a shortage once it is explained', () => {
    count(EXPECTED - 200);
    explain('Le robaron en la ruta, hay denuncia');
    cmp.submit();

    expect(cmp.needsNote()).toBe(false);
    expect(emitted).toEqual([
      {
        closingCash: EXPECTED - 200,
        notes: 'Le robaron en la ruta, hay denuncia',
      },
    ]);
  });

  it('does not accept whitespace as an explanation', () => {
    count(EXPECTED - 200);
    explain('   ');
    cmp.submit();

    expect(cmp.needsNote()).toBe(true);
    expect(emitted).toEqual([]);
  });

  it('omits an empty note instead of sending a blank string', () => {
    count(EXPECTED);
    explain('  ');
    cmp.submit();

    expect(emitted).toEqual([{ closingCash: EXPECTED }]);
  });

  it('allows closing a shift that took in nothing at all', () => {
    fixture.componentRef.setInput('expectedCash', 0);
    fixture.detectChanges();
    count(0);
    cmp.submit();

    expect(cmp.balances()).toBe(true);
    expect(emitted).toEqual([{ closingCash: 0 }]);
  });

  it('treats a cleared cash box as zero instead of NaN', () => {
    cmp.form.controls.closingCash.setValue(null as unknown as number);

    expect(cmp.countedCash()).toBe(0);
    expect(Number.isNaN(cmp.countedCash())).toBe(false);
    // Zero against a non-zero expectation is a full shortage, not a balance.
    expect(cmp.differenceKind()).toBe('short');
  });
});
