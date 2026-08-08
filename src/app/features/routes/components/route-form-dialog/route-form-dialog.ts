import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';

import { formatDay } from '../../../../shared/utils/date-range';
import type { RouteDetail, RoutePayload } from '../../models/route.model';
import { RouteDataClient } from '../../services/route-data';

/** A seller or zone entry for the dialog's selects, resolved by the caller. */
export interface RouteLookupOption {
  readonly label: string;
  readonly value: string;
}

/**
 * Creates an empty route. Stops are not part of this form — they are added on
 * the route detail, which is where the caller is expected to send the user
 * once {@link created} fires.
 */
@Component({
  selector: 'app-route-form-dialog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    SelectModule,
    TextareaModule,
  ],
  templateUrl: './route-form-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteFormDialog {
  private readonly routes = inject(RouteDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly visible = model(false);
  /** Assignable sellers. Empty leaves the route with the authenticated user. */
  readonly sellers = input<RouteLookupOption[]>([]);
  readonly zones = input<RouteLookupOption[]>([]);

  readonly created = output<RouteDetail>();

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    date: this.fb.control<Date | null>(null, [Validators.required]),
    sellerId: this.fb.control<string | null>(null),
    zoneId: this.fb.control<string | null>(null),
    notes: this.fb.control(''),
  });

  /** Wired to the dialog's `onShow`, so every opening starts from a clean form. */
  protected resetForm(): void {
    this.error.set(null);
    this.submitting.set(false);
    this.form.reset({
      date: new Date(),
      sellerId: null,
      zoneId: null,
      notes: '',
    });
  }

  protected close(): void {
    this.visible.set(false);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const date = raw.date;
    if (!date) {
      return;
    }

    const notes = raw.notes.trim();
    // Optional fields are omitted rather than sent empty: the API defaults the
    // seller to the caller, and an empty string is not "no zone".
    const payload: RoutePayload = {
      // A route day is a calendar day. `toISOString()` would move it to the
      // previous day for anyone west of UTC — Honduras is UTC-6.
      date: formatDay(date),
      ...(raw.sellerId ? { sellerId: raw.sellerId } : {}),
      ...(raw.zoneId ? { zoneId: raw.zoneId } : {}),
      ...(notes ? { notes } : {}),
    };

    this.submitting.set(true);
    this.error.set(null);
    try {
      const route = await firstValueFrom(this.routes.create(payload));
      this.visible.set(false);
      this.created.emit(route);
    } catch (error) {
      this.error.set(this.toMessage(error, 'No se pudo crear la ruta.'));
    } finally {
      this.submitting.set(false);
    }
  }

  private toMessage(error: unknown, fallback: string): string {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return fallback;
  }
}
