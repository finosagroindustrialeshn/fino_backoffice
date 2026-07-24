import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

let nextId = 0;

/** What the dropzone currently holds, ready to render. */
interface Selection {
  readonly label: string;
  /** Null while the file is only picked locally and not uploaded yet. */
  readonly href: string | null;
}

/**
 * Reusable document picker: dashed dropzone with drag & drop + click, showing
 * the chosen file by name rather than by preview — so it works for PDFs, not
 * just images. UI only: the parent owns validation (via `validate`) and the
 * actual upload (it receives the chosen `File`).
 */
@Component({
  selector: 'app-file-dropzone',
  templateUrl: './file-dropzone.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileDropzone {
  /** Existing file URL to show initially (edit mode). */
  readonly currentUrl = input<string | null>(null);
  /** `accept` attribute for the underlying file input. */
  readonly accept = input<string>('');
  /** Human-readable hint listing the accepted formats and size limit. */
  readonly hint = input<string>('');
  /** Accessible name for the field. */
  readonly label = input<string>('Archivo');
  /**
   * Classes sizing the dropzone, applied to both the empty and filled states so
   * the box keeps its shape once a file is chosen. Empty keeps its natural
   * height; pass an aspect ratio to match a neighbouring picker
   * (e.g. `aspect-[4/9] max-w-48 mx-auto`).
   */
  readonly shape = input<string>('');
  /** Returns an error message to reject a file, or null to accept it. */
  readonly validate = input<(file: File) => string | null>(() => null);

  readonly fileSelected = output<File>();
  /** A pasted external URL, used directly (no upload). */
  readonly urlSelected = output<string>();
  readonly invalid = output<string>();
  readonly cleared = output<void>();

  protected readonly inputId = `file-dropzone-${nextId++}`;

  protected readonly isDragging = signal(false);
  private readonly picked = signal<File | null>(null);
  private readonly pastedUrl = signal<string | null>(null);
  private readonly removed = signal(false);

  /** Falls back to natural padding when no shape is given. */
  protected readonly filledShape = computed(() => this.shape() || 'py-4');
  protected readonly emptyShape = computed(() => this.shape() || 'py-8');

  protected readonly selection = computed<Selection | null>(() => {
    if (this.removed()) {
      return null;
    }
    const file = this.picked();
    if (file) {
      return { label: file.name, href: null };
    }
    const url = this.pastedUrl() ?? this.currentUrl();
    return url ? { label: this.fileNameOf(url), href: url } : null;
  });

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.take(input.files?.[0]);
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
    this.take(event.dataTransfer?.files?.[0]);
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
    this.picked.set(null);
    this.pastedUrl.set(url);
    this.removed.set(false);
    this.urlSelected.emit(url);
  }

  protected clear(): void {
    this.picked.set(null);
    this.pastedUrl.set(null);
    this.removed.set(true);
    this.cleared.emit();
  }

  private take(file: File | undefined): void {
    if (!file) {
      return;
    }
    const error = this.validate()(file);
    if (error) {
      this.invalid.emit(error);
      return;
    }
    this.pastedUrl.set(null);
    this.picked.set(file);
    this.removed.set(false);
    this.fileSelected.emit(file);
  }

  /** Last path segment of a URL, falling back to the raw string. */
  private fileNameOf(url: string): string {
    try {
      const { pathname } = new URL(url);
      return decodeURIComponent(pathname.split('/').pop() || url);
    } catch {
      return url;
    }
  }
}
