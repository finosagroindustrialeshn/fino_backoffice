import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';

import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import type { ReturnStatus } from '../../models/return.model';

export interface StatusOption {
  readonly label: string;
  readonly value: ReturnStatus | null;
}

export interface SellerOption {
  readonly label: string;
  readonly value: string | null;
}

/**
 * The returns list filters. Each value is a `model()` the parent reads when it
 * builds the query; `changed` fires only when a refetch is actually warranted
 * — mid-selection a date range has one end and would query nonsense.
 */
@Component({
  selector: 'app-return-filters',
  imports: [FormsModule, DatePickerModule, DateRangePresets, SelectModule],
  templateUrl: './return-filters.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnFilters {
  readonly statusOptions = input.required<StatusOption[]>();
  readonly sellerOptions = input.required<SellerOption[]>();

  readonly status = model<ReturnStatus | null>(null);
  readonly sellerId = model<string | null>(null);
  /** [start, end]; either end may be null mid-select. */
  readonly dateRange = model<Date[] | null>(null);

  readonly changed = output<void>();

  protected onStatusChange(status: ReturnStatus | null): void {
    this.status.set(status);
    this.changed.emit();
  }

  protected onSellerChange(sellerId: string | null): void {
    this.sellerId.set(sellerId);
    this.changed.emit();
  }

  protected onDateRangeChange(range: Date[] | null): void {
    this.dateRange.set(range);
    // Refetch once the range is complete (both ends) or cleared.
    if (!range || range.length === 0 || (range[0] && range[1])) {
      this.changed.emit();
    }
  }
}
