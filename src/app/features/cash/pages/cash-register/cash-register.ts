import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import { toNumber } from '../../../../shared/forms/to-number';
import type { CashSession } from '../../models/cash-session.model';
import { CashSessionDataClient } from '../../services/cash-session-data';

@Component({
  selector: 'app-cash-register',
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    SkeletonModule,
    TextareaModule,
  ],
  templateUrl: './cash-register.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashRegister implements OnInit {
  private readonly cash = inject(CashSessionDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  /** The open till, or null when there is none. */
  protected readonly session = signal<CashSession | null>(null);
  /** Kept after a close so the cashier can read the final arqueo. */
  protected readonly lastClosed = signal<CashSession | null>(null);

  /** UI name stays "arqueo"; the API field it reads is `cashCount`. */
  protected readonly arqueo = computed(() => this.session()?.cashCount ?? null);

  // ── Opening ────────────────────────────────────────────────────────────
  protected readonly openForm = this.fb.group({
    openingCash: this.fb.control(0, [Validators.required, Validators.min(0)]),
    notes: this.fb.control(''),
  });
  protected readonly opening = signal(false);
  protected readonly openError = signal<string | null>(null);

  // ── Closing ────────────────────────────────────────────────────────────
  protected readonly closeDialogVisible = signal(false);
  protected readonly closeForm = this.fb.group({
    closingCash: this.fb.control(0, [Validators.required, Validators.min(0)]),
    notes: this.fb.control(''),
  });
  protected readonly closing = signal(false);
  protected readonly closeError = signal<string | null>(null);

  /** Subscribed so the difference recomputes as the cashier types. */
  private readonly closeChanges = toSignal(this.closeForm.valueChanges);

  /** Over (+) or short (−) against what the till should hold. */
  protected readonly closeDifference = computed(() => {
    this.closeChanges();
    const expected = toNumber(this.arqueo()?.expectedCash);
    return toNumber(this.closeForm.getRawValue().closingCash) - expected;
  });

  ngOnInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.session.set(await firstValueFrom(this.cash.current()));
    } catch (error) {
      this.loadError.set(toMessage(error, 'No se pudo cargar la caja.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async openSession(): Promise<void> {
    if (this.openForm.invalid) {
      this.openForm.markAllAsTouched();
      return;
    }

    this.opening.set(true);
    this.openError.set(null);
    const raw = this.openForm.getRawValue();
    const notes = raw.notes.trim();

    try {
      const session = await firstValueFrom(
        this.cash.open({
          openingCash: raw.openingCash,
          ...(notes ? { notes } : {}),
        }),
      );
      this.session.set(session);
      this.lastClosed.set(null);
      this.openForm.reset({ openingCash: 0, notes: '' });
    } catch (error) {
      this.openError.set(toMessage(error, 'No se pudo abrir la caja.'));
    } finally {
      this.opening.set(false);
    }
  }

  protected openCloseDialog(): void {
    this.closeError.set(null);
    this.closeForm.reset({
      closingCash: this.arqueo()?.expectedCash ?? 0,
      notes: '',
    });
    this.closeDialogVisible.set(true);
  }

  protected async closeSession(): Promise<void> {
    const current = this.session();
    if (!current || this.closeForm.invalid) {
      this.closeForm.markAllAsTouched();
      return;
    }

    this.closing.set(true);
    this.closeError.set(null);
    const raw = this.closeForm.getRawValue();
    const notes = raw.notes.trim();

    try {
      const closed = await firstValueFrom(
        this.cash.close(current.id, {
          closingCash: raw.closingCash,
          ...(notes ? { notes } : {}),
        }),
      );
      this.lastClosed.set(closed);
      this.session.set(null);
      this.closeDialogVisible.set(false);
    } catch (error) {
      this.closeError.set(toMessage(error, 'No se pudo cerrar la caja.'));
    } finally {
      this.closing.set(false);
    }
  }
}

function toMessage(error: unknown, fallback: string): string {
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
