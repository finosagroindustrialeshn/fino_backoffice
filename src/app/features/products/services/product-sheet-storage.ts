import { inject, Injectable } from '@angular/core';

import { SupabaseService } from '../../../core/supabase/supabase.client';

/** Bucket for product technical sheets (public, 10MB, PDF or image). */
const BUCKET = 'product-sheets';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

type AllowedType = (typeof ALLOWED_TYPES)[number];

/** File types the picker offers, as an `accept` attribute value. */
export const SHEET_ACCEPT = ALLOWED_TYPES.join(',');

/**
 * Uploads product technical sheets to Supabase Storage and returns the public
 * URL to persist in the API's `technicalSheetUrl` field.
 *
 * Unlike product photos, sheets are stored verbatim — no image optimization.
 * A technical sheet is a document read for its fine print, and recompressing
 * it would degrade exactly the detail it exists to carry.
 */
@Injectable({ providedIn: 'root' })
export class ProductSheetStorage {
  private readonly supabase = inject(SupabaseService);

  validate(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type as AllowedType)) {
      return 'Formato no admitido. Usa PDF, JPG, PNG o WEBP.';
    }
    if (file.size > MAX_BYTES) {
      return 'El archivo supera los 10 MB.';
    }
    return null;
  }

  async upload(file: File): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase() || 'pdf';
    const path = `${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.client.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      throw new Error(`No se pudo subir la ficha técnica: ${error.message}`);
    }

    const { data } = this.supabase.client.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return data.publicUrl;
  }
}
