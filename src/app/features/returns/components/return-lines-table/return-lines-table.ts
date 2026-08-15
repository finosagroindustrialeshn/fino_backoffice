import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

/** A persisted line as rendered: ids already resolved against the catalog. */
export interface ReturnLineView {
  readonly productId: string;
  readonly name: string;
  readonly quantityReturned: number;
  readonly quantityMerma: number;
  /** Resolved merma reason, or null when nothing was written off. */
  readonly reason: string | null;
  readonly flaggedBySeller: boolean;
  readonly sellerNote: string | null;
}

/**
 * The lines of a return that is no longer editable. Once confirmed the split
 * is history, not an input — so it is read here and never recomputed.
 */
@Component({
  selector: 'app-return-lines-table',
  imports: [TableModule, TagModule],
  templateUrl: './return-lines-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnLinesTable {
  readonly lines = input.required<readonly ReturnLineView[]>();

  /** PrimeNG's `[value]` rejects readonly arrays. */
  protected readonly rows = computed(() => [...this.lines()]);

  protected readonly totalReturned = computed(() =>
    this.rows().reduce((sum, line) => sum + line.quantityReturned, 0),
  );

  protected readonly totalMerma = computed(() =>
    this.rows().reduce((sum, line) => sum + line.quantityMerma, 0),
  );
}
