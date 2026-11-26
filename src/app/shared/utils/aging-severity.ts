/**
 * How urgent an aging band is. Derived from `fromDays` rather than the label so
 * a relabelled band on the API side still lands in the right severity.
 *
 * Shared because accounts-receivable and the dashboard both classify bands,
 * and features do not import from each other.
 */
export type AgingSeverity = 'current' | 'due' | 'overdue' | 'critical';

export function agingSeverity(bucket: { readonly fromDays: number }): AgingSeverity {
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
