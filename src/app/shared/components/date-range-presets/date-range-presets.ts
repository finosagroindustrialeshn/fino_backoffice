import { ChangeDetectionStrategy, Component, output } from '@angular/core';

import { lastNDays, monthToDate } from '../../utils/date-range';

/**
 * One-click shortcuts for the date-range filters used across list and report
 * pages. Presentational: it computes a range and emits it, the container
 * decides what to do with it (assign to its own `dateRange` state).
 */
@Component({
  selector: 'app-date-range-presets',
  templateUrl: './date-range-presets.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateRangePresets {
  readonly rangeSelected = output<[Date, Date]>();

  protected pickToday(): void {
    this.rangeSelected.emit(lastNDays(1, new Date()));
  }

  protected pickLast7Days(): void {
    this.rangeSelected.emit(lastNDays(7, new Date()));
  }

  protected pickThisMonth(): void {
    this.rangeSelected.emit(monthToDate(new Date()));
  }
}
