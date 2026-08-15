import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';

import type { ReturnReason } from '../../../catalogs/return-reasons/models/return-reason.model';
import type { ReturnIncidentInput } from '../../models/return.model';
import {
  ReturnLinesTable,
  type ReturnLineView,
} from '../return-lines-table/return-lines-table';
import {
  ReturnSummary,
  type ReturnSummaryView,
} from '../return-summary/return-summary';
import {
  ReturnVerificationEditor,
  type VerificationDraft,
  type VerificationLine,
} from '../return-verification-editor/return-verification-editor';

/**
 * The return detail: a verification form while it is an editable draft, a
 * read-only record once it is not.
 *
 * Presentational — it composes the summary, the right table and the actions,
 * and emits what the user decided. The parent owns the fetch, the HTTP calls
 * and the error messages.
 */
@Component({
  selector: 'app-return-detail-dialog',
  imports: [
    ButtonModule,
    DialogModule,
    SkeletonModule,
    ReturnLinesTable,
    ReturnSummary,
    ReturnVerificationEditor,
  ],
  templateUrl: './return-detail-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnDetailDialog {
  readonly open = model.required<boolean>();

  /** Read off the list row, so the dialog paints before the lines arrive. */
  readonly summary = input.required<ReturnSummaryView | null>();
  /** A DRAFT the current user is allowed to verify. */
  readonly editable = input.required<boolean>();
  readonly verificationLines = input.required<readonly VerificationLine[]>();
  readonly confirmedLines = input.required<readonly ReturnLineView[]>();
  readonly reasonOptions = input.required<ReturnReason[]>();

  readonly loading = input(false);
  readonly loadError = input<string | null>(null);
  readonly acting = input(false);
  readonly actionError = input<string | null>(null);

  readonly confirmed = output<readonly ReturnIncidentInput[]>();
  readonly cancelled = output<void>();
  readonly retried = output<void>();

  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  /** Last draft emitted by the editor; null while the lines load. */
  private readonly draft = signal<VerificationDraft | null>(null);

  protected readonly canConfirm = computed(
    () => this.draft()?.valid === true && !this.acting() && !this.loading(),
  );

  protected readonly returned = computed(() => this.draft()?.returned ?? 0);
  protected readonly merma = computed(() => this.draft()?.merma ?? 0);

  protected onDraftChange(draft: VerificationDraft): void {
    this.draft.set(draft);
  }

  protected confirm(): void {
    const draft = this.draft();
    if (!draft?.valid) {
      return;
    }
    this.confirmed.emit(draft.incidents);
  }
}
