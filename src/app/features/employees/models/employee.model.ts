export const EMPLOYMENT_STATUSES = [
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'TERMINATED',
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: 'Activo',
  ON_LEAVE: 'De permiso',
  SUSPENDED: 'Suspendido',
  TERMINATED: 'Dado de baja',
};

export const CONTRACT_TYPES = [
  'PERMANENT',
  'TEMPORARY',
  'BY_SERVICES',
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  PERMANENT: 'Permanente',
  TEMPORARY: 'Temporal',
  BY_SERVICES: 'Por servicios',
};

export const PAYMENT_FREQUENCIES = ['MONTHLY', 'BIWEEKLY', 'WEEKLY'] as const;

export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];

export const PAYMENT_FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  MONTHLY: 'Mensual',
  BIWEEKLY: 'Quincenal',
  WEEKLY: 'Semanal',
};

/**
 * An HR employee record. `employeeCode` and `fullName` are derived server-side
 * and never sent back on write.
 *
 * `hireDate` / `terminationDate` are day-granularity values the API stores as
 * UTC-midnight timestamps, so they must be rendered with the `'UTC'` timezone
 * to avoid shifting the calendar day in a negative-offset locale.
 */
export interface Employee {
  readonly id: string;
  readonly employeeCode: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly nationalId: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly positionId: string;
  readonly hireDate: string;
  readonly terminationDate: string | null;
  readonly contractType: ContractType;
  /** Base salary per payment period, in Lempiras. */
  readonly baseSalary: number;
  readonly paymentFrequency: PaymentFrequency;
  readonly status: EmploymentStatus;
  readonly bankName: string | null;
  readonly bankAccount: string | null;
  /** Login identity (User) this employee is linked to, when there is one. */
  readonly userId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Create payload. Optional fields are omitted rather than sent empty — the API
 * validates `email` as an address and `nationalId` as unique, so a blank string
 * would be rejected.
 */
export interface EmployeePayload {
  readonly firstName: string;
  readonly lastName: string;
  readonly positionId: string;
  /** Hire date (ISO 8601). Sent as `YYYY-MM-DD` — the day the user picked. */
  readonly hireDate: string;
  readonly contractType: ContractType;
  readonly baseSalary: number;
  readonly paymentFrequency: PaymentFrequency;
  readonly status?: EmploymentStatus;
  readonly nationalId?: string;
  readonly email?: string;
  readonly phone?: string;
  /** Termination date (ISO 8601), when applicable. */
  readonly terminationDate?: string;
  readonly bankName?: string;
  readonly bankAccount?: string;
  readonly userId?: string;
}
