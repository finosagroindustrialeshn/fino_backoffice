import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import { ImageDropzone } from '../../../../shared/components/image-dropzone/image-dropzone';
import {
  LocationPicker,
  type Coordinates,
} from '../../../../shared/components/location-picker/location-picker';
import type { Client, ClientPayload } from '../../models/client.model';
import { ClientDataClient } from '../../services/client-data';
import { ClientImageStorage } from '../../services/client-image-storage';

/** A client must be pinned to a real point — reject the unset 0,0 origin. */
function locationRequired(group: AbstractControl): ValidationErrors | null {
  const lat = group.get('latitude')?.value ?? 0;
  const lng = group.get('longitude')?.value ?? 0;
  return lat === 0 && lng === 0 ? { locationRequired: true } : null;
}

@Component({
  selector: 'app-client-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    ImageDropzone,
    InputNumberModule,
    InputTextModule,
    LocationPicker,
    SkeletonModule,
    TextareaModule,
  ],
  templateUrl: './client-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientForm implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clients = inject(ClientDataClient);
  private readonly storage = inject(ClientImageStorage);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly clientId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.clientId() !== null);

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  private readonly selectedFile = signal<File | null>(null);
  private readonly directUrl = signal<string | null>(null);
  private readonly imageCleared = signal(false);
  protected readonly existingImageUrl = signal<string | null>(null);

  protected readonly validateImage = (file: File): string | null =>
    this.storage.validate(file);

  protected readonly mapLat = signal(0);
  protected readonly mapLng = signal(0);

  protected readonly form = this.fb.group(
    {
      name: this.fb.control('', [Validators.required]),
      contactName: this.fb.control('', [Validators.required]),
      phone: this.fb.control('', [Validators.required]),
      address: this.fb.control(''),
      notes: this.fb.control(''),
      latitude: this.fb.control(0),
      longitude: this.fb.control(0),
    },
    { validators: locationRequired },
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.clientId.set(id);
      void this.loadClient(id);
    }
  }

  private async loadClient(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const client = await firstValueFrom(this.clients.get(id));
      this.fill(client);
    } catch (error) {
      this.loadError.set(
        this.toMessage(error, 'No se pudo cargar el cliente.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  private fill(client: Client): void {
    this.form.reset({
      name: client.name,
      contactName: client.contactName ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      notes: client.notes ?? '',
      latitude: client.latitude,
      longitude: client.longitude,
    });
    this.mapLat.set(client.latitude);
    this.mapLng.set(client.longitude);
    this.selectedFile.set(null);
    this.directUrl.set(null);
    this.imageCleared.set(false);
    this.existingImageUrl.set(client.imageUrl);
  }

  protected onCoordinates(coords: Coordinates): void {
    const lat = Number(coords.lat.toFixed(7));
    const lng = Number(coords.lng.toFixed(7));
    this.mapLat.set(lat);
    this.mapLng.set(lng);
    this.form.patchValue({ latitude: lat, longitude: lng });
  }

  protected onImageSelected(file: File): void {
    this.formError.set(null);
    this.selectedFile.set(file);
    this.directUrl.set(null);
    this.imageCleared.set(false);
  }

  protected onImageUrl(url: string): void {
    this.formError.set(null);
    this.directUrl.set(url);
    this.selectedFile.set(null);
    this.imageCleared.set(false);
  }

  protected onImageCleared(): void {
    this.selectedFile.set(null);
    this.directUrl.set(null);
    this.imageCleared.set(true);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    try {
      const file = this.selectedFile();
      let imageUrl: string | null;
      if (file) {
        imageUrl = await this.storage.upload(file);
      } else if (this.directUrl()) {
        imageUrl = this.directUrl();
      } else if (this.imageCleared()) {
        imageUrl = null;
      } else {
        imageUrl = this.existingImageUrl();
      }

      const raw = this.form.getRawValue();
      const base = {
        name: raw.name.trim(),
        contactName: this.emptyToNull(raw.contactName),
        phone: this.emptyToNull(raw.phone),
        address: this.emptyToNull(raw.address),
        notes: this.emptyToNull(raw.notes),
        latitude: raw.latitude,
        longitude: raw.longitude,
        imageUrl,
      };

      const id = this.clientId();
      if (id) {
        // Partial PATCH — isActive is owned by the list's activate toggle.
        await firstValueFrom(this.clients.update(id, base));
      } else {
        const payload: ClientPayload = { ...base, isActive: true };
        await firstValueFrom(this.clients.create(payload));
      }
      await this.router.navigate(['/clientes']);
    } catch (error) {
      this.formError.set(
        this.toMessage(error, 'No se pudo guardar el cliente.'),
      );
    } finally {
      this.saving.set(false);
    }
  }

  private emptyToNull(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private toMessage(error: unknown, fallback: string): string {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return fallback;
  }
}
