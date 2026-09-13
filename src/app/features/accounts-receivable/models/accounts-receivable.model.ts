/**
 * Accounts receivable (cuentas por cobrar) models.
 *
 * Mirrors the `accounts-receivable` tag of the OpenAPI spec. Every amount is
 * money in HNL and every date field is an ISO 8601 UTC string, typed as
 * `string` so it is only ever localized at the presentation layer.
 */

import type { OpenCreditSale, SaleStatus } from '../../sales/models/sale.model';

/**
 * One aging band of the outstanding balance, bucketed by days since the sale
 * was created. `toDays` is null for the open-ended 90+ band.
 */
export interface AgingBucket {
  /** Days-since-sale band as the API labels it, e.g. `0-30`. */
  readonly label: string;
  /** Inclusive lower bound in days. */
  readonly fromDays: number;
  /** Inclusive upper bound in days; null for the 90+ band. */
  readonly toDays: number | null;
  /** Outstanding total in this band. */
  readonly total: number;
  /** Open credit sales in this band. */
  readonly salesCount: number;
}

/** GET /accounts-receivable/summary */
export interface ReceivableSummary {
  /** Total outstanding across all open credit sales. */
  readonly totalOutstanding: number;
  /** Distinct clients that owe money. */
  readonly debtorClients: number;
  /** Open credit sales still carrying a balance. */
  readonly openSalesCount: number;
  readonly buckets: readonly AgingBucket[];
}

/** GET /accounts-receivable/aging */
export interface AgingReport {
  /** The client the aging is scoped to, or null when overall. */
  readonly clientId: string | null;
  readonly buckets: readonly AgingBucket[];
  /** Total outstanding across all buckets. */
  readonly totalOutstanding: number;
}

/** One row of GET /accounts-receivable/debtors */
export interface DebtorRow {
  readonly clientId: string;
  readonly clientName: string;
  /** Total outstanding balance across the client's open credit sales. */
  readonly totalOwed: number;
  /** Number of open credit sales. */
  readonly openSalesCount: number;
  /** Creation date of the client's oldest open credit sale (ISO 8601 UTC). */
  readonly oldestSaleDate: string;
}

/** Sort field accepted by the debtors list. */
export type DebtorSortBy = 'totalOwed' | 'oldest';

/** GET /accounts-receivable/clients/{clientId} */
export interface ClientReceivable {
  readonly clientId: string;
  readonly clientName: string;
  /** Total outstanding balance. */
  readonly totalOwed: number;
  /** Number of open credit sales. */
  readonly openSalesCount: number;
  /**
   * The open credit sales, oldest first.
   *
   * The API echoes these as bare sale rows — full sales with the parties and
   * the lines left out — so they are typed as only what actually travels.
   */
  readonly sales: readonly OpenCreditSale[];
}

/** A ledger line is either a credit sale (charge) or an abono (payment). */
export type StatementEntryKind = 'SALE' | 'PAYMENT';

/** One chronological line of a client's account statement. */
export interface StatementEntry {
  readonly kind: StatementEntryKind;
  /** Sale id for a SALE line, payment id for a PAYMENT line. */
  readonly id: string;
  /** The sale this line belongs to. */
  readonly saleId: string;
  /** ISO 8601 UTC. */
  readonly date: string;
  /** Sale total. SALE lines only. */
  readonly total: number | null;
  /** Collected so far on the sale. SALE lines only. */
  readonly amountPaid: number | null;
  /** Outstanding balance of the sale. SALE lines only. */
  readonly balanceDue: number | null;
  /** Collection status of the sale. SALE lines only. */
  readonly status: SaleStatus | null;
  /** Abono amount. PAYMENT lines only. */
  readonly paymentAmount: number | null;
  /** Balance owed immediately after this event. */
  readonly runningBalance: number;
}

/** GET /accounts-receivable/clients/{clientId}/statement */
export interface ClientStatement {
  readonly clientId: string;
  readonly clientName: string;
  /** Balance carried into the listed period (0 without a range). */
  readonly openingBalance: number;
  readonly entries: readonly StatementEntry[];
  /** The client's current outstanding across its whole history. */
  readonly totalOutstanding: number;
}

export const STATEMENT_ENTRY_LABELS: Record<StatementEntryKind, string> = {
  SALE: 'Venta a crédito',
  PAYMENT: 'Abono',
};

/**
 * How urgent a band is. Derived from `fromDays` rather than the label so a
 * relabelled band on the API side still lands in the right severity.
 */
export type AgingSeverity = 'current' | 'due' | 'overdue' | 'critical';

export const AGING_SEVERITY_LABELS: Record<AgingSeverity, string> = {
  current: 'Al día',
  due: 'Vencida',
  overdue: 'Vencida +60',
  critical: 'Crítica',
};

export function agingSeverity(bucket: AgingBucket): AgingSeverity {
  if (bucket.fromDays >= 90) {
    return 'critical';
  }
  if (bucket.fromDays >= 60) {
    return 'overdue';
  }
  if (bucket.fromDays >= 30) {
    return 'due';
  }
  return 'current';
}

/** Human-readable span of a band, e.g. `0 a 30 días` / `90 días o más`. */
export function agingRangeLabel(bucket: AgingBucket): string {
  return bucket.toDays === null
    ? `${bucket.fromDays} días o más`
    : `${bucket.fromDays} a ${bucket.toDays} días`;
}
