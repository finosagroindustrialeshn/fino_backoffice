import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type { Client, ClientPayload } from '../models/client.model';

@Injectable({ providedIn: 'root' })
export class ClientDataClient {
  private readonly api = inject(ApiClient);

  list(): Observable<Client[]> {
    return this.api.get<Client[]>('/clients');
  }

  get(id: string): Observable<Client> {
    return this.api.get<Client>(`/clients/${id}`);
  }

  create(dto: ClientPayload): Observable<Client> {
    return this.api.post<Client>('/clients', dto);
  }

  update(id: string, dto: Partial<ClientPayload>): Observable<Client> {
    return this.api.patch<Client>(`/clients/${id}`, dto);
  }

  setActive(id: string, isActive: boolean): Observable<Client> {
    return this.api.patch<Client>(`/clients/${id}`, { isActive });
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/clients/${id}`);
  }
}
