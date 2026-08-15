import type { ReturnLineView } from '../components/return-lines-table/return-lines-table';
import type { ReturnSummaryView } from '../components/return-summary/return-summary';
import type { VerificationLine } from '../components/return-verification-editor/return-verification-editor';
import type { Return, ReturnItem } from '../models/return.model';

/** Resolves the ids a return stores into the names a screen shows. */
export interface ReturnNames {
  userName(userId: string | null): string;
  productName(productId: string): string;
  reasonName(reasonId: string | null): string;
}

export function toSummaryView(
  header: Return,
  names: ReturnNames,
): ReturnSummaryView {
  return {
    sellerName: names.userName(header.sellerId),
    date: header.date,
    status: header.status,
    declaredBy: names.userName(header.createdById),
    confirmedBy: header.confirmedById
      ? names.userName(header.confirmedById)
      : null,
    confirmedAt: header.confirmedAt,
    notes: header.notes,
  };
}

/**
 * While DRAFT the whole quantity sits in `quantityReturned`, so the line total
 * is the sum of both columns. Reading only `quantityReturned` would silently
 * under-count the write-off cap after a confirmed return is reopened.
 */
export function toVerificationLines(
  items: readonly ReturnItem[],
  names: ReturnNames,
): VerificationLine[] {
  return items.map((item) => ({
    productId: item.productId,
    name: names.productName(item.productId),
    declared: item.quantityReturned + item.quantityMerma,
    flaggedBySeller: item.flaggedBySeller,
    sellerNote: item.sellerNote,
    quantityMerma: item.quantityMerma,
    reasonId: item.reasonId,
  }));
}

export function toConfirmedLines(
  items: readonly ReturnItem[],
  names: ReturnNames,
): ReturnLineView[] {
  return items.map((item) => ({
    productId: item.productId,
    name: names.productName(item.productId),
    quantityReturned: item.quantityReturned,
    quantityMerma: item.quantityMerma,
    reason: item.reasonId ? names.reasonName(item.reasonId) : null,
    flaggedBySeller: item.flaggedBySeller,
    sellerNote: item.sellerNote,
  }));
}
