import { inject, Injectable } from '@angular/core';

import { ImageOptimizer } from '../../../core/media/image-optimizer';
import { SupabaseService } from '../../../core/supabase/supabase.client';

/** Bucket for product photos (public, 5MB, image/*). */
const BUCKET = 'product-photos';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type AllowedType = (typeof ALLOWED_TYPES)[number];

/**
 * Uploads product photos to Supabase Storage and returns the public URL to
 * persist in the API's `imageUrl` field. The backend never receives the file
 * itself — only the resulting URL.
 */
@Injectable({ providedIn: 'root' })
export class ProductImageStorage {
  private readonly supabase = inject(SupabaseService);
  private readonly optimizer = inject(ImageOptimizer);

  /** Selection-time guard: format only — size is enforced after optimization. */
  validate(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type as AllowedType)) {
      return 'Formato no admitido. Usa JPG, PNG o WEBP.';
    }
    return null;
  }

  async upload(file: File): Promise<string> {
    const optimized = await this.optimizer.optimize(file);

    if (optimized.size > MAX_BYTES) {
      throw new Error(
        'La imagen sigue superando los 5 MB tras optimizarla. Prueba con una más pequeña.',
      );
    }

    const extension = optimized.name.split('.').pop()?.toLowerCase() || 'webp';
    const path = `${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.client.storage
      .from(BUCKET)
      .upload(path, optimized, { contentType: optimized.type, upsert: false });

    if (error) {
      throw new Error(`No se pudo subir la imagen: ${error.message}`);
    }

    const { data } = this.supabase.client.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return data.publicUrl;
  }
}
