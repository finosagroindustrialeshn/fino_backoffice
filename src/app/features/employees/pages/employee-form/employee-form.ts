import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';

import type { UserProfile } from '../../../../core/auth/user-profile.model';
import { UserDataClient } from '../../../users/services/user-data';
import {
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPES,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUSES,
  PAYMENT_FREQUENCIES,
  PAYMENT_FREQUENCY_LABELS,
  type ContractType,
  type Employee,
  type EmployeePayload,
  type EmploymentStatus,
  type PaymentFrequency,
} from '../../models/employee.model';
import type { JobPosition } from '../../models/job-position.model';
import { EmployeeDataClient } from '../../services/employee-data';
import { JobPositionDataClient } from '../../services/job-position-data';

/** Positions and logins are bounded reference data — one page is enough. */
const LOOKUP_SIZE = 100;

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
}

@Component({
  selector: 'app-employee-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    SkeletonModule,
  ],
  templateUrl: './employee-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeForm implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly employees = inject(EmployeeDataClient);
  private readonly positions = inject(JobPositionDataClient);
  private readonly users = inject(UserDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly employeeId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.employeeId() !== null);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  /** Read-only, server-generated — shown once the record exists. */
  protected readonly employeeCode = signal<string | null>(null);

  // Mutable: PrimeNG's `[options]` input will not accept a readonly array.
  protected readonly positionOptions = signal<JobPosition[]>([]);

  protected readonly userOptions = computed<SelectOption<string>[]>(() => [
    { label: 'Sin acceso al sistema', value: '' },
    ...this.userList().map((user) => ({
      label: `${user.fullName} · ${user.email}`,
      value: user.id,
    })),
  ]);

  private readonly userList = signal<readonly UserProfile[]>([]);

  protected readonly contractTypeOptions: SelectOption<ContractType>[] =
    CONTRACT_TYPES.map((type) => ({
      label: CONTRACT_TYPE_LABELS[type],
      value: type,
    }));

  protected readonly paymentFrequencyOptions: SelectOption<PaymentFrequency>[] =
    PAYMENT_FREQUENCIES.map((frequency) => ({
      label: PAYMENT_FREQUENCY_LABELS[frequency],
      value: frequency,
    }));

  protected readonly statusOptions: SelectOption<EmploymentStatus>[] =
    EMPLOYMENT_STATUSES.map((status) => ({
      label: EMPLOYMENT_STATUS_LABELS[status],
      value: status,
    }));

  protected readonly form = this.fb.group({
    firstName: this.fb.control('', [Validators.required]),
    lastName: this.fb.control('', [Validators.required]),
    nationalId: this.fb.control(''),
    email: this.fb.control('', [Validators.email]),
    phone: this.fb.control(''),
    positionId: this.fb.control('', [Validators.required]),
    hireDate: this.fb.control<Date | null>(null, [Validators.required]),
    terminationDate: this.fb.control<Date | null>(null),
    contractType: this.fb.control<ContractType>('PERMANENT', [
      Validators.required,
    ]),
    baseSalary: this.fb.control(0, [Validators.required, Validators.min(0)]),
    paymentFrequency: this.fb.control<PaymentFrequency>('MONTHLY', [
      Validators.required,
    ]),
    status: this.fb.control<EmploymentStatus>('ACTIVE', [Validators.required]),
    bankName: this.fb.control(''),
    bankAccount: this.fb.control(''),
    userId: this.fb.control(''),
  });

  ngOnInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [positions, users] = await Promise.all([
        firstValueFrom(
          this.positions.list({ pageSize: LOOKUP_SIZE, includeInactive: true }),
        ),
        firstValueFrom(
          this.users.list({ pageSize: LOOKUP_SIZE, includeInactive: true }),
        ),
      ]);
      this.positionOptions.set([...positions.items]);
      this.userList.set(users.items);

      const id = this.route.snapshot.paramMap.get('id');
      if (id) {
        this.employeeId.set(id);
        const employee = await firstValueFrom(this.employees.get(id));
        this.fill(employee);
      } else {
        // A new hire defaults to today so the required date is never blank.
        this.form.controls.hireDate.setValue(new Date());
      }
    } catch (error) {
      this.loadError.set(
        this.toMessage(error, 'No se pudo cargar el formulario.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  private fill(employee: Employee): void {
    this.employeeCode.set(employee.employeeCode);
    this.form.reset({
      firstName: employee.firstName,
      lastName: employee.lastName,
      nationalId: employee.nationalId ?? '',
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      positionId: employee.positionId,
      hireDate: parseDay(employee.hireDate),
      terminationDate: parseDay(employee.terminationDate),
      contractType: employee.contractType,
      baseSalary: employee.baseSalary,
      paymentFrequency: employee.paymentFrequency,
      status: employee.status,
      bankName: employee.bankName ?? '',
      bankAccount: employee.bankAccount ?? '',
      userId: employee.userId ?? '',
    });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const hireDate = raw.hireDate;
    if (!hireDate) {
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    // Optional text fields are omitted when blank: the API validates `email`
    // as an address and `nationalId` as unique, so '' would be rejected.
    const nationalId = raw.nationalId.trim();
    const email = raw.email.trim();
    const phone = raw.phone.trim();
    const bankName = raw.bankName.trim();
    const bankAccount = raw.bankAccount.trim();
    const userId = raw.userId;

    const payload: EmployeePayload = {
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      positionId: raw.positionId,
      hireDate: formatDay(hireDate),
      contractType: raw.contractType,
      baseSalary: raw.baseSalary,
      paymentFrequency: raw.paymentFrequency,
      status: raw.status,
      ...(nationalId ? { nationalId } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(bankName ? { bankName } : {}),
      ...(bankAccount ? { bankAccount } : {}),
      ...(userId ? { userId } : {}),
      ...(raw.terminationDate
        ? { terminationDate: formatDay(raw.terminationDate) }
        : {}),
    };

    try {
      const id = this.employeeId();
      if (id) {
        await firstValueFrom(this.employees.update(id, payload));
      } else {
        await firstValueFrom(this.employees.create(payload));
      }
      await this.router.navigate(['/empleados/lista']);
    } catch (error) {
      this.formError.set(
        this.toMessage(error, 'No se pudo guardar el empleado.'),
      );
    } finally {
      this.saving.set(false);
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

/** Formats a Date as YYYY-MM-DD using its local calendar day (no UTC shift). */
function formatDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Turns the UTC-midnight timestamp the API returns back into the local Date
 * the picker expects, keeping the calendar day the user originally chose.
 */
function parseDay(iso: string | null): Date | null {
  if (!iso) {
    return null;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
}
