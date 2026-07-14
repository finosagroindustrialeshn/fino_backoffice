import { Injectable } from '@angular/core';

export interface ImageOptimizeOptions {
  /** Longest side, in px. The image is downscaled to fit; never upscaled. */
  readonly maxDimension: number;
  /** Lossy encoder quality, 0–1. */
  readonly quality: number;
  /** Output MIME type. */
  readonly type: string;
}

const DEFAULTS: ImageOptimizeOptions = {
  maxDimension: 1600,
  quality: 0.8,
  type: 'image/webp',
};

/**
 * Client-side image optimizer: downscales to a max dimension and re-encodes
 * (WebP by default) to cut file weight before upload. Zero-dependency, built
 * on Canvas — runs entirely in the browser. If the browser can't produce a
 * smaller file (or lacks WebP encoding), the original file is returned
 * unchanged, so callers can always trust the result is safe to upload.
 */
@Injectable({ providedIn: 'root' })
export class ImageOptimizer {
  async optimize(
    file: File,
    options?: Partial<ImageOptimizeOptions>,
  ): Promise<File> {
    const { maxDimension, quality, type } = { ...DEFAULTS, ...options };

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Non-decodable image — leave it to the upload/validation layer.
      return file;
    }

    try {
      const scale = Math.min(
        1,
        maxDimension / Math.max(bitmap.width, bitmap.height),
      );
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const blob = await this.render(bitmap, width, height, type, quality);
      if (!blob || blob.size >= file.size) {
        return file;
      }

      return new File([blob], this.rename(file.name, blob.type), {
        type: blob.type,
      });
    } finally {
      bitmap.close();
    }
  }

  private async render(
    bitmap: ImageBitmap,
    width: number,
    height: number,
    type: string,
    quality: number,
  ): Promise<Blob | null> {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas.convertToBlob({ type, quality });
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), type, quality),
    );
  }

  private rename(name: string, type: string): string {
    const base = name.replace(/\.[^.]+$/, '');
    const extension = type.split('/')[1] ?? 'webp';
    return `${base}.${extension}`;
  }
}
