import { signal } from '@angular/core';

/**
 * Tracks how a file field was filled in: a newly picked File, a pasted URL, an
 * explicit removal, or the value the record already had. Resolving it yields
 * the URL to persist, uploading only when a new File was actually chosen.
 */
export class FileSelection {
  private readonly picked = signal<File | null>(null);
  private readonly pastedUrl = signal<string | null>(null);
  private readonly removed = signal(false);

  /** The URL the record currently holds — bound as the picker's preview. */
  readonly existing = signal<string | null>(null);

  /** Re-seeds the selection from a loaded record, dropping any pending choice. */
  reset(existing: string | null): void {
    this.picked.set(null);
    this.pastedUrl.set(null);
    this.removed.set(false);
    this.existing.set(existing);
  }

  select(file: File): void {
    this.picked.set(file);
    this.pastedUrl.set(null);
    this.removed.set(false);
  }

  useUrl(url: string): void {
    this.pastedUrl.set(url);
    this.picked.set(null);
    this.removed.set(false);
  }

  clear(): void {
    this.picked.set(null);
    this.pastedUrl.set(null);
    this.removed.set(true);
  }

  /**
   * Returns the URL to persist: uploads a freshly picked file, otherwise keeps
   * the pasted URL, or null when the field was cleared.
   */
  async resolve(upload: (file: File) => Promise<string>): Promise<string | null> {
    const file = this.picked();
    if (file) {
      return upload(file);
    }
    return this.pastedUrl() ?? (this.removed() ? null : this.existing());
  }
}
