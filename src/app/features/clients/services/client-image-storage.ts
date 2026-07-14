import { inject, Injectable } from '@angular/core';

import { ImageOptimizer } from '../../../core/media/image-optimizer';
import { SupabaseService } from '../../../core/supabase/supabase.client';

/** Bucket created for client storefront photos (public, 5MB, image/*). */
const BUCKET = 'client-photos';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type AllowedType = (typeof ALLOWED_TYPES)[number];

/**
 * Uploads client photos to Supabase Storage and returns the public URL to
 * persist in the API's `imageUrl` field. The backend never receives the file
 * itself — only the resulting URL.
 */
@Injectable({ providedIn: 'root' })
export class ClientImageStorage {
  private readonly supabase = inject(SupabaseService);
  private readonly optimizer = inject(ImageOptimizer);

  /**
   * Selection-time guard. Only the format is checked here — size is enforced
   * AFTER optimization (see upload), since a heavy source photo is expected to
   * shrink well below the limit once downscaled and re-encoded to WebP.
   */
  validate(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type as AllowedType)) {
      return 'Formato no admitido. Usa JPG, PNG o WEBP.';
    }
    return null;
  }

  async upload(file: File): Promise<string> {
    // Downscale + re-encode to WebP before hitting the network. Falls back to
    // the original file if the browser can't produce a smaller one.
    const optimized = await this.optimizer.optimize(file);

    // The 5MB ceiling (also enforced by the bucket) applies to what we send.
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
