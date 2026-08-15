import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import type { ReturnReason } from '../../../catalogs/return-reasons/models/return-reason.model';
import type { ReturnIncidentInput } from '../../models/return.model';

/** A declared line as rendered: ids already resolved against the catalog. */
export interface VerificationLine {
  readonly productId: string;
  readonly name: string;
  /** What the seller declared for this product — the line's total. */
  readonly declared: number;
  readonly flaggedBySeller: boolean;
  readonly sellerNote: string | null;
  /** Merma already on the line. 0 for a draft; defensive on a reload. */
  readonly quantityMerma: number;
  readonly reasonId: string | null;
}

/** What the parent needs to confirm: the payload plus its live totals. */
export interface VerificationDraft {
  readonly incidents: readonly ReturnIncidentInput[];
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** Units going back to the warehouse if this draft is confirmed. */
  readonly returned: number;
  readonly merma: number;
  readonly declared: number;
}

/** One editable row: how much of the line is written off, and why. */
interface DraftRow extends VerificationLine {
  readonly reasonId: string | null;
}

/**
 * The verification editor: the merma is decided HERE, not when the return was
 * declared. Whatever is not written off goes back to the warehouse — the line
 * total never changes, only its destination.
 *
 * Presentational: it owns the draft and emits it, and the parent owns the HTTP
 * call. Validation runs here too, so a bad split never costs the user the
 * whole form to a 400.
 */
@Component({
  selector: 'app-return-verification-editor',
  imports: [
    FormsModule,
    InputNumberModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './return-verification-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnVerificationEditor {
  readonly lines = input.required<readonly VerificationLine[]>();
  readonly reasonOptions = input.required<ReturnReason[]>();

  readonly draftChange = output<VerificationDraft>();

  /** Rebuilt whenever a different return is loaded, editable in between. */
  protected readonly rows = linkedSignal<readonly VerificationLine[], DraftRow[]>({
    source: this.lines,
    computation: (lines) => lines.map((line) => ({ ...line })),
  });

  /** Rows the user actually wrote off; everything else goes back intact. */
  private readonly writtenOff = computed(() =>
    this.rows().filter((row) => row.quantityMerma > 0),
  );

  protected readonly declared = computed(() =>
    this.rows().reduce((sum, row) => sum + row.declared, 0),
  );

  protected readonly merma = computed(() =>
    this.rows().reduce((sum, row) => sum + row.quantityMerma, 0),
  );

  protected readonly returned = computed(() => this.declared() - this.merma());

  /**
   * Blocking problems with the draft. The API rejects these too, but catching
   * them here keeps the user from losing the whole form to a 400.
   */
  protected readonly errors = computed(() => {
    const errors: string[] = [];
    for (const row of this.writtenOff()) {
      if (row.quantityMerma > row.declared) {
        errors.push(
          `${row.name}: la merma (${row.quantityMerma}) supera lo declarado (${row.declared}).`,
        );
      }
      if (!row.reasonId) {
        errors.push(`${row.name}: indicá el motivo de la merma.`);
      }
    }
    return errors;
  });

  private readonly draft = computed<VerificationDraft>(() => {
    const errors = this.errors();
    return {
      incidents: this.writtenOff().map((row) => ({
        productId: row.productId,
        quantityMerma: row.quantityMerma,
        // Guarded by `valid`: a written-off row always carries a reason.
        reasonId: row.reasonId as string,
      })),
      valid: errors.length === 0,
      errors,
      returned: this.returned(),
      merma: this.merma(),
      declared: this.declared(),
    };
  });

  constructor() {
    // Emitted from an effect rather than the edit handlers so the parent also
    // gets the INITIAL draft — otherwise confirming without touching anything
    // would leave it guessing at the totals it is about to persist.
    effect(() => this.draftChange.emit(this.draft()));
  }

  protected setMerma(productId: string, quantityMerma: number | null): void {
    this.patch(productId, { quantityMerma: quantityMerma ?? 0 });
  }

  protected setReason(productId: string, reasonId: string | null): void {
    this.patch(productId, { reasonId });
  }

  private patch(
    productId: string,
    patch: Partial<Pick<DraftRow, 'quantityMerma' | 'reasonId'>>,
  ): void {
    this.rows.update((rows) =>
      rows.map((row) =>
        row.productId === productId ? { ...row, ...patch } : row,
      ),
    );
  }
}
