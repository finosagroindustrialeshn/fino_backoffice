import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { ReturnReason } from '../../../catalogs/return-reasons/models/return-reason.model';
import {
  ReturnVerificationEditor,
  type VerificationDraft,
  type VerificationLine,
} from './return-verification-editor';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface EditorInternals {
  setMerma(productId: string, quantityMerma: number | null): void;
  setReason(productId: string, reasonId: string | null): void;
  errors(): readonly string[];
  declared(): number;
  merma(): number;
  returned(): number;
}

function reason(id: string, name: string): ReturnReason {
  return {
    id,
    code: id.toUpperCase(),
    name,
    description: null,
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function line(
  productId: string,
  name: string,
  declared: number,
): VerificationLine {
  return {
    productId,
    name,
    declared,
    flaggedBySeller: false,
    sellerNote: null,
    quantityMerma: 0,
    reasonId: null,
  };
}

const REASONS = [reason('r1', 'Vencido'), reason('r2', 'Dañado')];
const LINES = [line('p1', 'Urea', 10), line('p2', 'Sal', 4)];

describe('ReturnVerificationEditor', () => {
  let fixture: ComponentFixture<ReturnVerificationEditor>;
  let cmp: EditorInternals;
  let drafts: VerificationDraft[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReturnVerificationEditor],
    }).compileComponents();

    fixture = TestBed.createComponent(ReturnVerificationEditor);
    fixture.componentRef.setInput('lines', LINES);
    fixture.componentRef.setInput('reasonOptions', REASONS);

    drafts = [];
    fixture.componentInstance.draftChange.subscribe((draft) =>
      drafts.push(draft),
    );

    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as EditorInternals;
  });

  /** The draft the parent would confirm right now. */
  function current(): VerificationDraft {
    const draft = drafts.at(-1);
    if (!draft) {
      throw new Error('the editor never emitted a draft');
    }
    return draft;
  }

  function apply(): void {
    fixture.detectChanges();
  }

  it('emits the initial draft so an untouched return can be confirmed', () => {
    const draft = current();

    expect(draft.valid).toBe(true);
    expect(draft.incidents).toEqual([]);
    expect(draft.declared).toBe(14);
    expect(draft.returned).toBe(14);
    expect(draft.merma).toBe(0);
  });

  it('sends everything back to the warehouse when nothing is written off', () => {
    expect(cmp.returned()).toBe(cmp.declared());
    expect(cmp.merma()).toBe(0);
  });

  it('blocks a write-off with no reason', () => {
    cmp.setMerma('p1', 3);
    apply();

    expect(cmp.errors()).toEqual(['Urea: indicá el motivo de la merma.']);
    expect(current().valid).toBe(false);
  });

  it('accepts a write-off once a reason is picked', () => {
    cmp.setMerma('p1', 3);
    cmp.setReason('p1', 'r1');
    apply();

    const draft = current();
    expect(draft.valid).toBe(true);
    expect(draft.incidents).toEqual([
      { productId: 'p1', quantityMerma: 3, reasonId: 'r1' },
    ]);
  });

  it('takes the write-off out of what goes back, never off the line total', () => {
    cmp.setMerma('p1', 3);
    cmp.setReason('p1', 'r1');
    apply();

    const draft = current();
    expect(draft.declared).toBe(14);
    expect(draft.merma).toBe(3);
    expect(draft.returned).toBe(11);
  });

  it('blocks a write-off larger than what the seller declared', () => {
    cmp.setMerma('p2', 9);
    cmp.setReason('p2', 'r1');
    apply();

    expect(cmp.errors()).toEqual([
      'Sal: la merma (9) supera lo declarado (4).',
    ]);
    expect(current().valid).toBe(false);
  });

  it('reports every offending line, not just the first', () => {
    cmp.setMerma('p1', 2);
    cmp.setMerma('p2', 99);
    cmp.setReason('p2', 'r1');
    apply();

    expect(cmp.errors()).toEqual([
      'Urea: indicá el motivo de la merma.',
      'Sal: la merma (99) supera lo declarado (4).',
    ]);
  });

  it('leaves untouched lines out of the payload', () => {
    cmp.setMerma('p1', 1);
    cmp.setReason('p1', 'r1');
    apply();

    expect(current().incidents).toHaveLength(1);
  });

  it('drops a line from the payload when its merma goes back to zero', () => {
    cmp.setMerma('p1', 4);
    cmp.setReason('p1', 'r1');
    apply();
    cmp.setMerma('p1', 0);
    apply();

    const draft = current();
    expect(draft.incidents).toEqual([]);
    // A leftover reason on a zero line must not make the draft invalid.
    expect(draft.valid).toBe(true);
    expect(draft.returned).toBe(14);
  });

  it('rebuilds the draft when a different return is loaded', () => {
    cmp.setMerma('p1', 5);
    cmp.setReason('p1', 'r1');
    apply();

    fixture.componentRef.setInput('lines', [line('p9', 'Abono', 7)]);
    apply();

    const draft = current();
    expect(draft.declared).toBe(7);
    expect(draft.merma).toBe(0);
    expect(draft.incidents).toEqual([]);
  });

  it('treats a cleared number input as zero rather than a hole', () => {
    cmp.setMerma('p1', null);
    apply();

    expect(cmp.merma()).toBe(0);
    expect(current().valid).toBe(true);
  });
});
