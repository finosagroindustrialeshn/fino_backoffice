import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Reusable image picker: dashed dropzone with drag & drop + click, preview with
 * change/remove overlay. UI only — the parent owns validation (via the
 * `validate` input) and the actual upload (it receives the chosen `File`).
 */
@Component({
  selector: 'app-image-dropzone',
  templateUrl: './image-dropzone.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageDropzone {
  /** Existing image URL to show initially (edit mode). */
  readonly previewUrl = input<string | null>(null);
  /**
   * Classes sizing the dropzone, applied to both the empty and filled states so
   * the box keeps its shape when an image is picked. Empty keeps the default
   * wide banner; pass an aspect ratio for portrait art
   * (e.g. `aspect-[4/9] max-w-48 mx-auto`).
   */
  readonly shape = input<string>('');
  /** Returns an error message to reject a file, or null to accept it. */
  readonly validate = input<(file: File) => string | null>(() => null);

  readonly fileSelected = output<File>();
  /** A pasted external image URL, used directly (no upload). */
  readonly urlSelected = output<string>();
  readonly invalid = output<string>();
  readonly cleared = output<void>();

  protected readonly isDragging = signal(false);
  private readonly localPreview = signal<string | null>(null);
  private readonly pastedUrl = signal<string | null>(null);
  private readonly removed = signal(false);
  private objectUrl: string | null = null;

  /** Falls back to the original fixed height / padding when no shape is given. */
  protected readonly filledShape = computed(() => this.shape() || 'h-48');
  protected readonly emptyShape = computed(() => this.shape() || 'py-10');

  protected readonly preview = computed(() =>
    this.removed()
      ? null
      : (this.localPreview() ?? this.pastedUrl() ?? this.previewUrl()),
  );

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.accept(input.files?.[0]);
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    this.accept(event.dataTransfer?.files?.[0]);
  }

  protected applyUrl(raw: string): void {
    const url = raw.trim();
    if (!url) {
      return;
    }
    if (!/^https?:\/\/.+/i.test(url)) {
      this.invalid.emit('Ingresá un enlace válido (http/https).');
      return;
    }
    this.setObjectUrl(null);
    this.localPreview.set(null);
    this.pastedUrl.set(url);
    this.removed.set(false);
    this.urlSelected.emit(url);
  }

  protected clear(): void {
    this.setObjectUrl(null);
    this.localPreview.set(null);
    this.pastedUrl.set(null);
    this.removed.set(true);
    this.cleared.emit();
  }

  private accept(file: File | undefined): void {
    if (!file) {
      return;
    }
    const error = this.validate()(file);
    if (error) {
      this.invalid.emit(error);
      return;
    }
    this.pastedUrl.set(null);
    this.setObjectUrl(URL.createObjectURL(file));
    this.localPreview.set(this.objectUrl);
    this.removed.set(false);
    this.fileSelected.emit(file);
  }

  /** Owns the single live blob URL, revoking the previous one. */
  private setObjectUrl(url: string | null): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
    this.objectUrl = url;
  }
}
