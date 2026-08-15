import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TagModule } from 'primeng/tag';

import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_SEVERITY,
  type ReturnStatus,
} from '../../models/return.model';

/** A return's header as rendered: ids already resolved to people's names. */
export interface ReturnSummaryView {
  readonly sellerName: string;
  /** Return day (ISO 8601 UTC); localised in the template. */
  readonly date: string;
  readonly status: ReturnStatus;
  readonly declaredBy: string;
  readonly confirmedBy: string | null;
  readonly confirmedAt: string | null;
  readonly notes: string | null;
}

/** Who handed the return in, when, and where it stands. */
@Component({
  selector: 'app-return-summary',
  imports: [DatePipe, TagModule],
  templateUrl: './return-summary.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnSummary {
  readonly summary = input.required<ReturnSummaryView>();

  protected statusLabel(status: ReturnStatus): string {
    return RETURN_STATUS_LABELS[status];
  }

  protected statusSeverity(
    status: ReturnStatus,
  ): 'secondary' | 'success' | 'danger' {
    return RETURN_STATUS_SEVERITY[status];
  }
}
