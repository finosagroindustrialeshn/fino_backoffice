import { CurrencyPipe, DatePipe } from '@angular/common';
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
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { AuthSession } from '../../../../core/auth/auth-session';
import { ImageDropzone } from '../../../../shared/components/image-dropzone/image-dropzone';
import {
  LocationPicker,
  type Coordinates,
} from '../../../../shared/components/location-picker/location-picker';
import { UserDataClient } from '../../../users/services/user-data';
import {
  LAST_PURCHASE_STATUS_LABELS,
  LAST_PURCHASE_STATUS_SEVERITY,
  RTN_MAX_DIGITS,
  stripRtnSeparators,
  type ClientDetail,
  type ClientPayload,
  type LastPurchaseStatus,
  type LastPurchaseStatusSeverity,
} from '../../models/client.model';
import { ClientDataClient } from '../../services/client-data';
import { ClientImageStorage } from '../../services/client-image-storage';

/** Sellers are a bounded lookup for the "assigned seller" picker. */
const LOOKUP_SIZE = 100;

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
}

/** A client must be pinned to a real point — reject the unset 0,0 origin. */
function locationRequired(group: AbstractControl): ValidationErrors | null {
  const lat = group.get('latitude')?.value ?? 0;
  const lng = group.get('longitude')?.value ?? 0;
  return lat === 0 && lng === 0 ? { locationRequired: true } : null;
}

/**
 * RTN is optional, digits only, and capped by DIGIT count — not by character
 * count. The API accepts `0801-1990-123456` and strips the dashes, so a plain
 * 20-char cap would truncate a separated RTN before its last digits.
 */
function rtnFormat(control: AbstractControl): ValidationErrors | null {
  const raw = String(control.value ?? '').trim();
  if (raw.length === 0) {
    return null;
  }
  const digits = stripRtnSeparators(raw);
  if (!/^\d+$/.test(digits)) {
    return { rtnDigits: true };
  }
  return digits.length > RTN_MAX_DIGITS ? { rtnTooLong: true } : null;
}

@Component({
  selector: 'app-client-form',
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    ImageDropzone,
    InputNumberModule,
    InputTextModule,
    LocationPicker,
    SelectModule,
    SkeletonModule,
    TagModule,
    TextareaModule,
  ],
  templateUrl: './client-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientForm implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clients = inject(ClientDataClient);
  private readonly users = inject(UserDataClient);
  private readonly auth = inject(AuthSession);
  private readonly storage = inject(ClientImageStorage);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly clientId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.clientId() !== null);
  protected readonly rtnMaxDigits = RTN_MAX_DIGITS;

  /** Reassigning a cartera is ADMIN/SUPERVISOR only — a SELLER always owns what they register. */
  protected readonly canAssignSeller = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR';
  });

  /** The loaded client, kept for read-only detail (code, last purchase). */
  protected readonly client = signal<ClientDetail | null>(null);

  protected readonly sellerOptions = signal<SelectOption<string | null>[]>([
    { label: 'Sin asignar', value: null },
  ]);

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
      // Optional: most clients a seller visits are not registered taxpayers.
      rtn: this.fb.control('', [rtnFormat]),
      address: this.fb.control(''),
      notes: this.fb.control(''),
      latitude: this.fb.control(0),
      longitude: this.fb.control(0),
      assignedSellerId: this.fb.control<string | null>(null),
    },
    { validators: locationRequired },
  );

  ngOnInit(): void {
    if (this.canAssignSeller()) {
      void this.loadSellers();
    }
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.clientId.set(id);
      void this.loadClient(id);
    }
  }

  private async loadSellers(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.users.list({ role: 'SELLER', pageSize: LOOKUP_SIZE }),
      );
      this.sellerOptions.set([
        { label: 'Sin asignar', value: null },
        ...result.items.map((user) => ({
          label: user.fullName,
          value: user.id,
        })),
      ]);
    } catch {
      // Picker keeps only "unassigned" if the lookup fails.
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

  private fill(client: ClientDetail): void {
    this.client.set(client);
    this.form.reset({
      name: client.name,
      contactName: client.contactName ?? '',
      phone: client.phone ?? '',
      rtn: client.rtn ?? '',
      address: client.address ?? '',
      notes: client.notes ?? '',
      latitude: client.latitude,
      longitude: client.longitude,
      assignedSellerId: client.assignedSellerId,
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
        // Send digits only so what we store matches what the API echoes back.
        rtn: this.emptyToNull(stripRtnSeparators(raw.rtn)),
        address: this.emptyToNull(raw.address),
        notes: this.emptyToNull(raw.notes),
        latitude: raw.latitude,
        longitude: raw.longitude,
        imageUrl,
        // A SELLER may not assign — the API always makes them the owner, and
        // sending the field at all would be rejected as CLIENT_REASSIGN_FORBIDDEN.
        ...(this.canAssignSeller()
          ? { assignedSellerId: raw.assignedSellerId }
          : {}),
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

  protected lastPurchaseLabel(status: LastPurchaseStatus): string {
    return LAST_PURCHASE_STATUS_LABELS[status];
  }

  protected lastPurchaseSeverity(
    status: LastPurchaseStatus,
  ): LastPurchaseStatusSeverity {
    return LAST_PURCHASE_STATUS_SEVERITY[status];
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
